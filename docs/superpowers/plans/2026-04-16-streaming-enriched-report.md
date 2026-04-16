# Streaming + Reporte Enriquecido + Atribución — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar streaming SSE end-to-end entre el agente Strands y el frontend Astro, ampliar el schema del reporte con justificaciones + ficha técnica + métricas, y agregar un footer de atribución.

**Architecture:** `GET /api/analyze/stream` usa `streamSSE` de Hono y consume `agent.stream()` del Strands SDK. Traduce eventos del SDK (`beforeToolCallEvent`, `modelStreamUpdateEvent` con `textDelta`, `agentResultEvent`) a eventos SSE tipados (`stage`, `tool`, `token`, `report`, `error`, `done`). El frontend usa `EventSource` nativo, renderiza un timeline de stages + panel plegable con tokens en vivo, y al llegar el evento `report` renderiza el reporte enriquecido. El endpoint `POST /api/analyze` se elimina.

**Tech Stack:** TypeScript ESM, `@strands-agents/sdk`, Hono + `streamSSE`, Astro 5 + EventSource del browser, CSS vanilla.

**Nota sobre tests:** el proyecto no tiene framework de testing instalado. Instalarlo sería scope creep para un challenge. La verificación se hace con: (a) scripts `tsx` desechables para funciones puras, (b) `curl` contra el SSE, (c) el navegador para la UI. Cada tarea incluye comandos de verificación concretos con el output esperado.

---

## Archivos afectados

| Tipo | Archivo | Responsabilidad |
|---|---|---|
| Modify | [src/types/index.ts](src/types/index.ts) | Schema ampliado (`ScoreDimension`, `TechStack`, `RepoMetrics`, nuevo `AnalysisReport`) |
| Modify | [src/agent.ts](src/agent.ts) | Nuevo `SYSTEM_PROMPT` con JSON template ampliado |
| Modify | [src/session/portfolio.ts](src/session/portfolio.ts) | `persistReport` usa el nuevo shape |
| Modify | [src/server.ts](src/server.ts) | Reemplaza POST bloqueante con `GET /api/analyze/stream` SSE |
| Create | [src/server/stream-events.ts](src/server/stream-events.ts) | `mapToolToStage`, `STAGE_LABELS`, `extractReport` — funciones puras testeables |
| Modify | [web/src/components/ScoreBar.astro](web/src/components/ScoreBar.astro) | Acepta `justificacion`, la renderiza debajo de la barra |
| Create | [web/src/components/TechStackCard.astro](web/src/components/TechStackCard.astro) | Render de ficha técnica por categoría |
| Create | [web/src/components/MetricsCard.astro](web/src/components/MetricsCard.astro) | Grid de métricas del repo |
| Modify | [web/src/components/ReportCard.astro](web/src/components/ReportCard.astro) | Nuevo orden + consumo del schema ampliado |
| Modify | [web/src/components/AnalysisForm.astro](web/src/components/AnalysisForm.astro) | EventSource + timeline + panel razonamiento + render client-side enriquecido |
| Modify | [web/src/layouts/Layout.astro](web/src/layouts/Layout.astro) | Footer de atribución persistente |
| Modify | [web/src/styles/global.css](web/src/styles/global.css) | Estilos: timeline, chips, metric tiles, footer |
| Delete | `portfolio.json` | Se resetea (dev data, sin migración) |

---

## Task 1: Actualizar types con el schema ampliado

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Reemplazar el contenido del archivo**

Reemplaza [src/types/index.ts](src/types/index.ts) completo con:

```ts
export interface RepoMetadata {
  name: string
  fullName: string
  description: string | null
  language: string | null
  stars: number
  forks: number
  openIssues: number
  createdAt: string
  updatedAt: string
  pushedAt: string
  defaultBranch: string
  size: number
}

export interface RepoStructure {
  metadata: RepoMetadata
  rootFiles: string[]
  packageJson: Record<string, unknown> | null
  tsconfig: Record<string, unknown> | null
  hasReadme: boolean
  readmeLength: number
  hasEslint: boolean
  hasPrettier: boolean
  hasDockerfile: boolean
  hasDockerCompose: boolean
  hasCiCd: boolean
  ciCdFiles: string[]
}

export interface ScoreDimension {
  score: number
  justificacion: string
}

export interface AnalysisScores {
  stackArquitectura: ScoreDimension
  calidadCodigo: ScoreDimension
  escalabilidad: ScoreDimension
  saludEquipo: ScoreDimension
  seguridad: ScoreDimension
  madurezDependencias: ScoreDimension
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
  ultimoCommitHace: string
  prsAbiertos: number
  prsMergeadosUltimoMes: number
  issuesAbiertos: number
  tieneTests: boolean
  edadProyecto: string
}

export interface AnalysisReport {
  repo: string
  fecha: string
  scores: AnalysisScores
  tecnologias: TechStack
  metricas: RepoMetrics
  deudaTecnica: 'Alta' | 'Media' | 'Baja'
  deudaJustificacion: string
  scoreTotal: number
  riesgos: string[]
  fortalezas: string[]
  recomendacion: string
  resumen: string
}

export interface PortfolioEntry {
  repo: string
  fecha: string
  score: number
  resumen: string
}
```

- [ ] **Step 2: Verificar que TypeScript compila los types aislados**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "src/types"`
Expected: sin output (los types no tienen errores propios; los errores vendrán de consumidores en tareas siguientes — es esperado).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): expand AnalysisReport schema with justifications, tech stack, metrics"
```

---

## Task 2: Actualizar `persistReport` para el nuevo shape

El shape de `AnalysisReport` cambió (`scoreTotal`, `resumen`, `repo` siguen existiendo al mismo nivel — así que `persistReport` debería seguir funcionando igual). Verifiquemos y ajustemos si hace falta.

**Files:**
- Modify: `src/session/portfolio.ts`

- [ ] **Step 1: Leer el archivo actual**

Abrir [src/session/portfolio.ts](src/session/portfolio.ts). La función `persistReport` usa `report.repo`, `report.scoreTotal`, `report.resumen` — los tres siguen siendo campos top-level en el nuevo schema. No requiere cambios de lógica, pero vamos a tipar el parámetro con `AnalysisReport` en lugar del tipo inline.

- [ ] **Step 2: Reemplazar la firma de `persistReport`**

Cambiar esta parte del archivo:

```ts
// ANTES
export function persistReport(report: { repo: string; scoreTotal: number; resumen: string }): void {
```

por:

```ts
// DESPUÉS
import type { AnalysisReport, PortfolioEntry } from '../types/index.js'

export function persistReport(report: AnalysisReport): void {
```

Y agregar el import de `AnalysisReport` al top del archivo (junto al de `PortfolioEntry` que ya existe). Si ya tienes un import `import type { PortfolioEntry } from '../types/index.js'`, cámbialo a `import type { AnalysisReport, PortfolioEntry } from '../types/index.js'`.

