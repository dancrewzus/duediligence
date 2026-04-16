# Streaming + reporte enriquecido + atribución — Design

**Fecha:** 2026-04-16
**Proyecto:** Due Diligence Técnico (challenge Nerdearla Chile 2026)
**Autor:** Daniel Rodríguez (@dancrewzus)

## Contexto

El MVP actual hace el análisis de due diligence en una llamada HTTP bloqueante (`POST /api/analyze`) y devuelve un reporte con scores numéricos sin justificación. Tres problemas:

1. **UX bloqueante**: el frontend solo muestra un spinner durante 2-4 minutos. Sin progreso visible, parece colgado.
2. **Reporte superficial**: `stackArquitectura: 6/10` no le dice nada a un inversor. Falta el *porqué* y la ficha técnica concreta.
3. **Sin atribución**: el sitio no menciona al autor ni el contexto del challenge.

Este spec cubre las tres mejoras como un solo entregable coherente.

## Objetivos

- **Streaming end-to-end**: el frontend refleja progreso del agente en vivo (stages + tokens del LLM).
- **Reporte de inversor**: cada score con justificación de evidencia concreta; ficha técnica categorizada; métricas clave del repo.
- **Atribución visible**: footer persistente con autor, link a GitHub del autor y del repo del challenge.

## Fuera de alcance

- Cambio de modelo LLM (seguimos con Ollama local).
- Migración a WebSockets u otro transporte.
- Rediseño visual del dark theme.
- Autenticación / multi-usuario.
- Exportar reporte a PDF.

---

## Sección 1 — Streaming backend ⇄ frontend

### Transporte

**Server-Sent Events (SSE)** sobre HTTP. Justificación:
- Unidireccional (server→client) — único sentido requerido.
- `EventSource` nativo en browser, sin dependencias nuevas.
- Reconexión automática built-in.
- Compatible con el middleware `cors` de Hono ya en uso.

### Endpoint

```
GET /api/analyze/stream?repoUrl=<url>
Content-Type: text/event-stream
```

El `POST /api/analyze` existente se elimina — el frontend nuevo solo usa el streaming. El CLI ([src/index.ts](src/index.ts)) sigue llamando al agente directamente sin pasar por HTTP, así que no se ve afectado.

### Eventos SSE

Cada evento SSE tiene un `event:` con su tipo y un `data:` con JSON.

| Event | Payload | Emitido cuando |
|---|---|---|
| `stage` | `{ stage: string, label: string }` | Se entra a una fase nueva |
| `tool` | `{ tool: string, status: "start" \| "complete" \| "error" }` | Inicio/fin de tool call del agente |
| `token` | `{ text: string }` | Cada chunk de texto del LLM |
| `report` | `AnalysisReport` | Reporte final parseado |
| `error` | `{ message: string }` | Fallo (agente, parse, red) |
| `done` | `{}` | Cierre del stream |

**Stages** (en orden típico):
1. `starting` — "Iniciando análisis"
2. `fetching_metadata` — "Leyendo estructura del repo"
3. `analyzing_activity` — "Analizando actividad del equipo"
4. `evaluating` — "Evaluando dimensiones técnicas"
5. `generating_report` — "Generando reporte final"
6. `done` — "Análisis completo"

### Mapeo tool → stage

Derivamos el `stage` actual a partir del `tool` que arranca:

| Tool | Stage |
|---|---|
| `analyze_repo_structure` | `fetching_metadata` |
| MCP GitHub (`list_commits`, `list_contributors`, `list_pull_requests`, `list_issues`) | `analyzing_activity` |
| (cualquier otro tool o razonamiento puro) | `evaluating` |

Cuando el agente empieza a emitir el bloque JSON final, pasamos a `generating_report`.

### Implementación backend

En [src/server.ts](src/server.ts):

