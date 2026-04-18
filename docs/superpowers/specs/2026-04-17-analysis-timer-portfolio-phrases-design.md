# Design — Timer de análisis, campos extra en portfolio y frases por stage

**Fecha:** 2026-04-17
**Estado:** aprobado por el usuario, pendiente de plan de implementación

## Contexto

Tres mejoras de UX/persistencia en el flujo de análisis:

1. **Timer del análisis** visible mientras corre, con formato `mm:ss.d` (décimas). El tiempo final se persiste en `portfolio.json`.
2. **Portfolio enriquecido**: guardar la URL completa del repo, la descripción del proyecto y el detalle del veredicto, además de lo que ya se guarda.
3. **Frases dinámicas por stage** que acompañan el label del timeline, rotando cada ~3s, para que la espera se sienta viva.

El análisis hoy toma entre 30s y varios minutos según tamaño de repo y provider (Ollama local vs Bedrock). No hay retroalimentación temporal para el usuario más allá del stage activo; las tres mejoras corrigen eso.

## Decisiones de diseño

### Approach elegido: timer client-side

El timer se mide y renderiza íntegramente en el frontend usando `performance.now()`. El backend solo calcula `duracionMs` una vez al emitir el reporte final y lo persiste.

**Por qué client-side:**
- No hay caso multi-cliente: un solo usuario mira un análisis a la vez.
- Evita overhead de eventos SSE periódicos (`elapsed` cada N ms).
- El "tiempo real" del análisis desde UX es "desde que apreté el botón hasta que vi el reporte" — ese rango lo mide mejor el cliente.
- El backend mide su propio total para portfolio, independiente del reloj del cliente. No hace falta sincronizar.

### Qué se persiste

`PortfolioEntry` actual:

```ts
{ repo, fecha, score, sintesisTecnica }
```

`PortfolioEntry` nuevo:

```ts
{ repo, repoUrl, fecha, score, duracionMs, descripcion, sintesisTecnica, veredictoDetalle }
```

Nota: `repo` se mantiene como `owner/repo`; `repoUrl` es la URL completa (`https://github.com/owner/repo`). Redundancia deliberada — la UI del portfolio ya muestra `repo` como texto; la URL es para hacer el nombre clickeable.

### Frases — pool y rotación

- Un objeto `STAGE_PHRASES: Record<Stage, string[]>` en el script del componente `AnalysisForm.astro`, ~8 frases por stage.
- Al entrar a un stage: elegir una frase aleatoria del pool y mostrarla.
- `setInterval(3000)`: al disparar, elegir otra aleatoria distinta a la actual (evitar repetir consecutivas). Si el pool tiene solo una frase, no rotar.
- Solo el stage en estado `running` muestra frase. Stages `done` muestran solo el label. Al cambiar de stage: limpiar el interval previo y arrancar uno nuevo para el stage entrante.
- Posicionamiento: la frase va a la derecha del `.timeline-label` dentro del mismo `.timeline-item`, en un `<span class="timeline-phrase">` con `color: var(--text-muted)`, `font-size: 0.8rem` y `font-style: italic` — visualmente secundaria frente al label principal.
- Al desmontar el timer (stage `done` global, o error): limpiar interval.

## Cambios por archivo

### Backend

**[src/types/index.ts](src/types/index.ts)**

```ts
// AnalysisReport gana:
duracionMs?: number  // opcional para compatibilidad; el server lo setea al emitir

// PortfolioEntry nuevo:
export interface PortfolioEntry {
  repo: string
  repoUrl: string
  fecha: string
  score: number
  duracionMs: number
  descripcion: string
  sintesisTecnica: string
  veredictoDetalle: string
}
```

**[src/server.ts](src/server.ts)**

- Dentro del handler de `/api/analyze/stream`, antes de `emitStage('starting')`: `const startedAt = Date.now()`.
- Después de extraer `report` y antes del `stream.writeSSE({ event: 'report', ... })`:
  - `report.duracionMs = Date.now() - startedAt`
- Se envía el reporte con `duracionMs` incluido (cliente lo usa para congelar el timer final en el valor del servidor — opcional, ver nota).

> **Nota:** el cliente tiene su propio timer. Al recibir el reporte, podría reemplazar su valor por el del servidor para coherencia con lo persistido — o dejar el del cliente (que suele ser igual ± unos ms por latencia SSE). Decisión: **usar el del servidor** al recibir `report`, para que lo que ve el usuario sea lo que está en portfolio.