- [ ] **Step 3: Verificar compilación**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "portfolio.ts"`
Expected: sin errores en `portfolio.ts` (los otros archivos seguirán fallando hasta que los actualicemos — es esperado).

- [ ] **Step 4: Commit**

```bash
git add src/session/portfolio.ts
git commit -m "refactor(portfolio): type persistReport with AnalysisReport"
```

---

## Task 3: Crear helper puro `stream-events.ts` (mapeo tool→stage + parser)

**Files:**
- Create: `src/server/stream-events.ts`

- [ ] **Step 1: Crear la carpeta y el archivo**

Run: `mkdir -p src/server`

- [ ] **Step 2: Escribir el módulo completo**

Crea `src/server/stream-events.ts` con:

```ts
import type { AnalysisReport } from '../types/index.js'

export type Stage =
  | 'starting'
  | 'fetching_metadata'
  | 'analyzing_activity'
  | 'evaluating'
  | 'generating_report'
  | 'done'

export const STAGE_LABELS: Record<Stage, string> = {
  starting: 'Iniciando análisis',
  fetching_metadata: 'Leyendo estructura del repo',
  analyzing_activity: 'Analizando actividad del equipo',
  evaluating: 'Evaluando dimensiones técnicas',
  generating_report: 'Generando reporte final',
  done: 'Análisis completo',
}

const GITHUB_MCP_TOOLS = new Set([
  'list_commits',
  'list_pull_requests',
  'list_issues',
  'list_contributors',
  'search_commits',
  'search_issues',
  'search_pull_requests',
  'get_commit',
  'get_pull_request',
  'get_issue',
])

export function mapToolToStage(toolName: string): Stage {
  if (toolName === 'analyze_repo_structure') return 'fetching_metadata'
  if (GITHUB_MCP_TOOLS.has(toolName)) return 'analyzing_activity'
  if (toolName === 'save_analysis' || toolName === 'get_portfolio') return 'generating_report'
  return 'evaluating'
}

export function extractReport(text: string): AnalysisReport | null {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/)
  if (!jsonMatch) return null
  try {
    return JSON.parse(jsonMatch[1]) as AnalysisReport
  } catch {
    return null
  }
}
```

- [ ] **Step 3: Verificar funciones puras con un script `tsx` desechable**

Crea `/tmp/test-stream-events.ts`:

```ts
import { mapToolToStage, STAGE_LABELS, extractReport } from './src/server/stream-events.ts'

// mapToolToStage
console.assert(mapToolToStage('analyze_repo_structure') === 'fetching_metadata', 'analyze_repo_structure')
console.assert(mapToolToStage('list_commits') === 'analyzing_activity', 'list_commits')
console.assert(mapToolToStage('unknown_tool') === 'evaluating', 'unknown → evaluating')
console.assert(STAGE_LABELS.starting === 'Iniciando análisis', 'label starting')

// extractReport
const bad = extractReport('just text without JSON')
console.assert(bad === null, 'no json → null')

const malformed = extractReport('```json\n{ not valid }\n```')
console.assert(malformed === null, 'malformed → null')

const good = extractReport('texto previo\n```json\n{ "scoreTotal": 7.5 }\n```\ntexto posterior')
console.assert(good !== null && (good as any).scoreTotal === 7.5, 'valid json extracted')

console.log('✓ stream-events helpers OK')
```

Run: `npx tsx /tmp/test-stream-events.ts`
Expected: output exacto `✓ stream-events helpers OK`. Cualquier assertion fallida imprime `Assertion failed: ...` — si ves eso, corrige el código antes de continuar.

- [ ] **Step 4: Limpiar el script desechable**

Run: `rm /tmp/test-stream-events.ts`

- [ ] **Step 5: Commit**

```bash
git add src/server/stream-events.ts
git commit -m "feat(server): add stream-events helpers (tool→stage mapping, report parser)"
```

---

## Task 4: Reemplazar el endpoint POST por el SSE en `src/server.ts`

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Reemplazar el archivo completo**

Reemplaza [src/server.ts](src/server.ts) por:

```ts
import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { streamSSE } from 'hono/streaming'
import { createAgent } from './agent.js'
import { loadPortfolio, persistReport } from './session/portfolio.js'
import { mapToolToStage, STAGE_LABELS, extractReport, type Stage } from './server/stream-events.js'

const app = new Hono()

app.use('/*', cors())

let agentContext: Awaited<ReturnType<typeof createAgent>> | null = null

async function getAgent() {
  if (!agentContext) {
    agentContext = await createAgent()
  }
  return agentContext
}

function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/\s#?]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

app.get('/api/analyze/stream', async (c) => {
  const repoUrl = c.req.query('repoUrl')
  if (!repoUrl) {
    return c.json({ error: 'Missing repoUrl query param' }, 400)
  }
  const parsed = parseRepoUrl(repoUrl)
  if (!parsed) {
    return c.json({ error: 'Invalid GitHub URL. Expected https://github.com/owner/repo' }, 400)
  }

  return streamSSE(c, async (stream) => {
    const emitStage = (stage: Stage) =>
      stream.writeSSE({ event: 'stage', data: JSON.stringify({ stage, label: STAGE_LABELS[stage] }) })

    try {
      const { agent } = await getAgent()
      await emitStage('starting')

      const prompt = `Analiza el repositorio ${parsed.owner}/${parsed.repo} (https://github.com/${parsed.owner}/${parsed.repo}) y genera el reporte de due diligence técnico completo.`

      let buffer = ''
      let currentStage: Stage = 'starting'

      for await (const evt of agent.stream(prompt)) {
        switch (evt.type) {
          case 'beforeToolCallEvent': {
            const toolName = evt.toolUse.name
            const nextStage = mapToolToStage(toolName)
            if (nextStage !== currentStage) {
              currentStage = nextStage
              await emitStage(nextStage)
            }
            await stream.writeSSE({
              event: 'tool',
              data: JSON.stringify({ tool: toolName, status: 'start' }),
            })
            break
          }
          case 'afterToolCallEvent': {
            await stream.writeSSE({
              event: 'tool',
              data: JSON.stringify({ tool: evt.toolUse.name, status: 'complete' }),
            })
            break
          }
          case 'modelStreamUpdateEvent': {
            const inner = evt.event
            if (
              inner.type === 'modelContentBlockDeltaEvent' &&
              inner.delta?.type === 'textDelta' &&
              typeof inner.delta.text === 'string'
            ) {
              buffer += inner.delta.text
              await stream.writeSSE({
                event: 'token',
                data: JSON.stringify({ text: inner.delta.text }),
              })
            }
            break
          }
        }
      }

      if (currentStage !== 'generating_report') {
        currentStage = 'generating_report'
        await emitStage('generating_report')
      }

      const report = extractReport(buffer)
      if (report) {
        report.repo = `${parsed.owner}/${parsed.repo}`
        report.fecha = new Date().toISOString()
        persistReport(report)
        await stream.writeSSE({ event: 'report', data: JSON.stringify(report) })
        await emitStage('done')
      } else {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ message: 'No se pudo parsear el reporte JSON desde la respuesta del agente.' }),
        })
      }
    } catch (err) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({
          message: err instanceof Error ? err.message : 'Analysis failed',
        }),
      })
    } finally {
      await stream.writeSSE({ event: 'done', data: '{}' })
    }
  })
})

app.get('/api/portfolio', (c) => {
  const portfolio = loadPortfolio()
  return c.json(portfolio)
})

const port = parseInt(process.env.PORT || '3001', 10)

console.log(`Due Diligence API server starting on port ${port}...`)

