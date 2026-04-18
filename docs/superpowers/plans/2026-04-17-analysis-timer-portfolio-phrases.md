# Analysis Timer, Portfolio Enrichment & Stage Phrases — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un timer `mm:ss.d` visible durante el análisis, enriquecer `portfolio.json` con `repoUrl`/`descripcion`/`veredictoDetalle`/`duracionMs`, y mostrar frases rotativas aleatorias por stage en el timeline del frontend.

**Architecture:** Timer medido en cliente con `performance.now()` y renderizado cada 50ms; backend solo calcula duración total con `Date.now()` al emitir el reporte y la persiste. Frases cliente-side con pool por stage y rotación cada 3s; cleanup de intervals al cambiar de stage o terminar.

**Tech Stack:** TypeScript ESM, Hono + SSE (backend), Astro 5 (frontend), sin framework de tests — verificación manual end-to-end.

**Spec:** [docs/superpowers/specs/2026-04-17-analysis-timer-portfolio-phrases-design.md](../specs/2026-04-17-analysis-timer-portfolio-phrases-design.md)

---

## File structure

Se modifican 5 archivos, ninguno se crea de cero:

- [src/types/index.ts](../../../src/types/index.ts) — tipos `AnalysisReport` y `PortfolioEntry` extendidos.
- [src/session/portfolio.ts](../../../src/session/portfolio.ts) — `persistReport` escribe los campos nuevos; `saveAnalysis` amplía `inputSchema`.
- [src/server.ts](../../../src/server.ts) — mide `duracionMs` y lo adjunta al reporte antes de emitir/persistir.
- [web/src/components/AnalysisForm.astro](../../../web/src/components/AnalysisForm.astro) — HTML/CSS del timer y las frases; JS del timer, pool de frases, rotación, y cleanup.
- [web/src/components/PortfolioTable.astro](../../../web/src/components/PortfolioTable.astro) — link clickeable del repo + pill de duración.

No hay tests automáticos — el proyecto no tiene framework de tests instalado. Cada task que no sea trivial cierra con una verificación manual concreta (chequear archivo, correr dev server, hacer un análisis real) antes de commitear.

---

## Task 1: Extender tipos `AnalysisReport` y `PortfolioEntry`

**Files:**
- Modify: [src/types/index.ts](../../../src/types/index.ts)

- [ ] **Step 1: Agregar `duracionMs` opcional a `AnalysisReport`**

Abrí `src/types/index.ts` y en la interface `AnalysisReport` (líneas 71-86), agregá `duracionMs?: number` justo después de `sintesisTecnica`:

```ts
export interface AnalysisReport {
  repo: string
  descripcion: string
  fecha: string
  scores: AnalysisScores
  tecnologias: TechStack
  metricas: RepoMetrics
  deudaTecnica: 'Alta' | 'Media' | 'Baja'
  deudaJustificacion: string
  scoreTotal: number
  banderas: string[]
  fortalezas: string[]
  veredicto: Veredicto
  veredictoDetalle: string
  sintesisTecnica: string
  duracionMs?: number
}
```

El `?` es intencional: el modelo no lo emite, lo setea el server antes de persistir. Los consumidores downstream deben tolerar su ausencia solo en tests, en runtime siempre llega.

- [ ] **Step 2: Reemplazar `PortfolioEntry` con la versión enriquecida**

Reemplazá el bloque de `PortfolioEntry` (líneas 88-93) por:

```ts
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

- [ ] **Step 3: Type-check**

Corré: `npx tsc --noEmit`
Esperá: errores en `src/session/portfolio.ts` y `src/server.ts` referentes a `repoUrl`, `duracionMs`, `descripcion`, `veredictoDetalle` no presentes en la construcción de la entry. Esto es esperado — los siguientes tasks los resuelven.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): extender AnalysisReport y PortfolioEntry con duracionMs, repoUrl, descripcion, veredictoDetalle"
```

---

## Task 2: Escribir campos nuevos en `persistReport`

**Files:**
- Modify: [src/session/portfolio.ts](../../../src/session/portfolio.ts)

- [ ] **Step 1: Actualizar `persistReport` para construir la entry completa**

Reemplazá el cuerpo de la función `persistReport` (líneas 44-53) por:

```ts
export function persistReport(report: AnalysisReport): void {
  const portfolio = loadPortfolio()
  portfolio.push({
    repo: report.repo,
    repoUrl: `https://github.com/${report.repo}`,
    fecha: new Date().toISOString(),
    score: report.scoreTotal,
    duracionMs: report.duracionMs ?? 0,
    descripcion: report.descripcion ?? '',
    sintesisTecnica: report.sintesisTecnica,
    veredictoDetalle: report.veredictoDetalle ?? '',
  })
  writeFileSync(PORTFOLIO_PATH, JSON.stringify(portfolio, null, 2), 'utf-8')
}
```

`report.repo` viene como `owner/repo`, por eso se concatena con `https://github.com/`. El `?? 0` y `?? ''` son por defensa — el server siempre los llena, pero si por algún camino raro llega un reporte sin ellos, no rompe.

- [ ] **Step 2: Ampliar `saveAnalysis` tool schema**

Reemplazá el bloque `saveAnalysis` (líneas 22-42) por:

```ts
export const saveAnalysis = tool({
  name: 'save_analysis',
  description: 'Save a completed analysis to the portfolio. Call this after generating a due diligence report.',
  inputSchema: z.object({
    repo: z.string().describe('Full repo name owner/repo'),
    score: z.number().describe('Overall technical score 0-10'),
    sintesisTecnica: z.string().describe('Brief technical synthesis of the analysis in Spanish'),
    descripcion: z.string().optional().describe('What the project is/does (1-3 sentences, <=500 chars)'),
    veredictoDetalle: z.string().optional().describe('Verdict detail text in Spanish'),
    duracionMs: z.number().optional().describe('Analysis duration in milliseconds'),
  }),
  callback: (input) => {
    const portfolio = loadPortfolio()
    const entry: PortfolioEntry = {
      repo: input.repo,
      repoUrl: `https://github.com/${input.repo}`,
      fecha: new Date().toISOString(),
      score: input.score,
      duracionMs: input.duracionMs ?? 0,
      descripcion: input.descripcion ?? '',
      sintesisTecnica: input.sintesisTecnica,
      veredictoDetalle: input.veredictoDetalle ?? '',
    }
    portfolio.push(entry)
    savePortfolio(portfolio)
    return `Analysis saved for ${input.repo} with score ${input.score}/10.`
  },
})
```

Los nuevos campos son `.optional()` porque el modelo puede no emitirlos en la tool call (el flujo principal es `persistReport` llamado desde el server, no esta tool). Si llegan, se guardan; si no, defaults seguros.

- [ ] **Step 3: Type-check**

Corré: `npx tsc --noEmit`
Esperá: sigue el error en `src/server.ts` (que set-ea `report.duracionMs = ...` pero aún no — lo resolvemos en Task 3). `src/session/portfolio.ts` debería compilar OK.

- [ ] **Step 4: Commit**

```bash
git add src/session/portfolio.ts
git commit -m "feat(portfolio): persistir repoUrl, descripcion, veredictoDetalle y duracionMs"
```

---

## Task 3: Medir y adjuntar `duracionMs` en el server

**Files:**
- Modify: [src/server.ts](../../../src/server.ts)

- [ ] **Step 1: Capturar `startedAt` antes del `emitStage('starting')`**

En `src/server.ts`, dentro de `streamSSE(c, async (stream) => { ... })`, justo después del bloque `try {` (línea 46) y antes de cualquier otra lógica, agregá:

```ts
    try {
      const startedAt = Date.now()
      const mcpClient = await getSharedMcp()
```

La línea `const startedAt = Date.now()` va inmediatamente después de `try {`, antes de `const mcpClient = ...`. Esto captura el momento exacto en que el handler empieza, que es lo más cercano a cuando el usuario vio el primer feedback del progreso.

- [ ] **Step 2: Setear `report.duracionMs` antes de emitirlo**

Dentro del bloque `if (report) { ... }` (líneas 154-162), **antes** de `report.repo = ...`, agregá:

```ts
      if (report) {
        report.duracionMs = Date.now() - startedAt
        report.repo = `${parsed.owner}/${parsed.repo}`
        report.fecha = new Date().toISOString()
        await stream.writeSSE({ event: 'report', data: JSON.stringify(report) })
        try {
          persistReport(report)
        } catch (persistErr) {
          console.error('[server] persistReport failed:', persistErr)
        }
      } else {
```

De esta forma `duracionMs` viaja en el evento SSE `report` (el cliente lo usa para congelar el timer final) y también se pasa a `persistReport` (que lo escribe en `portfolio.json`).

- [ ] **Step 3: Type-check**

Corré: `npx tsc --noEmit`
Esperá: sin errores.

- [ ] **Step 4: Verificación funcional**

Arrancá el server: `npm run dev:server` en una terminal.
En otra terminal, corré:

```bash
curl -N "http://localhost:3001/api/analyze/stream?repoUrl=https://github.com/honojs/hono&provider=ollama"
```

(O reemplazá por `provider=bedrock` si preferís; con `ollama` necesitás Ollama corriendo local.)

Buscá en el output el evento `event: report` — el JSON que le sigue debe contener `"duracionMs": <numero>`. Luego abrí `portfolio.json` y verificá que la última entry tiene `repoUrl`, `descripcion`, `veredictoDetalle` y `duracionMs` poblados.

Si falla el análisis del modelo (ej. Ollama devuelve prosa sin JSON), eso no es problema de este task — el task verifica que cuando el reporte SÍ se arma, lleva `duracionMs`.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts
git commit -m "feat(server): medir duracionMs del análisis y adjuntarlo al reporte/portfolio"
```

---

## Task 4: HTML y CSS del timer en el panel de progreso

**Files:**
- Modify: [web/src/components/AnalysisForm.astro](../../../web/src/components/AnalysisForm.astro)

- [ ] **Step 1: Agregar el span del timer en `.progress-title`**

En `web/src/components/AnalysisForm.astro`, reemplazá el bloque `.progress-title` (líneas 48-51) por:

```astro
    <h3 class="progress-title">
      <span class="progress-dot"></span>
      Progreso del análisis
      <span id="timer" class="timer">00:00.0</span>
    </h3>
```

- [ ] **Step 2: Agregar CSS del timer**

En el bloque `<style>` del componente, justo después del selector `.progress-dot { ... }` (termina en la línea 251), agregá:

```css
  .progress-title {
    justify-content: flex-start;
  }

  .timer {
    margin-left: auto;
    font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
    font-variant-numeric: tabular-nums;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-secondary);
    letter-spacing: 0.02em;
    padding: 4px 10px;
    background: rgba(7, 7, 13, 0.4);
    border: 1px solid var(--border-subtle);
    border-radius: 999px;
    transition: color 0.3s var(--ease-out), border-color 0.3s var(--ease-out);
  }

  .timer-final {
    color: var(--accent-green);
    border-color: rgba(52, 211, 153, 0.3);
    background: rgba(52, 211, 153, 0.08);
  }
```

`margin-left: auto` empuja el timer al extremo derecho del flex container (el `h3.progress-title` tiene `display: flex` con `align-items: center; gap: 10px` en su definición existente).

- [ ] **Step 3: Verificación visual**

Arrancá `npm run dev:web` y abrí [http://localhost:4321](http://localhost:4321).
Pegá una URL de repo cualquiera (sin enviar aún) y submiteá — el panel de progreso aparece con `00:00.0` en la derecha. Aunque todavía no se mueva (sin JS del timer), la pill debe verse bien alineada.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/AnalysisForm.astro
git commit -m "feat(web): estructura HTML/CSS del timer en el panel de progreso"
```

---

## Task 5: Lógica JS del timer (start, tick, congelar)

**Files:**
- Modify: [web/src/components/AnalysisForm.astro](../../../web/src/components/AnalysisForm.astro) (sección `<script>`)

- [ ] **Step 1: Agregar referencia al DOM y helpers**

En el `<script>`, justo después de la línea `const providerSelect = document.getElementById('provider-select') as HTMLSelectElement` (línea 822), agregá:

```ts
  const timerEl = document.getElementById('timer') as HTMLSpanElement

  function formatTimer(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    const tenths = Math.floor((ms % 1000) / 100)
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`
  }
```

- [ ] **Step 2: Declarar estado del timer**

Justo después de `let activeEs: EventSource | null = null` (línea 1158) y la línea `let lastAnalysisProvider...`, agregá:

```ts
  let timerInterval: number | null = null
  let timerStartedAt = 0

  function startTimer() {
    stopTimer()
    timerEl.classList.remove('timer-final')
    timerStartedAt = performance.now()
    timerEl.textContent = '00:00.0'
    timerInterval = window.setInterval(() => {
      timerEl.textContent = formatTimer(performance.now() - timerStartedAt)
    }, 50)
  }

  function stopTimer() {
    if (timerInterval !== null) {
      clearInterval(timerInterval)
      timerInterval = null
    }
  }

  function freezeTimer(ms: number) {
    stopTimer()
    timerEl.textContent = formatTimer(ms)
    timerEl.classList.add('timer-final')
  }
```

- [ ] **Step 3: Llamar `startTimer` al submitear**

En el handler `form.addEventListener('submit', ...)` (línea 1161), después de `setStage('starting')` (línea 1176), agregá:

```ts
    setStage('starting')
    startTimer()
```

- [ ] **Step 4: Congelar con el valor del server al recibir `report`**

En el handler del evento `report` (línea 1197), reemplazá el cuerpo por:

```ts
    es.addEventListener('report', (e: MessageEvent) => {
      try {
        const report = JSON.parse(e.data)
        if (typeof report.duracionMs === 'number') {
          freezeTimer(report.duracionMs)
        } else {
          stopTimer()
        }
        markAllDone()
        reportContainer.innerHTML = renderReport(report)
        progressDiv.style.display = 'none'
        wireChatPanel(report.repo)
      } catch (err) {
        stopTimer()
        stopTimelineSpinner()
        errorText.textContent = 'Error al parsear el reporte'
        errorDiv.style.display = 'block'
      }
    })
```

> **Nota:** al resolver el reporte, `progressDiv.style.display = 'none'` oculta todo el panel (incluyendo el timer). El usuario ve el valor final solo brevemente antes de que se oculte. Esto es intencional — el reporte es el foco una vez listo; la duración queda persistida en el portfolio. No cambies ese comportamiento.

- [ ] **Step 5: Limpiar timer en errores y `done`**

En el handler `error` (línea 1211), después de `stopTimelineSpinner()`, agregá `stopTimer()`:

```ts
    es.addEventListener('error' as any, (e: MessageEvent) => {
      if (!(e as MessageEvent).data) return
      try {
        const { message } = JSON.parse((e as MessageEvent).data)
        stopTimer()
        stopTimelineSpinner()
        errorText.textContent = message || 'Error durante el análisis'
        errorDiv.style.display = 'block'
      } catch {}
    })
```

En `es.onerror` (línea 1229), igual:

```ts
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return
      stopTimer()
      stopTimelineSpinner()
      errorText.textContent = 'Conexión perdida con el servidor'
      errorDiv.style.display = 'block'
      submitBtn.disabled = false
      es.close()
      activeEs = null
    }
```

En el handler `done` (línea 1222), también agregá `stopTimer()`:

```ts
    es.addEventListener('done', () => {
      stopTimer()
      stopTimelineSpinner()
      es.close()
      activeEs = null
      submitBtn.disabled = false
    })
```

- [ ] **Step 6: Verificación funcional**

Con `npm run dev:web` corriendo y el server backend también (`npm run dev:server`), submiteá un análisis real. El timer debe:
1. Arrancar en `00:00.0` al apretar Analizar.
2. Avanzar visiblemente cada décima de segundo.
3. Congelar al valor final (color verde) justo antes de que el panel de progreso se oculte.

Si el análisis falla, el timer debe detenerse (no seguir corriendo) y el panel de error aparece.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/AnalysisForm.astro
git commit -m "feat(web): timer mm:ss.d durante el análisis con congelado al valor del servidor"
```

---

## Task 6: HTML y CSS de las frases por stage

**Files:**
- Modify: [web/src/components/AnalysisForm.astro](../../../web/src/components/AnalysisForm.astro)

- [ ] **Step 1: Agregar el span de frase en cada `.timeline-item`**

Reemplazá el bloque `<ol id="timeline" class="timeline">...</ol>` (líneas 52-58) por:

```astro
    <ol id="timeline" class="timeline">
      <li class="timeline-item" data-stage="starting"><span class="timeline-icon"></span><span class="timeline-label">Iniciando análisis</span><span class="timeline-phrase"></span></li>
      <li class="timeline-item" data-stage="fetching_metadata"><span class="timeline-icon"></span><span class="timeline-label">Leyendo estructura del repo</span><span class="timeline-phrase"></span></li>
      <li class="timeline-item" data-stage="analyzing_activity"><span class="timeline-icon"></span><span class="timeline-label">Analizando actividad del equipo</span><span class="timeline-phrase"></span></li>
      <li class="timeline-item" data-stage="evaluating"><span class="timeline-icon"></span><span class="timeline-label">Evaluando dimensiones técnicas</span><span class="timeline-phrase"></span></li>
      <li class="timeline-item" data-stage="generating_report"><span class="timeline-icon"></span><span class="timeline-label">Generando reporte final</span><span class="timeline-phrase"></span></li>
    </ol>
```

- [ ] **Step 2: CSS de `.timeline-phrase`**

Dentro del `<style>`, justo después del selector `.timeline-item.done { color: var(--text-secondary); }` (línea 334), agregá:

```css
  .timeline-phrase {
    margin-left: 12px;
    font-size: 0.8rem;
    font-style: italic;
    color: var(--text-muted);
    opacity: 0;
    transition: opacity 0.35s var(--ease-out);
  }

  .timeline-phrase.visible {
    opacity: 1;
  }
```

Solo los items en estado `running` tendrán `.visible` en su `.timeline-phrase`. Los items `done` quedan con frase vacía / `opacity: 0`, así el layout permanece estable si después cambiás de idea.

- [ ] **Step 3: Verificación visual**

Arrancá `npm run dev:web` y submiteá un análisis. Los items del timeline deben verse iguales a antes (ningún texto extra visible porque el `textContent` de las frases está vacío). Solo verificás que el markup no rompe el layout.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/AnalysisForm.astro
git commit -m "feat(web): markup y CSS de frases por stage en el timeline (sin lógica aún)"
```

---

## Task 7: Pool de frases y lógica de rotación

**Files:**
- Modify: [web/src/components/AnalysisForm.astro](../../../web/src/components/AnalysisForm.astro) (sección `<script>`)

- [ ] **Step 1: Agregar el pool de frases**

En el `<script>`, justo después de la constante `STAGE_ORDER` (línea 833), agregá:

```ts
  const STAGE_PHRASES: Record<string, string[]> = {
    starting: [
      'Calentando motores',
      'Conectando con GitHub',
      'Armando el caso',
      'Tomando el primer café',
      'Revisando credenciales',
      'Afilando el lápiz',
      'Abriendo el repo en el IDE mental',
      'Preparando el checklist',
    ],
    fetching_metadata: [
      'Leyendo package.json',
      'Espiando el tsconfig',
      'Contando archivos de config',
      'Buscando el README',
      'Mapeando la estructura de carpetas',
      'Revisando dependencias',
      'Chequeando linters y formatters',
      'Viendo si hay Dockerfile',
    ],
    analyzing_activity: [
      'Mirando commits recientes',
      'Chusmeando el log de git',
      'Contando contributors activos',
      'Revisando PRs abiertos',
      'Viendo qué tan vivo está el repo',
      'Pulseando la velocidad del equipo',
      'Buscando bus factor',
      'Revisando si hay actividad real o es un repo zombi',
    ],
    evaluating: [
      'Puntuando arquitectura',
      'Midiendo deuda técnica',
      'Evaluando seguridad',
      'Cruzando señales',
      'Pensando como inversor',
      'Poniendo la lupa en el código',
      'Contrastando con benchmarks',
      'Separando el humo del fuego',
    ],
    generating_report: [
      'Redactando veredicto',
      'Apretando los scores',
      'Sacando las conclusiones',
      'Eligiendo las fortalezas',
      'Listando las banderas',
      'Dando formato al JSON',
      'Firmando el reporte',
      'Haciendo revisión final',
    ],
  }
```

- [ ] **Step 2: Declarar estado y helpers de rotación**

Después del bloque del timer (justo después de `function freezeTimer(ms: number) { ... }` del Task 5), agregá:

```ts
  let phraseInterval: number | null = null
  let activePhraseStage: string | null = null
  let currentPhraseIdx = -1

  function pickRandomPhraseIdx(stage: string, avoidIdx: number): number {
    const pool = STAGE_PHRASES[stage]
    if (!pool || pool.length === 0) return -1
    if (pool.length === 1) return 0
    let idx = Math.floor(Math.random() * pool.length)
    if (idx === avoidIdx) {
      idx = (idx + 1) % pool.length
    }
    return idx
  }

  function getPhraseEl(stage: string): HTMLSpanElement | null {
    return document.querySelector(`.timeline-item[data-stage="${stage}"] .timeline-phrase`)
  }

  function stopPhrases() {
    if (phraseInterval !== null) {
      clearInterval(phraseInterval)
      phraseInterval = null
    }
    if (activePhraseStage) {
      const prevEl = getPhraseEl(activePhraseStage)
      if (prevEl) {
        prevEl.classList.remove('visible')
        prevEl.textContent = ''
      }
    }
    activePhraseStage = null
    currentPhraseIdx = -1
  }

  function startPhrasesForStage(stage: string) {
    stopPhrases()
    const pool = STAGE_PHRASES[stage]
    if (!pool || pool.length === 0) return
    const phraseEl = getPhraseEl(stage)
    if (!phraseEl) return

    activePhraseStage = stage
    currentPhraseIdx = pickRandomPhraseIdx(stage, -1)
    phraseEl.textContent = pool[currentPhraseIdx]
    window.setTimeout(() => {
      if (activePhraseStage === stage) phraseEl.classList.add('visible')
    }, 50)

    phraseInterval = window.setInterval(() => {
      if (activePhraseStage !== stage) return
      const nextIdx = pickRandomPhraseIdx(stage, currentPhraseIdx)
      phraseEl.classList.remove('visible')
      window.setTimeout(() => {
        if (activePhraseStage !== stage) return
        currentPhraseIdx = nextIdx
        phraseEl.textContent = pool[nextIdx]
        phraseEl.classList.add('visible')
      }, 250)
    }, 3000)
  }
```

Notas de diseño:
- `pickRandomPhraseIdx` evita repetir la misma frase consecutivamente (salvo que el pool tenga 1 sola frase).
- El `setTimeout(50ms)` inicial da tiempo a que el navegador aplique el `textContent` antes de agregar `.visible` — así la transición CSS se dispara.
- El crossfade al rotar es: quitar `.visible` (empieza fade out, 250ms) → cambiar texto → agregar `.visible` (fade in). El total es ~500ms entre cambios de texto, muy por debajo del intervalo de 3000ms.
- Todos los timeouts/interval chequean `activePhraseStage !== stage` antes de actuar para evitar race conditions cuando el stage cambia rápido.

- [ ] **Step 3: Arrancar/rotar frases al cambiar de stage**

Modificá `setStage` (línea 875-885) para que arranque frases del stage nuevo. Reemplazá la función entera por:

```ts
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
    startPhrasesForStage(stage)
  }
```

- [ ] **Step 4: Limpiar frases en `resetTimeline`**

Modificá `resetTimeline` (línea 868-873) por:

```ts
  function resetTimeline() {
    document.querySelectorAll('.timeline-item').forEach((el) => {
      el.classList.remove('running', 'done')
    })
    document.querySelectorAll('.timeline-phrase').forEach((el) => {
      el.classList.remove('visible')
      el.textContent = ''
    })
    reasoningPre.textContent = ''
  }
```

- [ ] **Step 5: Parar frases al terminar el análisis**

En todos los puntos donde ya llamás `stopTimer()`, agregá `stopPhrases()` justo al lado:

- En el handler `report` (Task 5, Step 4): dentro del `try` antes de `markAllDone`, y en el `catch` después de `stopTimer()`.
- En el handler `error` (Task 5, Step 5): después de `stopTimer()`.
- En `es.onerror` (Task 5, Step 5): después de `stopTimer()`.
- En el handler `done` (Task 5, Step 5): después de `stopTimer()`.

Ejemplo del handler `report` con ambos:

```ts
    es.addEventListener('report', (e: MessageEvent) => {
      try {
        const report = JSON.parse(e.data)
        if (typeof report.duracionMs === 'number') {
          freezeTimer(report.duracionMs)
        } else {
          stopTimer()
        }
        stopPhrases()
        markAllDone()
        reportContainer.innerHTML = renderReport(report)
        progressDiv.style.display = 'none'
        wireChatPanel(report.repo)
      } catch (err) {
        stopTimer()
        stopPhrases()
        stopTimelineSpinner()
        errorText.textContent = 'Error al parsear el reporte'
        errorDiv.style.display = 'block'
      }
    })
```

- [ ] **Step 6: Verificación funcional**

Arrancá server y web, submiteá un análisis real. Verificá:
1. Al entrar cada stage, aparece una frase en italic a la derecha del label, tras un pequeño fade-in.
2. Si el stage dura más de 3s, la frase cambia — fade out, nuevo texto, fade in.
3. La frase no es la misma dos veces seguidas.
4. Al pasar al siguiente stage, el anterior pierde su frase (vuelve a vacío / opacity 0), y el nuevo muestra una frase de su propio pool.
5. Al terminar el análisis, ningún stage muestra frase (el panel igual se oculta, pero si abrís inspector no deberías ver intervals huérfanos).

Chequeo extra: abrí DevTools → Performance → Timers y verificá que no haya intervals de 3000ms quedando activos después de que termina el análisis. Alternativamente, `setInterval` + `console.log` temporal durante debugging.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/AnalysisForm.astro
git commit -m "feat(web): frases aleatorias rotando cada 3s por stage con crossfade"
```

---

## Task 8: Link clickeable del repo en el portfolio

**Files:**
- Modify: [web/src/components/PortfolioTable.astro](../../../web/src/components/PortfolioTable.astro)

- [ ] **Step 1: Actualizar la interface `PortfolioItem`**

En el `<script>`, reemplazá la interface `PortfolioItem` (líneas 332-337) por:

```ts
  interface PortfolioItem {
    repo: string
    repoUrl?: string
    fecha: string
    score: number
    duracionMs?: number
    descripcion?: string
    sintesisTecnica: string
    veredictoDetalle?: string
  }
```

Los nuevos campos son opcionales para tolerar entradas viejas del portfolio (guardadas antes de este cambio).

- [ ] **Step 2: Agregar helper de URL con fallback**

Justo antes de `function getScoreColor(...)` (línea 342), agregá:

```ts
  function buildRepoUrl(item: PortfolioItem): string {
    return item.repoUrl ?? `https://github.com/${item.repo}`
  }
```

- [ ] **Step 3: Convertir el nombre del repo en link**

En `renderList()` (líneas 354-378), reemplazá la línea:

```ts
              <div class="portfolio-row-repo">${escapeHtml(item.repo)}</div>
```

por:

```ts
              <div class="portfolio-row-repo"><a class="portfolio-row-repo-link" href="${escapeHtml(buildRepoUrl(item))}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.repo)}</a></div>
```

- [ ] **Step 4: Estilo del link**

En el bloque `<style>`, después del selector `.portfolio-row-repo { ... }` (termina en la línea 260), agregá:

```css
  .portfolio-row-repo-link {
    color: inherit;
    text-decoration: none;
    transition: color 0.25s var(--ease-out);
  }

  .portfolio-row-repo-link:hover {
    color: var(--accent-blue);
    text-decoration: underline;
    text-decoration-color: rgba(110, 168, 255, 0.5);
    text-underline-offset: 4px;
  }
```

- [ ] **Step 5: Verificación visual**

Arrancá `npm run dev:web`. Si hay entradas en `portfolio.json`, ir a `/portfolio`. Al hacer hover en el nombre del repo, el texto se pone azul con underline. Al clickear, abre la URL en nueva pestaña. Para entradas viejas sin `repoUrl`, el fallback `https://github.com/${item.repo}` funciona igual.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/PortfolioTable.astro
git commit -m "feat(web/portfolio): nombre del repo clickeable al repositorio de GitHub"
```

---

## Task 9: Pill de duración en el portfolio

**Files:**
- Modify: [web/src/components/PortfolioTable.astro](../../../web/src/components/PortfolioTable.astro)

- [ ] **Step 1: Helper de formato de duración**

Justo después de `buildRepoUrl` (Task 8, Step 2), agregá:

```ts
  function formatDuration(ms: number | undefined): string | null {
    if (typeof ms !== 'number' || ms <= 0) return null
    if (ms < 60_000) {
      const seconds = ms / 1000
      return `${seconds.toFixed(1)}s`
    }
    const totalSeconds = Math.round(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}m ${seconds}s`
  }
```

Si no hay duración (entrada vieja, o `0`), retorna `null` → el markup no muestra pill.

- [ ] **Step 2: Mostrar pill en `.portfolio-row-meta`**

En `renderList()`, dentro del map, reemplazá el bloque:

```ts
              <div class="portfolio-row-meta">
                ${calIcon}<span>${fecha}</span>
              </div>
```

por:

```ts
              <div class="portfolio-row-meta">
                ${calIcon}<span>${fecha}</span>
                ${(() => {
                  const dur = formatDuration(item.duracionMs)
                  return dur ? `<span class="portfolio-duration" title="Duración del análisis">⏱ ${escapeHtml(dur)}</span>` : ''
                })()}
              </div>
```

- [ ] **Step 3: CSS de la pill**

En el bloque `<style>`, después de `.portfolio-row-meta svg { ... }` (línea 272), agregá:

```css
  .portfolio-duration {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border-subtle);
    border-radius: 999px;
  }
```

- [ ] **Step 4: Verificación visual**

Arrancá `npm run dev:web`, ir a `/portfolio`. Entradas con `duracionMs > 0` muestran la pill (ej. `⏱ 42.3s` o `⏱ 2m 15s`) al lado de la fecha. Entradas viejas sin `duracionMs` no la muestran (no aparece una pill vacía).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/PortfolioTable.astro
git commit -m "feat(web/portfolio): pill con duración del análisis"
```

---

## Task 10: Verificación end-to-end y cleanup

**Files:** ninguno (solo verificación manual)

- [ ] **Step 1: Arrancar stack completo**

Terminal 1: `npm run dev:server` (espera a ver `Agent initialized`).
Terminal 2: `npm run dev:web` (espera a ver el URL de Astro).

- [ ] **Step 2: Ejecutar un análisis real**

En el navegador, URL de Astro. Pegá un repo público chico (ej. `https://github.com/honojs/hono` o `https://github.com/withastro/astro`). Elegí tu provider (Ollama si tenés corriendo local, Bedrock si tenés key/creds) y apretá Analizar.

Checklist mental mientras corre:
1. Timer arranca en `00:00.0` y avanza con décimas fluidas.
2. En cada stage, aparece una frase italic del pool correcto.
3. Si un stage dura >3s, la frase rota (cross-fade visible).
4. Al pasar al siguiente stage, el anterior pierde su frase y el nuevo muestra una del suyo.
5. Al llegar el reporte, el timer se congela brevemente en verde con el valor del servidor y luego el panel se oculta.

- [ ] **Step 3: Verificar persistencia**

Abrí `portfolio.json`. La última entry debe tener **todos** estos campos:

- `repo`: `"owner/repo"`
- `repoUrl`: `"https://github.com/owner/repo"`
- `fecha`: ISO timestamp
- `score`: número 0-10
- `duracionMs`: número > 0 (aproximadamente lo que mostró el timer)
- `descripcion`: string no vacío
- `sintesisTecnica`: string no vacío
- `veredictoDetalle`: string no vacío

- [ ] **Step 4: Verificar portfolio UI**

Ir a `/portfolio`. La última entry muestra:
- Nombre del repo como link (hover → azul subrayado, click → GitHub en nueva pestaña).
- Pill `⏱ <duración>` al lado de la fecha.
- Resto de campos sin regresiones.

- [ ] **Step 5: Verificar retrocompatibilidad**

Si hay entradas viejas en `portfolio.json` que aún no tienen los campos nuevos:
- Se renderizan sin romper el layout.
- El link del repo cae en el fallback `https://github.com/${repo}`.
- La pill de duración no aparece (no se muestra una pill vacía o con `NaN`).

Si no hay entradas viejas, podés simular una editando `portfolio.json` a mano y quitando los campos nuevos de una entry, refrescar `/portfolio`, verificar que no rompe, y luego restaurar el archivo con `git checkout portfolio.json` (o dejar la edición revertida manualmente si el archivo está gitignored).

- [ ] **Step 6: Verificar cleanup de intervals**

Con el análisis terminado, abrir DevTools → Sources → Snippet o Console, correr:

```js
// Hackish pero efectivo: intentar crear varios intervals y ver el orden de IDs
const probe = setInterval(() => {}, 10000)
console.log('Probe ID:', probe)
clearInterval(probe)
```

El ID del probe debe ser bajo (ej. 1-10), no un número muy alto que sugeriría que quedaron intervals huérfanos acumulándose.

Otra prueba más concreta: iniciar un análisis, cancelarlo apretando refresh en medio, iniciar otro. El timer del segundo arranca limpio en `00:00.0` y la frase mostrada pertenece al pool del stage actual, no a un pool de una ejecución anterior.

- [ ] **Step 7: Build del proyecto**

Corré: `npm run build`
Esperá: compila sin errores. Esto confirma que los tipos están consistentes.

- [ ] **Step 8: Commit final (si hiciste ajustes menores)**

Si al verificar encontraste algún detalle que hubo que tocar (typo, micro-ajuste de CSS), commitealo ahora:

```bash
git add -A
git commit -m "chore: ajustes finales timer/frases/portfolio tras verificación e2e"
```

Si no hubo ajustes, saltá este step.

---

## Notes for implementers

- **Orden de tasks**: Task 1-3 son backend puro y pueden hacerse seguidos sin tocar frontend. Task 4-7 son frontend progresivo (scaffold → timer → frases). Task 8-9 son portfolio UI. Task 10 valida todo. No saltees orden — tareas tardías dependen de cambios tempranos.
- **Hot reload**: `tsx watch` en el server recarga automáticamente; Astro dev server también. Si la UI no refleja cambios, hard refresh (Cmd+Shift+R) porque algunos assets quedan cacheados.
- **Si Ollama falla**: el análisis puede fracasar en el paso de extracción del JSON. Eso no invalida los tests de este plan — el timer y las frases igual corren durante el intento. Para verificar persistencia, probá con Bedrock (más confiable) o un repo bien conocido con Ollama.
- **Estilo de commits**: se usa conventional commits en el repo (`feat(x):`, `fix(x):`, `docs(x):`). Seguí ese patrón.