**[src/session/portfolio.ts](src/session/portfolio.ts)**

- `persistReport(report)`: construir la entry con los nuevos campos desde `report`. `repoUrl` derivada como `` `https://github.com/${report.repo}` `` (ya que `repo` es `owner/repo`).
- `saveAnalysis` tool: el agente puede llamarla como fallback. Ampliar su `inputSchema` con los mismos campos, todos opcionales salvo los ya existentes, para no romper el contrato actual si el modelo no los envía. Si faltan al guardar, usar strings vacíos y `duracionMs: 0`.

### Frontend

**[web/src/components/AnalysisForm.astro](web/src/components/AnalysisForm.astro)**

HTML:
- Agregar `<span id="timer" class="timer">00:00.0</span>` dentro de `.progress-title`, alineado a la derecha (usar `margin-left: auto` o reestructurar el flex).
- Dentro de cada `.timeline-item`, tras el `.timeline-label`, agregar `<span class="timeline-phrase"></span>`.

CSS:
- `.timer`: `font-family: 'JetBrains Mono', ...`, `font-variant-numeric: tabular-nums`, `font-size: 0.85rem`, `color: var(--text-secondary)`. Cuando el análisis terminó, clase `.timer-final` con `color: var(--accent-green)`.
- `.timeline-phrase`: `margin-left: 12px`, `font-size: 0.8rem`, `font-style: italic`, `color: var(--text-muted)`, `opacity: 0`, `transition: opacity 0.4s var(--ease-out)`. Clase `.visible` la sube a `opacity: 1`.
- Solo `.timeline-item.running .timeline-phrase` se hace visible. Los demás quedan en `opacity: 0`.
- Animación de crossfade al rotar: tocar `.visible` off → cambiar texto → on (con un pequeño timeout de ~200ms entre off y on).

JS:
- `STAGE_PHRASES`: objeto con ~8 frases por stage (ver pool abajo).
- `tickerInterval` y `phraseInterval` como variables del scope del submit handler (o globales del script).
- En `form.addEventListener('submit', ...)`:
  - Al arrancar: `startedAt = performance.now()`, `timerInterval = setInterval(updateTimer, 50)` (50ms para que las décimas se vean fluidas sin stress). Limpiar cualquier interval previo antes.
  - `updateTimer()`: `const ms = performance.now() - startedAt; timerEl.textContent = formatTimer(ms)`.
  - `formatTimer(ms)`: calcula minutos, segundos, décimas → `MM:SS.D`.
- En `setStage(stage)`:
  - Limpiar `phraseInterval` previo.
  - Quitar `.visible` de todas las `.timeline-phrase` y limpiar su `textContent`.
  - Para el stage nuevo (`running`): elegir frase random de `STAGE_PHRASES[stage]`, setear `textContent`, tras 50ms agregar `.visible`.
  - `phraseInterval = setInterval(rotatePhrase, 3000)` donde `rotatePhrase` elige otra random distinta a la actual, crossfade out → cambio → fade in.
- En el handler del evento `report`:
  - Leer `report.duracionMs`, formatearlo, reemplazar el texto del timer.
  - `clearInterval(timerInterval)`, `clearInterval(phraseInterval)`.
  - Clase `.timer-final` al elemento timer.
  - Quitar frase del stage activo.
- En `error` y `done`: limpiar ambos intervals. En `done`, si ya vino `report` antes, no tocar el timer (ya congelado); si no vino, congelar en el valor actual.

**[web/src/components/PortfolioTable.astro](web/src/components/PortfolioTable.astro)**

- `PortfolioItem` interface del script: agregar los campos nuevos (opcionales para compatibilidad con filas antiguas que no los tengan).
- En `renderList()`:
  - El `repo` se vuelve un `<a href="${escapeHtml(item.repoUrl ?? buildRepoUrl(item.repo))}" target="_blank" rel="noopener">` con estilo hover; fallback para entradas viejas que no tengan `repoUrl`.
  - Agregar pill de duración en `.portfolio-row-meta` al lado de la fecha: `<span class="portfolio-duration">⏱ ${formatDuration(item.duracionMs)}</span>`. Fallback: si no hay `duracionMs`, no mostrar.
  - `formatDuration(ms)`: `< 60s` → `42.3s`; `>= 60s` → `2m 15s`.