async function startServer() {
  await getAgent()
  console.log(`Agent initialized. API ready at http://localhost:${port}`)

  serve({
    fetch: app.fetch,
    port,
  })
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err)
  process.exit(1)
})
```

Cambios respecto al archivo anterior:
- Elimina el endpoint `POST /api/analyze` bloqueante.
- Elimina la función `extractReport` local (vive en `stream-events.ts`).
- Añade `GET /api/analyze/stream` con `streamSSE`.
- Mantiene `GET /api/portfolio` sin cambios.

- [ ] **Step 2: Verificar compilación TypeScript**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1`
Expected: sin errores en `src/server.ts` ni en `src/server/stream-events.ts`. Puede seguir habiendo errores en `src/agent.ts` si el prompt todavía es el viejo — eso se arregla en la Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat(server): replace POST /api/analyze with GET /api/analyze/stream (SSE)"
```

---

## Task 5: Actualizar el system prompt del agente con el JSON template ampliado

**Files:**
- Modify: `src/agent.ts`

- [ ] **Step 1: Reemplazar solo la constante `SYSTEM_PROMPT`**

En [src/agent.ts](src/agent.ts), reemplazá el valor actual de `SYSTEM_PROMPT` (líneas 7-39 aproximadamente) por esto:

```ts
const SYSTEM_PROMPT = `Eres un CTO senior con 15 años de experiencia evaluando startups para fondos de inversión.
Tu trabajo es realizar due diligence técnico de repositorios de GitHub y generar un reporte de inversión técnica objetivo, accionable y con evidencia concreta.

Cuando el usuario te dé un repositorio de GitHub, debes:
1. Usar analyze_repo_structure para obtener estructura, package.json, tsconfig, configs y CI/CD.
2. Usar las tools del MCP de GitHub (list_commits, list_pull_requests, list_contributors, list_issues) para evaluar actividad del equipo, frecuencia de commits, contributors activos en los últimos 30 días, PRs mergeados, issues abiertos.
3. Inferir la ficha técnica (frontend, backend, database, infraestructura, testing, ci/cd) a partir de dependencias, devDependencies, archivos de config y estructura de carpetas.
4. Calcular métricas agregadas antes de emitir el reporte final.

Tienes acceso al portafolio de análisis anteriores vía get_portfolio.

REGLAS DE EVIDENCIA:
- En cada \`justificacion\` cita evidencia concreta: nombre y versión de dependencia, número de commits, antigüedad del último commit, archivos de config presentes/ausentes, número de contributors.
- Si una categoría de tecnología está vacía (ej. no hay base de datos detectable), devolvé un array vacío \`[]\`.
- Si un dato numérico no está disponible, poné \`-1\` y explícalo brevemente en \`resumen\`. NUNCA inventes datos.
- \`ultimoCommitHace\` y \`edadProyecto\` en lenguaje natural en español: "3 días", "2 meses", "1 año 4 meses".

IMPORTANTE: Cuando completes un análisis, tu respuesta SIEMPRE debe incluir un bloque JSON delimitado por \`\`\`json y \`\`\` con este formato EXACTO (todos los campos obligatorios):

\`\`\`json
{
  "scores": {
    "stackArquitectura": { "score": X, "justificacion": "..." },
    "calidadCodigo": { "score": X, "justificacion": "..." },
    "escalabilidad": { "score": X, "justificacion": "..." },
    "saludEquipo": { "score": X, "justificacion": "..." },
    "seguridad": { "score": X, "justificacion": "..." },
    "madurezDependencias": { "score": X, "justificacion": "..." }
  },
  "tecnologias": {
    "frontend": ["..."],
    "backend": ["..."],
    "database": ["..."],
    "infraestructura": ["..."],
    "testing": ["..."],
    "cicd": ["..."]
  },
  "metricas": {
    "stars": N,
    "forks": N,
    "contributorsActivos30d": N,
    "commitsUltimoMes": N,
    "ultimoCommitHace": "...",
    "prsAbiertos": N,
    "prsMergeadosUltimoMes": N,
    "issuesAbiertos": N,
    "tieneTests": true,
    "edadProyecto": "..."
  },
  "deudaTecnica": "Alta|Media|Baja",
  "deudaJustificacion": "...",
  "scoreTotal": X.X,
  "riesgos": ["...", "...", "..."],
  "fortalezas": ["...", "...", "..."],
  "recomendacion": "...",
  "resumen": "..."
}
\`\`\`

Sé directo, técnico y objetivo. No suavices los problemas que encuentres.
El inversor necesita la verdad, no lo que quiere escuchar.`
```

No cambies nada más del archivo (la función `createAgent` queda igual).

- [ ] **Step 2: Verificar compilación**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1`
Expected: sin errores en ninguno de los archivos de `src/`.

- [ ] **Step 3: Commit**

```bash
git add src/agent.ts
git commit -m "feat(agent): expand system prompt with justifications + tech stack + metrics schema"
```

---

## Task 6: Smoke test del endpoint streaming con `curl`

Esta tarea solo verifica que el backend arranca y emite eventos SSE bien formados. **Requiere tener Ollama corriendo** (`ollama serve` + `ollama pull llama3.1`) y `GITHUB_PERSONAL_ACCESS_TOKEN` en `.env`.

- [ ] **Step 1: Arrancar el servidor en background**

Run: `npm run dev:server` (en background, esperá ~10s a que aparezca "Agent initialized. API ready at http://localhost:3001").

- [ ] **Step 2: Hacer un request SSE de prueba con un repo pequeño**

Usá un repo público pequeño que conozcas (ej. `sindresorhus/is-odd`) para minimizar tokens.

Run:
```bash
curl -N -H "Accept: text/event-stream" \
  "http://localhost:3001/api/analyze/stream?repoUrl=https://github.com/sindresorhus/is-odd" \
  2>&1 | head -80
```

Expected: ves líneas empezando con:
- `event: stage` seguido de `data: {"stage":"starting","label":"Iniciando análisis"}`
- `event: tool` con `data: {"tool":"analyze_repo_structure","status":"start"}`
- `event: token` con fragmentos de texto del LLM
- Eventualmente `event: report` con JSON estructurado (o `event: error` si el modelo falla al producir JSON válido)
- `event: done` al final

Si ves `event: error` con `No se pudo parsear el reporte JSON`: es probable que el modelo local esté alucinando. Proba con un repo más grande donde tenga más contexto, o cambiá a `llama3.1:70b` si tu hardware lo permite. No es bloqueante para continuar con el frontend — seguí igual; el frontend manejará ambos casos.

- [ ] **Step 3: Parar el servidor**

Matá el proceso `npm run dev:server` del background.

- [ ] **Step 4: No hay commit acá — es solo verificación**

---

## Task 7: Actualizar `ScoreBar.astro` con justificación

**Files:**
- Modify: `web/src/components/ScoreBar.astro`

- [ ] **Step 1: Reemplazar el contenido del archivo**

Reemplaza [web/src/components/ScoreBar.astro](web/src/components/ScoreBar.astro) completo por:

```astro
---
interface Props {
  label: string
  score: number
  justificacion?: string
  max?: number
}

const { label, score, justificacion, max = 10 } = Astro.props
const percentage = (score / max) * 100
const colorClass = score > 7 ? 'good' : score >= 4 ? 'ok' : 'bad'
---

<div class="score-bar">
  <div class="score-bar-header">
    <span class="score-bar-label">{label}</span>
    <span class={`score-bar-value score-${colorClass}`}>{score}/{max}</span>
  </div>
  <div class="score-bar-track">
    <div class={`score-bar-fill score-fill-${colorClass}`} style={`width: ${percentage}%`}></div>
  </div>
  {justificacion && <p class="score-bar-justification">{justificacion}</p>}
</div>

<style>
  .score-bar {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .score-bar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .score-bar-label {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .score-bar-value {
    font-size: 0.9rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .score-good { color: var(--score-good); }
  .score-ok { color: var(--score-ok); }
  .score-bad { color: var(--score-bad); }

  .score-bar-track {
    height: 8px;
    background: var(--bg-secondary);
    border-radius: 4px;
    overflow: hidden;
  }

  .score-bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.6s ease;
  }

  .score-fill-good { background: var(--score-good); }
  .score-fill-ok { background: var(--score-ok); }
  .score-fill-bad { background: var(--score-bad); }

  .score-bar-justification {
    margin-top: 8px;
    font-size: 0.85rem;
    color: var(--text-secondary);
    line-height: 1.6;
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/ScoreBar.astro
git commit -m "feat(web): add justification text to ScoreBar component"
```

---

## Task 8: Crear `TechStackCard.astro`

**Files:**
- Create: `web/src/components/TechStackCard.astro`

- [ ] **Step 1: Crear el archivo**

Crea `web/src/components/TechStackCard.astro` con:

```astro
---
interface TechStack {
  frontend: string[]
  backend: string[]
  database: string[]
  infraestructura: string[]
  testing: string[]
  cicd: string[]
}

interface Props {
  tecnologias: TechStack
}

const { tecnologias } = Astro.props

const categories: Array<{ key: keyof TechStack; label: string }> = [
  { key: 'frontend', label: 'Frontend' },
  { key: 'backend', label: 'Backend' },
  { key: 'database', label: 'Base de datos' },
  { key: 'infraestructura', label: 'Infraestructura' },
  { key: 'testing', label: 'Testing' },
  { key: 'cicd', label: 'CI / CD' },
]

const nonEmpty = categories.filter((cat) => tecnologias[cat.key]?.length > 0)
---

<div class="tech-stack card">
  <h3 class="section-title">Ficha técnica</h3>
  {nonEmpty.length === 0 ? (
    <p class="tech-empty">No se pudo inferir el stack técnico desde el repositorio.</p>
  ) : (
    <div class="tech-grid">
      {nonEmpty.map((cat) => (
        <div class="tech-category">
          <h4 class="tech-category-label">{cat.label}</h4>
          <div class="tech-chips">
            {tecnologias[cat.key].map((item: string) => (
              <span class="tech-chip">{item}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )}
</div>

<style>
  .section-title {
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 20px;
  }

  .tech-empty {
    color: var(--text-muted);
    font-size: 0.9rem;
    font-style: italic;
  }

  .tech-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 20px;
  }

  .tech-category-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    margin-bottom: 10px;
  }

  .tech-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tech-chip {
    display: inline-block;
    padding: 4px 10px;
    font-size: 0.8rem;
    font-weight: 500;
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: 999px;
    color: var(--text-primary);
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/TechStackCard.astro
git commit -m "feat(web): add TechStackCard component"
```

---

## Task 9: Crear `MetricsCard.astro`

**Files:**
- Create: `web/src/components/MetricsCard.astro`

- [ ] **Step 1: Crear el archivo**

Crea `web/src/components/MetricsCard.astro` con:

```astro
---
interface RepoMetrics {
  stars: number
  forks: number
  contributorsActivos30d: number
  commitsUltimoMes: number
  ultimoCommitHace: string
  prsAbiertos: number
  prsMergeadosUltimoMes: number
  issuesAbiertos: number
  tieneTests: boolean
  edadProyecto: string
}

interface Props {
  metricas: RepoMetrics
}

const { metricas } = Astro.props

function fmt(n: number): string {
  if (n < 0) return '—'
  return n.toLocaleString('es-CL')
}
---

<div class="metrics-card card">
  <h3 class="section-title">Métricas clave</h3>
  <div class="metrics-grid">
    <div class="metric-tile">
      <span class="metric-value">{fmt(metricas.stars)}</span>
      <span class="metric-label">Stars</span>
    </div>
    <div class="metric-tile">
      <span class="metric-value">{fmt(metricas.forks)}</span>
      <span class="metric-label">Forks</span>
    </div>
    <div class="metric-tile">
      <span class="metric-value">{metricas.ultimoCommitHace || '—'}</span>
      <span class="metric-label">Último commit</span>
    </div>
    <div class="metric-tile">
      <span class="metric-value">{fmt(metricas.commitsUltimoMes)}</span>
      <span class="metric-label">Commits / mes</span>
    </div>
    <div class="metric-tile">
      <span class="metric-value">{fmt(metricas.contributorsActivos30d)}</span>
      <span class="metric-label">Contributors 30d</span>
    </div>
    <div class="metric-tile">
      <span class="metric-value">{fmt(metricas.prsMergeadosUltimoMes)}</span>
      <span class="metric-label">PRs merged / mes</span>
    </div>
    <div class="metric-tile">
      <span class="metric-value">{fmt(metricas.prsAbiertos)}</span>
      <span class="metric-label">PRs abiertos</span>
    </div>
    <div class="metric-tile">
      <span class="metric-value">{fmt(metricas.issuesAbiertos)}</span>
      <span class="metric-label">Issues abiertos</span>
    </div>
    <div class="metric-tile">
      <span class="metric-value">{metricas.edadProyecto || '—'}</span>
      <span class="metric-label">Edad proyecto</span>
    </div>
    <div class="metric-tile">
      <span class={`metric-badge ${metricas.tieneTests ? 'metric-badge-yes' : 'metric-badge-no'}`}>
        {metricas.tieneTests ? 'Sí' : 'No'}
      </span>
      <span class="metric-label">Tests</span>
    </div>
  </div>
</div>

<style>
  .section-title {
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 20px;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 16px;
  }

  .metric-tile {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
  }

  .metric-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }

  .metric-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .metric-badge {
    display: inline-block;
    padding: 4px 12px;
    font-size: 0.85rem;
    font-weight: 700;
    border-radius: 999px;
    align-self: flex-start;
  }

  .metric-badge-yes {
    background: rgba(16, 185, 129, 0.15);
    color: var(--accent-green);
  }

  .metric-badge-no {
    background: rgba(239, 68, 68, 0.15);
    color: var(--accent-red);
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/MetricsCard.astro
git commit -m "feat(web): add MetricsCard component"
```

---

## Task 10: Actualizar `ReportCard.astro` con el nuevo orden y schema

**Files:**
- Modify: `web/src/components/ReportCard.astro`

- [ ] **Step 1: Reemplazar el archivo completo**

Reemplaza [web/src/components/ReportCard.astro](web/src/components/ReportCard.astro) por:

```astro
---
import ScoreBar from './ScoreBar.astro'
import RiskStrengthCard from './RiskStrengthCard.astro'
import TechStackCard from './TechStackCard.astro'
import MetricsCard from './MetricsCard.astro'
import type { AnalysisReport } from '../../../src/types/index.js'

interface Props {
  report: AnalysisReport
}

const { report } = Astro.props
const scoreTotalColor = report.scoreTotal > 7 ? 'good' : report.scoreTotal >= 4 ? 'ok' : 'bad'
const deudaClass = report.deudaTecnica === 'Baja' ? 'green' : report.deudaTecnica === 'Media' ? 'yellow' : 'red'
const fecha = new Date(report.fecha).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })
---

<div class="report">
  <div class="report-header card">
    <div class="report-header-info">
      <h2 class="report-repo">{report.repo}</h2>
      <p class="report-date">{fecha}</p>
    </div>
    <div class={`report-score-total score-total-${scoreTotalColor}`}>
      <span class="score-number">{report.scoreTotal.toFixed(1)}</span>
      <span class="score-label">/ 10</span>
    </div>
  </div>

  <TechStackCard tecnologias={report.tecnologias} />
  <MetricsCard metricas={report.metricas} />

  <div class="report-scores card">
    <h3 class="section-title">Dimensiones técnicas</h3>
    <div class="scores-grid">
      <ScoreBar label="Stack & Arquitectura" score={report.scores.stackArquitectura.score} justificacion={report.scores.stackArquitectura.justificacion} />
      <ScoreBar label="Calidad de código" score={report.scores.calidadCodigo.score} justificacion={report.scores.calidadCodigo.justificacion} />
      <ScoreBar label="Escalabilidad" score={report.scores.escalabilidad.score} justificacion={report.scores.escalabilidad.justificacion} />
      <ScoreBar label="Salud del equipo" score={report.scores.saludEquipo.score} justificacion={report.scores.saludEquipo.justificacion} />
      <ScoreBar label="Seguridad" score={report.scores.seguridad.score} justificacion={report.scores.seguridad.justificacion} />
      <ScoreBar label="Madurez de dependencias" score={report.scores.madurezDependencias.score} justificacion={report.scores.madurezDependencias.justificacion} />
    </div>
    <div class="deuda-row">
      <div class="deuda-left">
        <span class="deuda-label">Deuda técnica</span>
        <span class={`badge badge-${deudaClass}`}>{report.deudaTecnica}</span>
      </div>
      <p class="deuda-justification">{report.deudaJustificacion}</p>
    </div>
  </div>

  <div class="report-details">
    <RiskStrengthCard title="Top 3 Riesgos" items={report.riesgos} variant="risk" />
    <RiskStrengthCard title="Top 3 Fortalezas" items={report.fortalezas} variant="strength" />
  </div>

  <div class="report-recommendation card">
    <h3 class="section-title">Recomendación al inversor</h3>
    <p class="recommendation-text">{report.recomendacion}</p>
  </div>
</div>

<style>
  .report {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .section-title {
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 20px;
  }

  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .report-repo {
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .report-date {
    color: var(--text-muted);
    font-size: 0.85rem;
    margin-top: 4px;
  }

  .report-score-total {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .score-number {
    font-size: 3rem;
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .score-label {
    font-size: 1.1rem;
    color: var(--text-muted);
    font-weight: 500;
  }

  .score-total-good .score-number { color: var(--score-good); }
  .score-total-ok .score-number { color: var(--score-ok); }
  .score-total-bad .score-number { color: var(--score-bad); }

  .scores-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-bottom: 24px;
  }

  .deuda-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 16px;
    border-top: 1px solid var(--border-subtle);
  }

  .deuda-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .deuda-label {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .deuda-justification {
    font-size: 0.85rem;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .report-details {
    display: flex;
    gap: 20px;
  }

  .recommendation-text {
    font-size: 0.95rem;
    color: var(--text-secondary);
    line-height: 1.7;
  }

  @media (max-width: 768px) {
    .scores-grid { grid-template-columns: 1fr; }
    .report-details { flex-direction: column; }
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/ReportCard.astro
git commit -m "feat(web): update ReportCard for enriched schema (tech stack + metrics + justifications)"
```

---

## Task 11: Reescribir `AnalysisForm.astro` con EventSource + timeline + render enriquecido

Este es el cambio más grande. Reemplazamos el `fetch()` bloqueante por `EventSource`, agregamos la UI de timeline y el panel de razonamiento, y actualizamos el `renderReport` client-side para reflejar el schema ampliado.

**Files:**
- Modify: `web/src/components/AnalysisForm.astro`

- [ ] **Step 1: Reemplazar el archivo completo**

Reemplaza [web/src/components/AnalysisForm.astro](web/src/components/AnalysisForm.astro) por:

```astro
---
// Client-interactive component — no server props
---

<div id="analysis-section">
  <div class="hero">
    <h1 class="hero-title">Due Diligence <span>Técnico</span></h1>
    <p class="hero-subtitle">Evalúa la salud técnica de cualquier startup en GitHub</p>
  </div>

  <form id="analysis-form" class="analysis-form card">
    <div class="form-row">
      <input
        type="url"
        id="repo-url"
        class="input"
        placeholder="https://github.com/owner/repo"
        required
      />
      <button type="submit" id="submit-btn" class="btn btn-primary">Analizar</button>
    </div>
  </form>

  <div id="progress" class="progress card" style="display: none;">
    <h3 class="progress-title">Progreso del análisis</h3>
    <ol id="timeline" class="timeline">
      <li class="timeline-item" data-stage="starting"><span class="timeline-icon"></span><span class="timeline-label">Iniciando análisis</span></li>
      <li class="timeline-item" data-stage="fetching_metadata"><span class="timeline-icon"></span><span class="timeline-label">Leyendo estructura del repo</span></li>
      <li class="timeline-item" data-stage="analyzing_activity"><span class="timeline-icon"></span><span class="timeline-label">Analizando actividad del equipo</span></li>
      <li class="timeline-item" data-stage="evaluating"><span class="timeline-icon"></span><span class="timeline-label">Evaluando dimensiones técnicas</span></li>
      <li class="timeline-item" data-stage="generating_report"><span class="timeline-icon"></span><span class="timeline-label">Generando reporte final</span></li>
    </ol>
    <details class="reasoning">
      <summary>Razonamiento en vivo</summary>
      <pre id="reasoning-stream" class="reasoning-stream"></pre>
    </details>
  </div>

  <div id="error" class="error-message card" style="display: none;">
    <p id="error-text"></p>
  </div>

  <div id="report-container"></div>
</div>

<style>
  .hero { text-align: center; margin-bottom: 40px; }
  .hero-title { font-size: 2.5rem; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 8px; }
  .hero-title span { color: var(--accent-blue); }
  .hero-subtitle { color: var(--text-secondary); font-size: 1.1rem; }

  .analysis-form { margin-bottom: 32px; }
  .form-row { display: flex; gap: 12px; }
  .form-row .input { flex: 1; }

  .progress { margin-bottom: 24px; }
  .progress-title {
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 20px;
  }
  .timeline {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 0 0 20px;
    padding: 0;
  }
  .timeline-item {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--text-muted);
    font-size: 0.9rem;
    transition: color 0.2s;
  }
  .timeline-icon {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid var(--border-subtle);
    background: var(--bg-secondary);
    flex-shrink: 0;
    position: relative;
  }
  .timeline-item.running .timeline-icon {
    border-color: var(--accent-blue);
    border-top-color: transparent;
    animation: spin 0.8s linear infinite;
  }
  .timeline-item.running .timeline-label { color: var(--text-primary); }
  .timeline-item.done .timeline-icon {
    background: var(--accent-green);
    border-color: var(--accent-green);
  }
  .timeline-item.done .timeline-icon::after {
    content: '✓';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    font-size: 10px;
    font-weight: 700;
  }
  .timeline-item.done { color: var(--text-secondary); }

  .reasoning { border-top: 1px solid var(--border-subtle); padding-top: 16px; }
  .reasoning summary {
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-secondary);
    user-select: none;
  }
  .reasoning summary:hover { color: var(--text-primary); }
  .reasoning-stream {
    margin-top: 12px;
    max-height: 300px;
    overflow-y: auto;
    padding: 12px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.8rem;
    color: var(--text-secondary);
    white-space: pre-wrap;
    word-wrap: break-word;
    line-height: 1.5;
  }

  .error-message {
    border-left: 3px solid var(--accent-red);
    color: var(--accent-red);
    margin-bottom: 24px;
  }
</style>

<style is:global>
  /* Shared styles for client-rendered report (mirrors ScoreBar, TechStack, Metrics, ReportCard) */
  .score-bar { display: flex; flex-direction: column; gap: 6px; }
  .score-bar-header { display: flex; justify-content: space-between; align-items: center; }
  .score-bar-label { font-size: 0.85rem; font-weight: 500; color: var(--text-secondary); }
  .score-bar-value { font-size: 0.9rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .score-good { color: var(--score-good); }
  .score-ok { color: var(--score-ok); }
  .score-bad { color: var(--score-bad); }
  .score-bar-track { height: 8px; background: var(--bg-secondary); border-radius: 4px; overflow: hidden; }
  .score-bar-fill { height: 100%; border-radius: 4px; transition: width 0.6s ease; }
  .score-fill-good { background: var(--score-good); }
  .score-fill-ok { background: var(--score-ok); }
  .score-fill-bad { background: var(--score-bad); }
  .score-bar-justification { margin-top: 8px; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; }

  .rsc { flex: 1; min-width: 280px; }
  .rsc-risk { border-left: 3px solid var(--accent-red); }
  .rsc-strength { border-left: 3px solid var(--accent-green); }
  .rsc-title { font-size: 0.9rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; color: var(--text-primary); }
  .rsc-list { display: flex; flex-direction: column; gap: 10px; padding-left: 20px; }
  .rsc-item { font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5; }

  .report { display: flex; flex-direction: column; gap: 20px; }
  .section-title { font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 20px; }
  .report-header { display: flex; justify-content: space-between; align-items: center; }
  .report-repo { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; }
  .report-date { color: var(--text-muted); font-size: 0.85rem; margin-top: 4px; }
  .report-score-total { display: flex; align-items: baseline; gap: 4px; }
  .score-number { font-size: 3rem; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
  .score-label { font-size: 1.1rem; color: var(--text-muted); font-weight: 500; }
  .score-total-good .score-number { color: var(--score-good); }
  .score-total-ok .score-number { color: var(--score-ok); }
  .score-total-bad .score-number { color: var(--score-bad); }
  .scores-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .deuda-row { display: flex; flex-direction: column; gap: 8px; padding-top: 16px; border-top: 1px solid var(--border-subtle); }
  .deuda-left { display: flex; align-items: center; gap: 12px; }
  .deuda-label { font-size: 0.85rem; font-weight: 500; color: var(--text-secondary); }
  .deuda-justification { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; }
  .report-details { display: flex; gap: 20px; }
  .recommendation-text { font-size: 0.95rem; color: var(--text-secondary); line-height: 1.7; }

  .tech-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; }
  .tech-category-label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); margin-bottom: 10px; }
  .tech-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .tech-chip { display: inline-block; padding: 4px 10px; font-size: 0.8rem; font-weight: 500; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 999px; color: var(--text-primary); }
  .tech-empty { color: var(--text-muted); font-size: 0.9rem; font-style: italic; }

  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; }
  .metric-tile { display: flex; flex-direction: column; gap: 4px; padding: 14px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); }
  .metric-value { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; line-height: 1.2; }
  .metric-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
  .metric-badge { display: inline-block; padding: 4px 12px; font-size: 0.85rem; font-weight: 700; border-radius: 999px; align-self: flex-start; }
  .metric-badge-yes { background: rgba(16, 185, 129, 0.15); color: var(--accent-green); }
  .metric-badge-no { background: rgba(239, 68, 68, 0.15); color: var(--accent-red); }

  @media (max-width: 768px) {
    .scores-grid { grid-template-columns: 1fr; }
    .report-details { flex-direction: column; }
  }
</style>

<script>
  const API_BASE = 'http://localhost:3001'

  const form = document.getElementById('analysis-form') as HTMLFormElement
  const input = document.getElementById('repo-url') as HTMLInputElement
  const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement
  const progressDiv = document.getElementById('progress') as HTMLDivElement
  const reasoningPre = document.getElementById('reasoning-stream') as HTMLPreElement
  const errorDiv = document.getElementById('error') as HTMLDivElement
  const errorText = document.getElementById('error-text') as HTMLParagraphElement
  const reportContainer = document.getElementById('report-container') as HTMLDivElement

  const STAGE_ORDER = ['starting', 'fetching_metadata', 'analyzing_activity', 'evaluating', 'generating_report']

  function escapeHtml(s: string): string {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function fmt(n: number): string {
    if (typeof n !== 'number' || n < 0) return '—'
    return n.toLocaleString('es-CL')
  }

  function getScoreClass(score: number): string {
    if (score > 7) return 'good'
    if (score >= 4) return 'ok'
    return 'bad'
  }

  function getBadgeClass(deuda: string): string {
    if (deuda === 'Baja') return 'badge-green'
    if (deuda === 'Media') return 'badge-yellow'
    return 'badge-red'
  }

  function resetTimeline() {
    document.querySelectorAll('.timeline-item').forEach((el) => {
      el.classList.remove('running', 'done')
    })
    reasoningPre.textContent = ''
  }

  function setStage(stage: string) {
    const currentIdx = STAGE_ORDER.indexOf(stage)
    if (currentIdx < 0) return
    STAGE_ORDER.forEach((s, idx) => {
      const el = document.querySelector(`.timeline-item[data-stage="${s}"]`)
      if (!el) return
      el.classList.remove('running', 'done')
      if (idx < currentIdx) el.classList.add('done')
      if (idx === currentIdx) el.classList.add('running')
    })
  }

  function markAllDone() {
    STAGE_ORDER.forEach((s) => {
      const el = document.querySelector(`.timeline-item[data-stage="${s}"]`)
      if (el) {
        el.classList.remove('running')
        el.classList.add('done')
      }
    })
  }

  function appendToken(text: string) {
    reasoningPre.textContent += text
    reasoningPre.scrollTop = reasoningPre.scrollHeight
  }

  function renderScoreBar(label: string, dim: { score: number; justificacion: string }): string {
    const pct = (dim.score / 10) * 100
    const cls = getScoreClass(dim.score)
    return `
      <div class="score-bar">
        <div class="score-bar-header">
          <span class="score-bar-label">${escapeHtml(label)}</span>
          <span class="score-bar-value score-${cls}">${dim.score}/10</span>
        </div>
        <div class="score-bar-track">
          <div class="score-bar-fill score-fill-${cls}" style="width: ${pct}%"></div>
        </div>
        ${dim.justificacion ? `<p class="score-bar-justification">${escapeHtml(dim.justificacion)}</p>` : ''}
      </div>
    `
  }

  function renderTechStack(tec: Record<string, string[]>): string {
    const categories: Array<[string, string]> = [
      ['frontend', 'Frontend'],
      ['backend', 'Backend'],
      ['database', 'Base de datos'],
      ['infraestructura', 'Infraestructura'],
      ['testing', 'Testing'],
      ['cicd', 'CI / CD'],
    ]
    const nonEmpty = categories.filter(([k]) => (tec[k] || []).length > 0)
    if (nonEmpty.length === 0) {
      return `<div class="tech-stack card"><h3 class="section-title">Ficha técnica</h3><p class="tech-empty">No se pudo inferir el stack técnico desde el repositorio.</p></div>`
    }
    const body = nonEmpty
      .map(
        ([k, label]) => `
        <div class="tech-category">
          <h4 class="tech-category-label">${escapeHtml(label)}</h4>
          <div class="tech-chips">
            ${tec[k].map((t) => `<span class="tech-chip">${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
      `
      )
      .join('')
    return `
      <div class="tech-stack card">
        <h3 class="section-title">Ficha técnica</h3>
        <div class="tech-grid">${body}</div>
      </div>
    `
  }

  function renderMetrics(m: any): string {
    return `
      <div class="metrics-card card">
        <h3 class="section-title">Métricas clave</h3>
        <div class="metrics-grid">
          <div class="metric-tile"><span class="metric-value">${fmt(m.stars)}</span><span class="metric-label">Stars</span></div>
          <div class="metric-tile"><span class="metric-value">${fmt(m.forks)}</span><span class="metric-label">Forks</span></div>
          <div class="metric-tile"><span class="metric-value">${escapeHtml(m.ultimoCommitHace || '—')}</span><span class="metric-label">Último commit</span></div>
          <div class="metric-tile"><span class="metric-value">${fmt(m.commitsUltimoMes)}</span><span class="metric-label">Commits / mes</span></div>
          <div class="metric-tile"><span class="metric-value">${fmt(m.contributorsActivos30d)}</span><span class="metric-label">Contributors 30d</span></div>
          <div class="metric-tile"><span class="metric-value">${fmt(m.prsMergeadosUltimoMes)}</span><span class="metric-label">PRs merged / mes</span></div>
          <div class="metric-tile"><span class="metric-value">${fmt(m.prsAbiertos)}</span><span class="metric-label">PRs abiertos</span></div>
          <div class="metric-tile"><span class="metric-value">${fmt(m.issuesAbiertos)}</span><span class="metric-label">Issues abiertos</span></div>
          <div class="metric-tile"><span class="metric-value">${escapeHtml(m.edadProyecto || '—')}</span><span class="metric-label">Edad proyecto</span></div>
          <div class="metric-tile"><span class="metric-badge ${m.tieneTests ? 'metric-badge-yes' : 'metric-badge-no'}">${m.tieneTests ? 'Sí' : 'No'}</span><span class="metric-label">Tests</span></div>
        </div>
      </div>
    `
  }

  function renderReport(r: any): string {
    const totalCls = getScoreClass(r.scoreTotal)
    const fecha = new Date(r.fecha).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })
    return `
      <div class="report">
        <div class="report-header card">
          <div>
            <h2 class="report-repo">${escapeHtml(r.repo)}</h2>
            <p class="report-date">${escapeHtml(fecha)}</p>
          </div>
          <div class="report-score-total score-total-${totalCls}">
            <span class="score-number">${Number(r.scoreTotal).toFixed(1)}</span>
            <span class="score-label">/ 10</span>
          </div>
        </div>
        ${renderTechStack(r.tecnologias || {})}
        ${renderMetrics(r.metricas || {})}
        <div class="report-scores card">
          <h3 class="section-title">Dimensiones técnicas</h3>
          <div class="scores-grid">
            ${renderScoreBar('Stack & Arquitectura', r.scores.stackArquitectura)}
            ${renderScoreBar('Calidad de código', r.scores.calidadCodigo)}
            ${renderScoreBar('Escalabilidad', r.scores.escalabilidad)}
            ${renderScoreBar('Salud del equipo', r.scores.saludEquipo)}
            ${renderScoreBar('Seguridad', r.scores.seguridad)}
            ${renderScoreBar('Madurez de dependencias', r.scores.madurezDependencias)}
          </div>
          <div class="deuda-row">
            <div class="deuda-left">
              <span class="deuda-label">Deuda técnica</span>
              <span class="badge ${getBadgeClass(r.deudaTecnica)}">${escapeHtml(r.deudaTecnica)}</span>
            </div>
            ${r.deudaJustificacion ? `<p class="deuda-justification">${escapeHtml(r.deudaJustificacion)}</p>` : ''}
          </div>
        </div>
        <div class="report-details">
          <div class="card rsc rsc-risk">
            <h3 class="rsc-title">Top 3 Riesgos</h3>
            <ol class="rsc-list">${r.riesgos.map((i: string) => `<li class="rsc-item">${escapeHtml(i)}</li>`).join('')}</ol>
          </div>
          <div class="card rsc rsc-strength">
            <h3 class="rsc-title">Top 3 Fortalezas</h3>
            <ol class="rsc-list">${r.fortalezas.map((i: string) => `<li class="rsc-item">${escapeHtml(i)}</li>`).join('')}</ol>
          </div>
        </div>
        <div class="report-recommendation card">
          <h3 class="section-title">Recomendación al inversor</h3>
          <p class="recommendation-text">${escapeHtml(r.recomendacion)}</p>
        </div>
      </div>
    `
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const url = input.value.trim()
    if (!url) return

    submitBtn.disabled = true
    errorDiv.style.display = 'none'
    reportContainer.innerHTML = ''
    resetTimeline()
    progressDiv.style.display = 'block'
    setStage('starting')

    const es = new EventSource(`${API_BASE}/api/analyze/stream?repoUrl=${encodeURIComponent(url)}`)

    es.addEventListener('stage', (e: MessageEvent) => {
      try {
        const { stage } = JSON.parse(e.data)
        setStage(stage)
      } catch {}
    })

    es.addEventListener('token', (e: MessageEvent) => {
      try {
        const { text } = JSON.parse(e.data)
        appendToken(text)
      } catch {}
    })

    es.addEventListener('report', (e: MessageEvent) => {
      try {
        const report = JSON.parse(e.data)
        markAllDone()
        reportContainer.innerHTML = renderReport(report)
      } catch (err) {
        errorText.textContent = 'Error al parsear el reporte'
        errorDiv.style.display = 'block'
      }
    })

    es.addEventListener('error' as any, (e: MessageEvent) => {
      // EventSource native onerror fires without data; skip if no data
      if (!(e as MessageEvent).data) return
      try {
        const { message } = JSON.parse((e as MessageEvent).data)
        errorText.textContent = message || 'Error durante el análisis'
        errorDiv.style.display = 'block'
      } catch {}
    })

    es.addEventListener('done', () => {
      es.close()
      submitBtn.disabled = false
    })

    es.onerror = () => {
      // Connection failure (not a user-level error event)
      if (es.readyState === EventSource.CLOSED) return
      errorText.textContent = 'Conexión perdida con el servidor'
      errorDiv.style.display = 'block'
      submitBtn.disabled = false
      es.close()
    }
  })