```ts
app.get('/api/analyze/stream', async (c) => {
  const repoUrl = c.req.query('repoUrl')
  const parsed = parseRepoUrl(repoUrl)
  if (!parsed) return c.json({ error: '...' }, 400)

  return streamSSE(c, async (stream) => {
    const { agent } = await getAgent()
    const prompt = `Analiza el repositorio ${parsed.owner}/${parsed.repo}...`

    await stream.writeSSE({ event: 'stage', data: JSON.stringify({ stage: 'starting', label: 'Iniciando análisis' }) })

    let buffer = ''
    for await (const evt of agent.stream(prompt)) {
      // evt.type discrimination: 'token' | 'tool_call' | 'tool_result' | ...
      if (evt.type === 'tool_call') {
        const stage = mapToolToStage(evt.tool)
        await stream.writeSSE({ event: 'stage', data: JSON.stringify({ stage, label: LABELS[stage] }) })
        await stream.writeSSE({ event: 'tool', data: JSON.stringify({ tool: evt.tool, status: 'start' }) })
      }
      if (evt.type === 'tool_result') {
        await stream.writeSSE({ event: 'tool', data: JSON.stringify({ tool: evt.tool, status: 'complete' }) })
      }
      if (evt.type === 'token') {
        buffer += evt.text
        await stream.writeSSE({ event: 'token', data: JSON.stringify({ text: evt.text }) })
      }
    }

    await stream.writeSSE({ event: 'stage', data: JSON.stringify({ stage: 'generating_report', label: 'Generando reporte final' }) })
    const report = extractReport(buffer)
    if (report) {
      report.repo = `${parsed.owner}/${parsed.repo}`
      report.fecha = new Date().toISOString()
      persistReport(report)
      await stream.writeSSE({ event: 'report', data: JSON.stringify(report) })
    } else {
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: 'No se pudo parsear el reporte' }) })
    }
    await stream.writeSSE({ event: 'done', data: '{}' })
  })
})
```

Nota: el shape exacto de los eventos del `agent.stream()` del Strands SDK se valida en el plan de implementación. La arquitectura no cambia aunque cambien los nombres de campos.

### Implementación frontend

En [web/src/components/AnalysisForm.astro](web/src/components/AnalysisForm.astro):

```ts
const eventSource = new EventSource(`${API_BASE}/api/analyze/stream?repoUrl=${encodeURIComponent(url)}`)

eventSource.addEventListener('stage', (e) => updateTimeline(JSON.parse(e.data)))
eventSource.addEventListener('tool', (e) => updateToolBadge(JSON.parse(e.data)))
eventSource.addEventListener('token', (e) => appendToken(JSON.parse(e.data).text))
eventSource.addEventListener('report', (e) => renderReport(JSON.parse(e.data)))
eventSource.addEventListener('error', (e) => showError(JSON.parse(e.data).message))
eventSource.addEventListener('done', () => eventSource.close())
```

**UI de progreso** (reemplaza el `#loading` actual):
- **Timeline vertical** con los 5 stages. Cada item tiene tres estados visuales:
  - `pending` — círculo hueco, label en `--text-muted`
  - `running` — spinner + label en `--text-primary`
  - `done` — check verde + label en `--text-secondary`
- **Panel plegable "🧠 Razonamiento en vivo"** debajo del timeline:
  - Colapsado por default.
  - Al expandir, muestra los `token` events concatenados en un `<pre>` con scroll auto al final.
  - Fuente mono (`ui-monospace`), fondo `--bg-secondary`, altura máx `300px`.

### Manejo de errores

- Si `EventSource.onerror` dispara antes de `done`, mostramos error de red.
- Si llega evento `error`, mostramos el mensaje del payload.
- Si el stream termina sin evento `report`, error "Análisis incompleto".

---

## Sección 2 — Reporte enriquecido

### Nuevo schema

Actualiza [src/types/index.ts](src/types/index.ts):