### Pool de frases (incluido en el componente)

Las frases son en español, tono casual-técnico, coherentes con el tono "CTO senior con 15 años" pero con un guiño de simpatía durante la espera.

**starting** (iniciando análisis):
- "Calentando motores"
- "Conectando con GitHub"
- "Armando el caso"
- "Tomando el primer café"
- "Revisando credenciales"
- "Afilando el lápiz"
- "Abriendo el repo en el IDE mental"
- "Preparando el checklist"

**fetching_metadata** (leyendo estructura):
- "Leyendo package.json"
- "Espiando el tsconfig"
- "Contando archivos de config"
- "Buscando el README"
- "Mapeando la estructura de carpetas"
- "Revisando dependencias"
- "Chequeando linters y formatters"
- "Viendo si hay Dockerfile"

**analyzing_activity** (actividad del equipo):
- "Mirando commits recientes"
- "Chusmeando el log de git"
- "Contando contributors activos"
- "Revisando PRs abiertos"
- "Viendo qué tan vivo está el repo"
- "Pulseando la velocidad del equipo"
- "Buscando bus factor"
- "Revisando si hay actividad real o es un repo zombi"

**evaluating** (evaluando dimensiones):
- "Puntuando arquitectura"
- "Midiendo deuda técnica"
- "Evaluando seguridad"
- "Cruzando señales"
- "Pensando como inversor"
- "Poniendo la lupa en el código"
- "Contrastando con benchmarks"
- "Separando el humo del fuego"

**generating_report** (armando el reporte):
- "Redactando veredicto"
- "Apretando los scores"
- "Sacando las conclusiones"
- "Eligiendo las fortalezas"
- "Listando las banderas"
- "Dando formato al JSON"
- "Firmando el reporte"
- "Haciendo revisión final"

## Data flow

```
submit                                      server
  │                                           │
  │ startedAt = performance.now()             │
  │ timerInterval(50ms) → update DOM          │
  │ phraseInterval(3000ms) → rotate phrase    │
  │                                           │ startedAt_server = Date.now()
  │         SSE: stage=starting              ←│ emitStage('starting')
  │         SSE: stage=fetching_metadata     ←│
  │         SSE: stage=analyzing_activity    ←│
  │         ...tokens...                     ←│
  │                                           │ report = extractReport(buffer)
  │                                           │ report.duracionMs = Date.now() - startedAt_server
  │         SSE: report                      ←│ persistReport(report) → portfolio.json
  │ clearInterval(timer, phrase)              │
  │ show report.duracionMs (frozen)           │
  │                                           │
```

## Testing

Al ser UI interactiva, la verificación es manual:

1. **Timer visible y fluido**: iniciar análisis, ver `mm:ss.d` contando desde `00:00.0`. Las décimas deben cambiar varias veces por segundo.
2. **Timer final coherente**: cuando llega el reporte, el timer queda congelado en el valor del servidor (muy cerca del último mostrado).
3. **Frases rotan**: durante un análisis largo, verificar que la frase del stage activo cambia cada ~3s y es distinta a la anterior.
4. **Frases por stage correcto**: al cambiar de stage, la frase cambia al pool del stage nuevo; el stage anterior (ya `done`) no muestra frase.
5. **Portfolio enriquecido**: tras un análisis, abrir `portfolio.json` y verificar que contiene los 4 campos nuevos.
6. **UI del portfolio**: ir a `/portfolio`, ver duración mostrada, verificar que el nombre del repo es link clickeable al repo de GitHub.
7. **Retrocompatibilidad**: entradas viejas del portfolio (sin `repoUrl`/`duracionMs`/etc.) siguen renderizando sin romper la UI.
8. **Cleanup**: iniciar análisis, esperar stage, cerrar antes de terminar (refresh). Iniciar otro. Verificar que no haya timers/intervals huérfanos (timer no debe mostrar valores locos, frases no deben "parpadear" del análisis anterior).

## Fuera de scope

- Métricas históricas de duración (promedio por repo, trending, etc.).
- Estimación de tiempo restante.
- Frases internacionalizadas — todo queda en español.
- Timer granular por stage (cuánto tardó cada paso individualmente). Se descartó en el approach elegido.
- Cancelación visible del timer si el usuario cancela el análisis (el cleanup ya ocurre; no se expone botón de cancelar).