</script>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/AnalysisForm.astro
git commit -m "feat(web): stream analysis via EventSource with timeline + live reasoning panel"
```

---

## Task 12: Agregar el footer de atribución a `Layout.astro`

**Files:**
- Modify: `web/src/layouts/Layout.astro`
- Modify: `web/src/styles/global.css`

- [ ] **Step 1: Actualizar `Layout.astro`**

Reemplaza [web/src/layouts/Layout.astro](web/src/layouts/Layout.astro) por:

```astro
---
interface Props {
  title: string
  activePage?: 'analyze' | 'portfolio'
}

const { title, activePage = 'analyze' } = Astro.props
---

<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title} | Due Diligence Técnico</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div class="container">
      <nav class="nav">
        <div class="nav-brand">Due Diligence <span>Técnico</span></div>
        <div class="nav-links">
          <a href="/" class={activePage === 'analyze' ? 'active' : ''}>Analizar</a>
          <a href="/portfolio" class={activePage === 'portfolio' ? 'active' : ''}>Portfolio</a>
        </div>
      </nav>
      <main class="main">
        <slot />
      </main>
      <footer class="site-footer">
        <p>
          Due Diligence Técnico — desarrollado por
          <a href="https://github.com/dancrewzus" target="_blank" rel="noopener">Daniel Rodríguez</a>
          para el challenge <em>"Construye con Strands Agents"</em> de AWS en
          <strong>Nerdearla Chile 2026</strong>.
        </p>
        <p class="site-footer-links">
          <a href="https://github.com/dancrewzus/duediligence" target="_blank" rel="noopener">
            Ver en GitHub →
          </a>
        </p>
      </footer>
    </div>
  </body>