```ts
export interface ScoreDimension {
  score: number              // 0-10
  justificacion: string      // 2-3 oraciones con evidencia concreta
}

export interface TechStack {
  frontend: string[]
  backend: string[]
  database: string[]
  infraestructura: string[]
  testing: string[]
  cicd: string[]
}

export interface RepoMetrics {
  stars: number
  forks: number
  contributorsActivos30d: number
  commitsUltimoMes: number
  ultimoCommitHace: string         // "3 días", "2 meses"
  prsAbiertos: number
  prsMergeadosUltimoMes: number
  issuesAbiertos: number
  tieneTests: boolean
  edadProyecto: string             // "1 año 3 meses"
}

export interface AnalysisReport {
  repo: string
  fecha: string
  scores: {
    stackArquitectura: ScoreDimension
    calidadCodigo: ScoreDimension
    escalabilidad: ScoreDimension
    saludEquipo: ScoreDimension
    seguridad: ScoreDimension
    madurezDependencias: ScoreDimension
  }
  tecnologias: TechStack
  metricas: RepoMetrics
  deudaTecnica: 'Alta' | 'Media' | 'Baja'
  deudaJustificacion: string
  scoreTotal: number
  riesgos: string[]               // Top 3
  fortalezas: string[]            // Top 3
  recomendacion: string
  resumen: string
}
```

`AnalysisScores` (la interfaz vieja con números planos) se reemplaza — no hay compat shim.

### Cambios en el agente

En [src/agent.ts](src/agent.ts), actualizar `SYSTEM_PROMPT`:

- Nuevo bloque JSON template en el prompt con todos los campos del schema ampliado.
- Instrucción explícita: *"En cada `justificacion` cita evidencia concreta: nombre de dependencia con versión, número de commits, antigüedad del último commit, archivo de config presente/ausente. Si no tienes el dato, dilo — nunca inventes."*
- Instrucción para `tecnologias`: *"Inferido del `package.json`, archivos de config y estructura de carpetas. Si una categoría está vacía (ej. no hay base de datos detectable), devolvé array vacío `[]`."*
- Instrucción para `metricas`: *"Calculá los agregados desde las tools del MCP de GitHub antes de emitir el JSON. No dejes campos en 0 por pereza — si el dato no está disponible, poné -1 y explícalo en `resumen`."*

### Cambios en el frontend

**Componentes modificados/nuevos** en [web/src/components/](web/src/components/):

- `ScoreBar.astro` → agrega justificación debajo de la barra. Texto `0.85rem`, color `--text-secondary`, line-height `1.6`. Siempre visible.
- `TechStackCard.astro` (nuevo) — grid de categorías. Cada categoría es un bloque con título + chips horizontales. Categoría con array vacío se oculta.
- `MetricsCard.astro` (nuevo) — grid responsive (4 cols desktop, 2 tablet, 1 mobile) de "metric tiles": número grande (tabular-nums) + label pequeño en mayúsculas. `tieneTests` se renderiza como chip verde/rojo.
- `ReportCard.astro` — actualizado para orquestar el nuevo orden de render.

**Orden de render** (top → bottom):
1. Header: repo + fecha + score total.
2. `TechStackCard` — *"¿qué están usando?"*
3. `MetricsCard` — *"¿está vivo?"*
4. Dimensiones (6 × `ScoreBar` con justificación) — *"¿qué tan bien?"*
5. Deuda técnica (badge + `deudaJustificacion`).
6. Riesgos / Fortalezas (2 columnas).
7. Recomendación.

El render client-side en `AnalysisForm.astro` tiene que mantenerse alineado con los componentes server-side (mismo markup). Cualquier dato de texto que venga del LLM pasa por `escapeHtml()` antes de inyectarse — la función ya existe.

### Portfolio retrocompat

**Decisión: borrar `portfolio.json` en deploy.** El data es de desarrollo local del challenge, no hay usuarios reales. La página Portfolio lee `portfolio.json`; si está vacío muestra el empty state actual. No agregamos lógica de migración.

---

## Sección 3 — Atribución

### Ubicación

Footer persistente en [web/src/layouts/Layout.astro](web/src/layouts/Layout.astro), dentro del `.container`, después del `<slot />`.

### Contenido

```astro
<footer class="site-footer">
  <p>
    Due Diligence Técnico — desarrollado por
    <a href="https://github.com/dancrewzus" target="_blank" rel="noopener">Daniel Rodríguez</a>
    para el challenge <em>"Construye con Strands Agents"</em> de AWS en
    <strong>Nerdearla Chile 2026</strong>.
  </p>
  <p>
    <a href="https://github.com/dancrewzus/duediligence" target="_blank" rel="noopener">
      Ver en GitHub →
    </a>
  </p>
</footer>
```

### Estilo

En [web/src/styles/global.css](web/src/styles/global.css) o dentro del `Layout.astro`:

- `border-top: 1px solid var(--border-subtle)` + `margin-top: 64px` + `padding: 24px 0`.
- `text-align: center`, `font-size: 0.85rem`, `color: var(--text-muted)`.
- Links en `--accent-blue`, hover underline.
- Segundo `<p>` con `margin-top: 8px`.
- Aparece en las dos páginas (`/` y `/portfolio`) automáticamente por el Layout.

---

## Archivos afectados (resumen)

| Archivo | Cambio |
|---|---|
| [src/types/index.ts](src/types/index.ts) | Schema ampliado (`ScoreDimension`, `TechStack`, `RepoMetrics`, `AnalysisReport`) |
| [src/agent.ts](src/agent.ts) | System prompt con nuevo JSON template y directivas de evidencia |
| [src/server.ts](src/server.ts) | Endpoint SSE `/api/analyze/stream`; eliminar `POST /api/analyze` |
| [web/src/components/AnalysisForm.astro](web/src/components/AnalysisForm.astro) | EventSource + timeline + panel razonamiento + render enriquecido |
| [web/src/components/ScoreBar.astro](web/src/components/ScoreBar.astro) | Justificación debajo de la barra |
| [web/src/components/TechStackCard.astro](web/src/components/TechStackCard.astro) | **Nuevo** |
| [web/src/components/MetricsCard.astro](web/src/components/MetricsCard.astro) | **Nuevo** |
| [web/src/components/ReportCard.astro](web/src/components/ReportCard.astro) | Orquestar nuevo orden |
| [web/src/layouts/Layout.astro](web/src/layouts/Layout.astro) | Footer de atribución |
| [web/src/styles/global.css](web/src/styles/global.css) | Estilos timeline, tech chips, metric tiles, footer |
| `portfolio.json` | Borrar (dev data, sin migración) |

## Trade-offs reconocidos

- **Latencia**: el reporte ampliado requiere ~3× más tokens. En `llama3.1:8b` local puede tomar 2-4 minutos. El streaming mitiga la percepción (el usuario ve progreso continuo), pero la latencia absoluta sube. Si se vuelve inaceptable, el camino es cambiar el modelo en `src/agent.ts` — el resto del sistema no cambia.
- **Alucinación en modelos 8B**: los modelos locales pequeños a veces inventan dependencias o fechas. La directiva *"si no tienes el dato, poné -1 / decilo en resumen"* ayuda pero no elimina el riesgo. Para el challenge es aceptable; en producción se cambiaría a un modelo más grande.
- **Parseo del JSON desde el stream de tokens**: el backend acumula tokens en un buffer y regexea el bloque ```json al final. Si el modelo emite JSON malformado, cae al branch `error` del SSE. No intentamos auto-reparar.

## Criterios de éxito

1. El usuario ingresa un URL de GitHub y ve progreso continuo (timeline actualizándose, tokens fluyendo si expande el panel).
2. El reporte final incluye justificación en cada score, ficha técnica categorizada y métricas clave del repo.
3. El footer aparece en ambas páginas con los links correctos.
4. El servidor no queda en estado inconsistente si el browser cierra el `EventSource` mid-stream.