</html>

<style is:global>
  @import '../styles/global.css';
</style>
```

- [ ] **Step 2: Agregar estilos del footer al final de `global.css`**

Abre [web/src/styles/global.css](web/src/styles/global.css) y agregá al final del archivo (después de la regla `.loading`):

```css
/* Layout wrapper */
.main {
  min-height: calc(100vh - 220px);
}

/* Attribution footer */
.site-footer {
  margin-top: 64px;
  padding: 24px 0 32px;
  border-top: 1px solid var(--border-subtle);
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.6;
}

.site-footer a {
  color: var(--accent-blue);
}

.site-footer em {
  font-style: italic;
  color: var(--text-secondary);
}

.site-footer strong {
  color: var(--text-secondary);
  font-weight: 600;
}

.site-footer-links {
  margin-top: 8px;
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/layouts/Layout.astro web/src/styles/global.css
git commit -m "feat(web): add attribution footer with author + challenge context"
```

---

## Task 13: Resetear `portfolio.json` (dev data, sin migración)

**Files:**
- Delete: `portfolio.json`

- [ ] **Step 1: Resetear el archivo**

Run: `echo '[]' > portfolio.json`

Esto deja el portfolio vacío. Se re-poblará a medida que se hagan análisis nuevos con el schema ampliado.

- [ ] **Step 2: Commit**

```bash
git add portfolio.json
git commit -m "chore: reset portfolio.json to empty (schema changed, no migration)"
```

---

## Task 14: Verificación end-to-end en el browser

Esta es la verificación final — no tiene commits. Corre ambos servidores y validá los 3 objetivos del spec en el navegador.

**Prerequisito**: Ollama arrancado (`ollama serve`) con `llama3.1` descargado, y `.env` con `GITHUB_PERSONAL_ACCESS_TOKEN` válido.

- [ ] **Step 1: Arrancar backend y frontend en paralelo**

Terminal 1:
```bash
npm run dev:server
```

Terminal 2:
```bash
npm run dev:web
```

Esperá a ver ambos listos: `API ready at http://localhost:3001` y Astro en `http://localhost:4321`.

- [ ] **Step 2: Abrir el browser y analizar un repo público**

Abre `http://localhost:4321`. Pegá un URL como `https://github.com/sindresorhus/is-odd` o cualquier repo público pequeño. Click "Analizar".

**Verificación 1 (streaming)**: ¿La sección "Progreso del análisis" aparece y los items del timeline van pasando de círculo hueco → spinner azul → check verde? Si expandís "Razonamiento en vivo", ¿aparecen tokens fluyendo al `<pre>`?

**Verificación 2 (reporte enriquecido)**: Cuando termina, ¿el reporte incluye:
- Una card "Ficha técnica" con chips categorizados?
- Una card "Métricas clave" con números grandes (stars, forks, último commit, etc.)?
- Cada score bar tiene una oración de justificación debajo?
- La fila de deuda técnica muestra el badge y un párrafo de justificación?

**Verificación 3 (footer)**: Al final de la página (y también al navegar a `/portfolio`), ¿aparece el footer con el texto "desarrollado por Daniel Rodríguez" y los links a GitHub?

- [ ] **Step 3: Verificar portfolio**

Navegá a `/portfolio`. El análisis recién hecho debería aparecer en la tabla con su score.

- [ ] **Step 4: Si algo falla**

- **Timeline no avanza**: revisá la consola del browser → Network → el request SSE. Deberías ver eventos llegando. Si no, revisá la consola del server (probablemente error en `agent.stream()` — ver Task 6).
- **Reporte no se parsea**: es alucinación del modelo 8B. Es el trade-off reconocido en el spec. Proba `llama3.1:70b` si tu hardware lo permite, o un repo más conocido donde el modelo tenga más contexto.
- **Footer no aparece**: hard refresh del browser (los styles globales pueden estar cacheados).

---

## Self-Review

**Spec coverage:**
- Sección 1 (streaming SSE): Tasks 3 + 4 (backend) + 11 (frontend EventSource & timeline) + 6 (smoke test). ✓
- Sección 2 (reporte enriquecido): Task 1 (types) + 5 (system prompt) + 7 + 8 + 9 + 10 (componentes) + 11 (render client-side). ✓
- Sección 3 (atribución): Task 12. ✓
- Retrocompat portfolio (decisión "borrar"): Task 13. ✓

**Placeholder scan:** ninguna referencia a TBD/TODO. Todas las funciones, componentes y campos definidos están presentes en tareas anteriores. ✓

**Type consistency:**
- `AnalysisReport` usado en Tasks 1, 2, 4 (server), 10 (ReportCard), 11 (client renderer). Todos consumen los mismos campos: `scores.stackArquitectura.score`/`justificacion`, `tecnologias.frontend`, `metricas.stars`, etc. ✓
- `Stage` type definido en Task 3 y consumido en Task 4. Nombres de stages consistentes. ✓
- `mapToolToStage` firma consistente entre definición y uso. ✓
- `extractReport` retorna `AnalysisReport | null` consistente entre módulos. ✓

Sin gaps detectados.
