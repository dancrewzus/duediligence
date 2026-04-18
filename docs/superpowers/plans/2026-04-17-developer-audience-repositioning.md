# Reposicionamiento a audiencia dev — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repositionar el agente de due diligence técnico de audiencia inversor a audiencia developer: 7 dimensiones (reemplaza Escalabilidad por Documentación & DX, reframea Salud de equipo a Mantenimiento & Actividad, agrega Testing & CI/CD), veredicto categórico con badge coloreado, prompts y UI reescritos para devs.

**Architecture:** Cambios en 5 archivos core (`src/types/index.ts`, `src/agent.ts`, `src/server.ts`, `src/session/portfolio.ts`, `src/index.ts`) + UI (`web/src/components/AnalysisForm.astro`, `web/src/components/PortfolioTable.astro`, `web/src/styles/global.css`). Se borran 5 componentes Astro dead-code (`ReportCard`, `ScoreBar`, `TechStackCard`, `MetricsCard`, `RiskStrengthCard`) — no están importados en ninguna página y quedarían con type errors tras los renombres. Sin backwards-compat shims: el schema cambia de forma breaking.

**Tech Stack:** TypeScript ESM, Strands Agents SDK, Hono, Astro 5, Ollama local. Verificación: `npm run build` (tsc --noEmit-equivalent via tsc) y smoke test manual en browser. El proyecto no tiene suite de tests — las verificaciones son tipado estricto + prueba manual end-to-end.

**Spec:** [`docs/superpowers/specs/2026-04-17-developer-audience-repositioning-design.md`](../specs/2026-04-17-developer-audience-repositioning-design.md)

---

## Task 1: Borrar componentes Astro dead-code

Los componentes `ReportCard.astro`, `ScoreBar.astro`, `TechStackCard.astro`, `MetricsCard.astro`, `RiskStrengthCard.astro` no están importados en ninguna página (`AnalysisForm.astro` los reemplazó con render client-side inline). Referencian los campos viejos del schema (`escalabilidad`, `saludEquipo`, `recomendacion`), por lo que romperían `tsc` después de los renombres en Task 2. Borrar antes de empezar.

**Files:**
- Delete: `web/src/components/ReportCard.astro`
- Delete: `web/src/components/ScoreBar.astro`
- Delete: `web/src/components/TechStackCard.astro`
- Delete: `web/src/components/MetricsCard.astro`
- Delete: `web/src/components/RiskStrengthCard.astro`

- [ ] **Step 1: Verificar que no están importados**

```bash
grep -rn "from.*components/\(ReportCard\|ScoreBar\|TechStackCard\|MetricsCard\|RiskStrengthCard\)" web/src/ --include="*.astro"
```

Expected: sin output (confirma que no se usan).

- [ ] **Step 2: Borrar los 5 archivos**

```bash
rm web/src/components/ReportCard.astro
rm web/src/components/ScoreBar.astro
rm web/src/components/TechStackCard.astro
rm web/src/components/MetricsCard.astro
rm web/src/components/RiskStrengthCard.astro
```

- [ ] **Step 3: Verificar que el build sigue compilando**

```bash
cd web && npm run build
```

Expected: build exitoso. Si falla, alguno estaba referenciado y hay que restaurarlo + investigar.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(web): borrar componentes Astro SSR dead-code reemplazados por render client-side"
```

---

## Task 2: Actualizar tipos (`src/types/index.ts`)

Renombrar campos del schema al nuevo modelo dev-focused. El tipo `AnalysisReport` cambia de forma breaking: `recomendacion`/`resumen` → `veredicto`/`veredictoDetalle`/`sintesisTecnica`, `riesgos` → `banderas`, `scores.escalabilidad` → `scores.documentacionDx`, `scores.saludEquipo` → `scores.mantenimientoActividad`, nuevo `scores.testingCicd`. `PortfolioEntry.resumen` → `PortfolioEntry.sintesisTecnica`.

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Reemplazar `AnalysisScores`, `AnalysisReport`, `PortfolioEntry`**

Reemplazar el bloque desde la interface `AnalysisScores` hasta el final del archivo con:

```typescript
export interface AnalysisScores {
  stackArquitectura: ScoreDimension
  calidadCodigo: ScoreDimension
  documentacionDx: ScoreDimension
  mantenimientoActividad: ScoreDimension
  seguridad: ScoreDimension
  madurezDependencias: ScoreDimension
  testingCicd: ScoreDimension
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

export type Veredicto = 'Adoptar' | 'Usar con cautela' | 'Solo referencia' | 'Evitar'

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
}

export interface PortfolioEntry {
  repo: string
  fecha: string
  score: number
  sintesisTecnica: string
}
```

Dejar intactos: `RepoMetadata`, `RepoStructure`, `ScoreDimension` (líneas 1-34).

- [ ] **Step 2: Verificar tipado**

```bash
npx tsc --noEmit
```

Expected: FAIL con errores en `src/agent.ts`, `src/session/portfolio.ts`, `src/server/stream-events.ts` (los consumidores todavía referencian los campos viejos). Esto es esperado — se resuelve en tasks siguientes.

- [ ] **Step 3: Commit (aunque falle tsc — cierra el cambio de tipos como unidad atómica)**

```bash
git add src/types/index.ts
git commit -m "refactor(types): renombrar schema para audiencia dev (7 dimensiones + veredicto categórico)"
```

---

## Task 3: Actualizar `src/session/portfolio.ts`

Renombrar `resumen` → `sintesisTecnica` en la tool `saveAnalysis`, en `persistReport`, y ajustar la descripción del tool para reflejar la audiencia dev. El campo del tool arg pasa a llamarse `sintesisTecnica`.

**Files:**
- Modify: `src/session/portfolio.ts`

- [ ] **Step 1: Editar `saveAnalysis` y `persistReport`**

Reemplazar líneas 22-53 (desde `export const saveAnalysis` hasta el cierre de `persistReport`) con:

```typescript
export const saveAnalysis = tool({
  name: 'save_analysis',
  description: 'Save a completed analysis to the portfolio. Call this after generating a due diligence report.',
  inputSchema: z.object({
    repo: z.string().describe('Full repo name owner/repo'),
    score: z.number().describe('Overall technical score 0-10'),
    sintesisTecnica: z.string().describe('Brief technical synthesis of the analysis in Spanish'),
  }),
  callback: (input) => {
    const portfolio = loadPortfolio()
    const entry: PortfolioEntry = {
      repo: input.repo,
      fecha: new Date().toISOString(),
      score: input.score,
      sintesisTecnica: input.sintesisTecnica,
    }
    portfolio.push(entry)
    savePortfolio(portfolio)
    return `Analysis saved for ${input.repo} with score ${input.score}/10.`
  },
})

export function persistReport(report: AnalysisReport): void {
  const portfolio = loadPortfolio()
  portfolio.push({
    repo: report.repo,
    fecha: new Date().toISOString(),
    score: report.scoreTotal,
    sintesisTecnica: report.sintesisTecnica,
  })
  writeFileSync(PORTFOLIO_PATH, JSON.stringify(portfolio, null, 2), 'utf-8')
}
```

- [ ] **Step 2: Verificar tipado en este archivo**

```bash
npx tsc --noEmit
```

Expected: los errores previos de `portfolio.ts` desaparecen. Siguen pendientes los de `agent.ts` (example JSON literal con campos viejos).

- [ ] **Step 3: Commit**

```bash
git add src/session/portfolio.ts
git commit -m "refactor(portfolio): renombrar resumen a sintesisTecnica"
```

---

## Task 4: Reescribir `SYSTEM_PROMPT` en `src/agent.ts`

Reemplazar el system prompt del agente de análisis: nuevo rol (staff engineer), pregunta guía ("¿me sirve este repo?"), documentación de los 7 campos del schema (incluyendo los renombres y `veredicto` enum), ejemplo literal del JSON de respuesta actualizado, checklist pre-emisión con las nuevas validaciones.

**Files:**
- Modify: `src/agent.ts` (líneas 15-107 — constante `SYSTEM_PROMPT`)

- [ ] **Step 1: Reemplazar `SYSTEM_PROMPT` completo**

Reemplazar desde `const SYSTEM_PROMPT = \`...` hasta el backtick de cierre (línea 107) con:

```typescript
const SYSTEM_PROMPT = `Eres un staff engineer con 15 años de experiencia evaluando repositorios open source.
Tu trabajo es ayudar a otro dev que acaba de encontrar un repo en GitHub a decidir si le sirve: qué hace, si está bien construido, si es seguro adoptarlo, si va a estar mantenido cuando lo necesite, y si podrá entenderlo aunque el README sea pobre.

PREGUNTA GUÍA: "¿Me sirve este repo?". Cada justificación de score debe responderla de forma concreta.

FLUJO DE TRABAJO (no te saltes pasos):
1. Llama a analyze_repo_structure con { owner, repo } del repositorio solicitado.
2. Llama a las tools del MCP de GitHub (list_commits, list_pull_requests, list_contributors, list_issues) para medir actividad y mantenimiento.
3. Con los datos obtenidos, redacta el reporte final.

FORMATO DE RESPUESTA FINAL (regla absoluta):
Tu última respuesta —después de todas las tool calls— DEBE ser ÚNICAMENTE un bloque de código con la etiqueta \`\`\`json ... \`\`\`, sin texto antes y sin texto después. Nada de prosa, nada de explicaciones, nada de resúmenes fuera del JSON. Solo el bloque JSON.

SCHEMA EXACTO del JSON (todos los campos son obligatorios, nombres exactos, tipos exactos):
- descripcion: string OBLIGATORIO, NUNCA null, NUNCA omitir. 1-3 oraciones (máximo 500 caracteres) explicando QUÉ ES el proyecto desde el punto de vista funcional — qué hace, para quién, en qué categoría encaja. Esta descripción es lo PRIMERO que lee el dev; debe poder entender el proyecto sin mirar nada más. Fuentes, en orden de preferencia: (1) metadata.description de analyze_repo_structure si existe y es informativa, (2) README.md, (3) package.json description, (4) infiere desde dependencias y estructura. No copies slogans de marketing vacíos; sé concreto.
- scores: objeto con 7 claves (stackArquitectura, calidadCodigo, documentacionDx, mantenimientoActividad, seguridad, madurezDependencias, testingCicd). Cada una es { score: number entre 0 y 10, justificacion: string corto }.
- tecnologias: objeto con 6 claves (frontend, backend, database, infraestructura, testing, cicd). Cada una es un string[] con los nombres + versiones detectados.
- metricas: objeto con 10 claves numéricas y de texto exactamente como en el ejemplo.
- deudaTecnica: uno de exactamente tres valores literales: "Alta", "Media", o "Baja".
- deudaJustificacion: string.
- scoreTotal: number con un decimal (promedio de los 7 scores).
- banderas: string[] con exactamente 3 elementos. Señales técnicas de alerta para el dev que considera adoptar el repo (no jerga de inversor — cosas como "sin tests" o "último commit hace 14 meses").
- fortalezas: string[] con exactamente 3 elementos. Puntos fuertes técnicos concretos.
- veredicto: EXACTAMENTE uno de estos cuatro literales — "Adoptar", "Usar con cautela", "Solo referencia", "Evitar". Sin variantes, sin acentos distintos, sin mayúsculas cambiadas.
- veredictoDetalle: string de 2-3 oraciones explicando el porqué del veredicto y cuándo tiene sentido usar (o no usar) el repo.
- sintesisTecnica: string de 2-3 oraciones con la síntesis técnica para el dev (qué hace, señales clave, si vale la pena mirarlo). No repitas los scores dimensión por dimensión.

EVIDENCIA REQUERIDA POR DIMENSIÓN (citá datos concretos en cada justificacion):
- stackArquitectura: framework + versión, estructura de carpetas, decisiones de arquitectura visibles (monorepo, DI, etc.).
- calidadCodigo: ESLint/Prettier/tsconfig strict presentes, tipado, tamaño del codebase, nombres de archivos.
- documentacionDx: README presente, longitud útil (no vacío), quickstart, ejemplos de código, API docs, CONTRIBUTING.md, changelog, badges.
- mantenimientoActividad: antigüedad del último commit, frecuencia de releases, issuesAbiertos vs commits recientes como proxy de respuesta, contributors activos en 30d.
- seguridad: Dependabot/Renovate configurado, SAST, secrets en repo, dependencias con CVEs conocidos.
- madurezDependencias: cantidad de deps runtime, antigüedad promedio de versiones, libs deprecadas.
- testingCicd: frameworks detectados (vitest/jest/mocha/pytest/etc.), scripts de test en package.json, presencia de workflows en .github/workflows, badge de coverage.

DEFAULTS CUANDO NO HAY DATO (nunca inventes):
- Número no disponible → -1.
- String no disponible → "N/D".
- Array vacío → [].
- tieneTests: true si detectaste framework/scripts de test; false si no.

REGLAS DE EVIDENCIA:
- Cada justificacion debe citar datos concretos: nombre y versión de dependencia, número de commits, antigüedad del último commit, archivos de config presentes/ausentes, número de contributors.
- ultimoCommitHace y edadProyecto en español natural: "3 días", "2 meses", "1 año 4 meses".

EJEMPLO DE RESPUESTA FINAL VÁLIDA (formato literal — responde siempre así):

\`\`\`json
{
  "descripcion": "Framework web all-in-one para construir sitios content-driven (blogs, docs, marketing). Renderiza HTML estático por defecto con hydration selectiva por componente (islands), soportando React, Vue, Svelte y otros frameworks de UI dentro del mismo proyecto. Dirigido a equipos que priorizan performance y SEO sobre apps altamente interactivas.",
  "scores": {
    "stackArquitectura": { "score": 7, "justificacion": "Stack moderno (React 18, Node 20, TypeScript 5) con separación frontend/backend. Uso de Hono en lugar de Express es decisión actual pero añade riesgo de madurez." },
    "calidadCodigo": { "score": 6, "justificacion": "ESLint y Prettier configurados, tsconfig estricto. Codebase pequeña y nombres claros." },
    "documentacionDx": { "score": 4, "justificacion": "README existe pero sin sección de quickstart ni ejemplos. No hay CONTRIBUTING.md ni changelog. API docs ausentes." },
    "mantenimientoActividad": { "score": 4, "justificacion": "Último commit hace 3 semanas, 9 commits el último mes. Solo 1 contributor activo en 30d. 5 issues abiertos sin etiquetas ni respuestas recientes." },
    "seguridad": { "score": 5, "justificacion": "No hay Dependabot ni SAST configurado. Dependencias con 6 meses de antigüedad promedio. Sin secrets detectados en repo." },
    "madurezDependencias": { "score": 6, "justificacion": "21 dependencias runtime, versiones recientes (React 18.3, Hono 4.x). No se detectan libs deprecadas." },
    "testingCicd": { "score": 2, "justificacion": "Sin framework de tests en devDependencies. Sin workflows en .github/workflows. Script npm test no definido." }
  },
  "tecnologias": {
    "frontend": ["Astro 5", "CSS vanilla"],
    "backend": ["Node.js 20", "Hono 4", "TypeScript 5"],
    "database": [],
    "infraestructura": [],
    "testing": [],
    "cicd": []
  },
  "metricas": {
    "stars": 42,
    "forks": 7,
    "contributorsActivos30d": 1,
    "commitsUltimoMes": 9,
    "ultimoCommitHace": "3 semanas",
    "prsAbiertos": 2,
    "prsMergeadosUltimoMes": 2,
    "issuesAbiertos": 5,
    "tieneTests": false,
    "edadProyecto": "8 meses"
  },
  "deudaTecnica": "Media",
  "deudaJustificacion": "Ausencia total de tests y de CI/CD. Código limpio pero sin red de seguridad para cambios.",
  "scoreTotal": 4.9,
  "banderas": [
    "Sin tests automáticos ni CI: cualquier cambio queda sin validar, incluyendo fixes que abras vos.",
    "Documentación mínima: sin quickstart ni ejemplos, el onboarding toma horas en vez de minutos.",
    "1 solo contributor activo y último commit hace 3 semanas: alto riesgo de que issues y PRs queden sin respuesta."
  ],
  "fortalezas": [
    "Stack moderno con TypeScript estricto y linting configurado.",
    "Arquitectura clara con separación frontend/backend.",
    "Dependencias actualizadas (<6 meses promedio)."
  ],
  "veredicto": "Usar con cautela",
  "veredictoDetalle": "El stack es sólido y el código limpio, pero la falta de tests + docs + baja actividad hacen que adoptarlo como dependencia crítica sea riesgoso. Sirve si lo vas a forkear o usar como referencia; no lo uses en producción sin planear mantenerlo vos mismo.",
  "sintesisTecnica": "Framework web para sitios content-driven con stack moderno y código limpio, pero con documentación pobre, sin tests automáticos y mantenido por 1 sola persona. Útil para proyectos exploratorios o forks; arriesgado como dependencia directa en algo que necesite soporte."
}
\`\`\`

RECORDATORIO FINAL: tu última respuesta al usuario debe ser SOLO un bloque \`\`\`json { ... } \`\`\` siguiendo el schema de arriba. Sin prosa antes ni después. Si no seguís este formato exacto, el sistema no puede procesar la respuesta.

CHECKLIST antes de emitir el JSON final:
- ¿"descripcion" está presente, es un string no vacío, y explica qué ES el proyecto en ≤500 caracteres? (obligatorio)
- ¿Los 7 scores están todos entre 0 y 10?
- ¿"deudaTecnica" es exactamente "Alta", "Media" o "Baja"?
- ¿"veredicto" es exactamente uno de "Adoptar", "Usar con cautela", "Solo referencia", "Evitar"?
- ¿"banderas" y "fortalezas" tienen exactamente 3 elementos cada uno?
- ¿"veredictoDetalle" y "sintesisTecnica" tienen 2-3 oraciones y están orientados al dev (no al inversor)?
Si alguna respuesta es no, corregí antes de emitir.`
```

**Nota sobre escaping:** el JSON ejemplo contiene `\`\`\`json`. En el string literal de TypeScript (template string con backticks), los triple-backtick deben escaparse como `\`\`\`` dentro del template para que el LLM reciba literalmente `` ```json `` en el prompt. Revisá que el reemplazo conserve el escape idéntico al prompt actual (que ya lo hace).

- [ ] **Step 2: Verificar tipado**

```bash
npx tsc --noEmit
```

Expected: pasa sin errores relacionados con `agent.ts`. Siguen pendientes los que toquen tipos (si los hay) pero el prompt en sí es string literal — no depende de tipos.

- [ ] **Step 3: Commit**

```bash
git add src/agent.ts
git commit -m "feat(agent): reescribir system prompt para audiencia dev (7 dimensiones, veredicto categórico)"
```

---

## Task 5: Reescribir `CHAT_SYSTEM_PROMPT` en `src/agent.ts`

El prompt de chat describe al rol como "CTO senior evaluando startups" y al usuario como "inversor". Cambiar a staff engineer evaluando repos y usuario como dev.

**Files:**
- Modify: `src/agent.ts` (líneas 109-120 — constante `CHAT_SYSTEM_PROMPT`)

- [ ] **Step 1: Reemplazar `CHAT_SYSTEM_PROMPT`**

Reemplazar desde `const CHAT_SYSTEM_PROMPT = \`...` hasta el backtick de cierre (~ línea 120) con:

```typescript
const CHAT_SYSTEM_PROMPT = `Eres un staff engineer con 15 años de experiencia que ya revisó este repo y emitió el reporte.

CONTEXTO: En turnos anteriores de esta conversación aparece un bloque \`\`\`json con el reporte técnico completo. Ese reporte YA FUE ENTREGADO — no lo repitas, no lo reescribas, no emitas otro JSON. El dev ya lo tiene.

AHORA ESTÁS EN MODO CONVERSACIÓN. Reglas absolutas:
- PROHIBIDO emitir bloques \`\`\`json, \`\`\`, o cualquier formato estructurado tipo schema. Si tu respuesta empieza con \`{\` o \`\`\`\`, está mal.
- Respondé SIEMPRE en prosa natural en español, en 2 a 5 oraciones. Podés usar listas markdown con guiones si aclaran.
- El reporte ya está en tu memoria — usalo como fuente, pero respondé a la pregunta específica del dev, no resumas todo el reporte.
- No llames tools salvo que la pregunta exija datos nuevos que no tengas.
- Tono directo, técnico, objetivo. No suavices problemas. Hablás de adopción/integración/forks, no de inversión.

Si tu primer impulso es escribir \`\`\`json, detenete: estás en modo conversación.`
```

- [ ] **Step 2: Verificar tipado y commit**

```bash
npx tsc --noEmit
git add src/agent.ts
git commit -m "feat(agent): reescribir chat prompt para audiencia dev"
```

Expected: `tsc --noEmit` pasa sin errores.

---

## Task 6: Actualizar wrapper del chat en `src/server.ts`

Cambiar el texto de envoltura del mensaje en el endpoint de chat para que diga "Pregunta del dev" en vez de "Pregunta del inversor".

**Files:**
- Modify: `src/server.ts:219` (variable `wrappedMessage`)

- [ ] **Step 1: Editar `wrappedMessage`**

Reemplazar:

```typescript
      const wrappedMessage =
        '[MODO CONVERSACIÓN — respondé en prosa natural en español, NO emitas JSON, NO repitas el reporte]\n\n' +
        `Pregunta del inversor: ${message}`
```

con:

```typescript
      const wrappedMessage =
        '[MODO CONVERSACIÓN — respondé en prosa natural en español, NO emitas JSON, NO repitas el reporte]\n\n' +
        `Pregunta del dev: ${message}`
```

- [ ] **Step 2: Verificar tipado y commit**

```bash
npx tsc --noEmit
git add src/server.ts
git commit -m "feat(server): cambiar wrapper del chat a 'Pregunta del dev'"
```

Expected: `tsc --noEmit` pasa sin errores.

---

## Task 7: Actualizar banner de CLI en `src/index.ts`

El banner del CLI dice "Agente de Inversión". Cambiar a algo consistente con audiencia dev.

**Files:**
- Modify: `src/index.ts:6-9`

- [ ] **Step 1: Editar las líneas del banner**

Reemplazar:

```typescript
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║   Due Diligence Técnico — Agente de Inversión   ║')
  console.log('║   Powered by Strands Agents + Ollama (local)    ║')
  console.log('╚══════════════════════════════════════════════════╝')
```

con:

```typescript
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║   Due Diligence Técnico — ¿Te sirve este repo? ║')
  console.log('║   Powered by Strands Agents + Ollama (local)    ║')
  console.log('╚══════════════════════════════════════════════════╝')
```

**Nota:** mantener el ancho constante — las líneas del banner deben tener los mismos caracteres entre los `║`. Contá caracteres si el reemplazo te cuadra.

- [ ] **Step 2: Verificar build completo del backend**

```bash
npx tsc --noEmit
```

Expected: PASS (ya no deberían quedar errores de tipos en `src/`).

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "chore(cli): actualizar banner del CLI a audiencia dev"
```

---

## Task 8: Agregar `.badge-blue` a `global.css`

El veredicto "Solo referencia" se renderiza en azul. `global.css` ya tiene `.badge-green`, `.badge-yellow`, `.badge-red` — falta `.badge-blue`.

**Files:**
- Modify: `web/src/styles/global.css` (alrededor de líneas 390-407, donde están los demás `.badge-*`)

- [ ] **Step 1: Agregar la regla tras `.badge-red`**

Después del bloque `.badge-red { ... }` (línea ~407), agregar:

```css
.badge-blue {
  background: rgba(110, 168, 255, 0.12);
  color: var(--accent-blue);
  border-color: rgba(110, 168, 255, 0.3);
}
```

- [ ] **Step 2: Verificar build del web**

```bash
cd web && npm run build
```

Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add web/src/styles/global.css
git commit -m "feat(web): agregar variante .badge-blue para veredicto 'Solo referencia'"
```

---

## Task 9: Actualizar `PortfolioTable.astro`

El componente referencia `item.resumen`. Cambiar a `item.sintesisTecnica` para alinearse con el schema nuevo.

**Files:**
- Modify: `web/src/components/PortfolioTable.astro:336`, `web/src/components/PortfolioTable.astro:370`

- [ ] **Step 1: Actualizar interface `PortfolioItem`**

Reemplazar (línea ~332-337):

```typescript
  interface PortfolioItem {
    repo: string
    fecha: string
    score: number
    resumen: string
  }
```

con:

```typescript
  interface PortfolioItem {
    repo: string
    fecha: string
    score: number
    sintesisTecnica: string
  }
```

- [ ] **Step 2: Actualizar render**

Reemplazar la línea 370:

```javascript
            <div class="portfolio-row-summary">${escapeHtml(item.resumen)}</div>
```

con:

```javascript
            <div class="portfolio-row-summary">${escapeHtml(item.sintesisTecnica)}</div>
```

- [ ] **Step 3: Verificar build del web**

```bash
cd web && npm run build
```

Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/PortfolioTable.astro
git commit -m "refactor(web): PortfolioTable usa sintesisTecnica en lugar de resumen"
```

---

## Task 10: Hero + chat text en `AnalysisForm.astro`

Cambios de texto: hero (título, subtítulo) + chat (subtítulo y placeholder). Sin cambios estructurales todavía — eso viene en Task 11 y Task 12.

**Files:**
- Modify: `web/src/components/AnalysisForm.astro:11-15`, `web/src/components/AnalysisForm.astro:929-940`

- [ ] **Step 1: Actualizar hero**

Reemplazar (líneas ~11-15):

```html
    <h1 class="hero-title">Due Diligence <span>Técnico</span></h1>
    <p class="hero-subtitle">
      Evalúa la salud técnica de cualquier startup en GitHub —
      arquitectura, calidad, equipo y riesgos en segundos.
    </p>
```

con:

```html
    <h1 class="hero-title">¿Te sirve este <span>repo</span>?</h1>
    <p class="hero-subtitle">
      Antes de forkear, integrar o pedir permisos, tené la decisión técnica en segundos —
      qué hace, si está mantenido, y si vale la pena adoptarlo.
    </p>
```

- [ ] **Step 2: Actualizar subtítulo y placeholder del chat**

En la función `renderChatPanel(repo)` (alrededor de línea 925), reemplazar:

```javascript
          <h3 class="section-title" style="margin-bottom: 0;">Seguí la conversación</h3>
          <span class="chat-subtitle">El agente recuerda este análisis. Hacé preguntas o pedí profundizar.</span>
```

con:

```javascript
          <h3 class="section-title" style="margin-bottom: 0;">Seguí la conversación</h3>
          <span class="chat-subtitle">El agente recuerda este repo. Preguntá lo que necesites para decidir si usarlo.</span>
```

Y reemplazar (mismo bloque, input placeholder):

```javascript
            placeholder="Ej: profundiza en seguridad, ¿qué pasa con el bus factor?"
```

con:

```javascript
            placeholder="Ej: ¿es seguro usarlo en producción?, ¿cómo es el onboarding?, ¿tiene alternativas mejores?"
```

- [ ] **Step 3: Verificar build del web y commit**

```bash
cd web && npm run build
git add web/src/components/AnalysisForm.astro
git commit -m "feat(web): actualizar textos de hero y chat para audiencia dev"
```

Expected: build exitoso.

---

## Task 11: Labels de scores + Banderas en `AnalysisForm.astro`

Actualizar los labels de las 6 dimensiones viejas, agregar la 7ª (Testing & CI/CD), y cambiar el título "Top 3 Riesgos" → "Banderas" + el campo de `r.riesgos` a `r.banderas`.

**Files:**
- Modify: `web/src/components/AnalysisForm.astro:967-976` (bloque `.scores-grid`), `web/src/components/AnalysisForm.astro:986-989` (card de riesgos)

- [ ] **Step 1: Actualizar grid de scores**

Reemplazar (dentro de `renderReport(r)`, alrededor de línea 967-976):

```javascript
          <div class="scores-grid">
            ${renderScoreBar('Stack & Arquitectura', r.scores.stackArquitectura)}
            ${renderScoreBar('Calidad de código', r.scores.calidadCodigo)}
            ${renderScoreBar('Escalabilidad', r.scores.escalabilidad)}
            ${renderScoreBar('Salud del equipo', r.scores.saludEquipo)}
            ${renderScoreBar('Seguridad', r.scores.seguridad)}
            ${renderScoreBar('Madurez de dependencias', r.scores.madurezDependencias)}
          </div>
```

con:

```javascript
          <div class="scores-grid">
            ${renderScoreBar('Stack & Arquitectura', r.scores.stackArquitectura)}
            ${renderScoreBar('Calidad de código', r.scores.calidadCodigo)}
            ${renderScoreBar('Documentación & DX', r.scores.documentacionDx)}
            ${renderScoreBar('Mantenimiento & Actividad', r.scores.mantenimientoActividad)}
            ${renderScoreBar('Seguridad', r.scores.seguridad)}
            ${renderScoreBar('Madurez de dependencias', r.scores.madurezDependencias)}
            ${renderScoreBar('Testing & CI/CD', r.scores.testingCicd)}
          </div>
```

- [ ] **Step 2: Actualizar card de riesgos**

Reemplazar (alrededor de línea 986-989):

```html
          <div class="card rsc rsc-risk">
            <h3 class="rsc-title">Top 3 Riesgos</h3>
            <ol class="rsc-list">${r.riesgos.map((i: string) => `<li class="rsc-item">${escapeHtml(i)}</li>`).join('')}</ol>
          </div>
```

con:

```html
          <div class="card rsc rsc-risk">
            <h3 class="rsc-title">Banderas</h3>
            <ol class="rsc-list">${r.banderas.map((i: string) => `<li class="rsc-item">${escapeHtml(i)}</li>`).join('')}</ol>
          </div>
```

- [ ] **Step 3: Verificar build del web y commit**

```bash
cd web && npm run build
git add web/src/components/AnalysisForm.astro
git commit -m "feat(web): 7 dimensiones con Docs & DX, Mantenimiento y Testing + renombrar Riesgos a Banderas"
```

Expected: build exitoso.

---

## Task 12: Card de Veredicto en `AnalysisForm.astro`

Reemplazar la card "Recomendación al inversor" por una nueva card "Veredicto" con badge grande coloreado + prosa. Agregar función helper `getVeredictoBadgeClass(veredicto)` y estilos `.veredicto-badge`, `.veredicto-card` inline.

**Files:**
- Modify: `web/src/components/AnalysisForm.astro` (helper functions alrededor de línea 800, bloque de render alrededor de línea 995-998, CSS global alrededor de línea 600)

- [ ] **Step 1: Agregar helper `getVeredictoBadgeClass`**

Después de la función `getBadgeClass` (alrededor de línea 801-805), agregar:

```typescript
  function getVeredictoBadgeClass(veredicto: string): string {
    if (veredicto === 'Adoptar') return 'badge-green'
    if (veredicto === 'Usar con cautela') return 'badge-yellow'
    if (veredicto === 'Solo referencia') return 'badge-blue'
    return 'badge-red'
  }
```

- [ ] **Step 2: Reemplazar la card de recomendación por veredicto**

En `renderReport(r)`, reemplazar (alrededor de línea 995-998):

```html
        <div class="report-recommendation card">
          <h3 class="section-title">Recomendación al inversor</h3>
          <p class="recommendation-text">${escapeHtml(r.recomendacion)}</p>
        </div>
```

con:

```html
        <div class="veredicto-card card">
          <h3 class="section-title">Veredicto</h3>
          <div class="veredicto-badge-wrap">
            <span class="badge veredicto-badge ${getVeredictoBadgeClass(r.veredicto)}">${escapeHtml(r.veredicto)}</span>
          </div>
          <p class="recommendation-text">${escapeHtml(r.veredictoDetalle)}</p>
        </div>
```

- [ ] **Step 3: Agregar estilos para la card de veredicto**

Dentro del bloque `<style is:global>` (alrededor de línea 600, al lado de `.recommendation-text`), agregar:

```css
  .veredicto-card { display: flex; flex-direction: column; gap: 16px; }
  .veredicto-badge-wrap { display: flex; }
  .veredicto-badge {
    font-size: 1rem;
    padding: 8px 20px;
    letter-spacing: 0.04em;
  }
```

**Nota:** `.veredicto-badge` hereda colores de `.badge-green|yellow|blue|red` (las tres primeras ya existen, `.badge-blue` se agregó en Task 8). El padding mayor + font-size mayor lo hacen visualmente prominente.

- [ ] **Step 4: Verificar build del web y commit**

```bash
cd web && npm run build
git add web/src/components/AnalysisForm.astro
git commit -m "feat(web): reemplazar 'Recomendación al inversor' por card de Veredicto con badge categórico"
```

Expected: build exitoso.

---

## Task 13: Verificación end-to-end manual

No hay suite de tests automatizada. Validación final: tipado limpio + smoke test manual en browser con un repo real, + chat funcionando, + portafolio no roto.

**Files:** (ninguno — solo verificación)

- [ ] **Step 1: Limpiar estado persistido del schema viejo**

El archivo `portfolio.json` y el directorio `sesiones/` contienen datos del schema viejo (`resumen`, `recomendacion`, etc.). Sacarlos del medio — no hay migración.

```bash
rm -f portfolio.json
rm -rf sesiones/
```

(Se regeneran vacíos al correr el agente.)

- [ ] **Step 2: Type-check completo**

```bash
npx tsc --noEmit
cd web && npm run build && cd ..
```

Expected: ambos comandos pasan sin errores.

- [ ] **Step 3: Arrancar backend y frontend**

En una terminal:
```bash
npm run dev:server
```

En otra terminal:
```bash
npm run dev:web
```

Abrir `http://localhost:4321` (o el puerto que imprima Astro) en el browser.

- [ ] **Step 4: Smoke test del análisis**

En el input, pegar una URL de GitHub real (elegí un repo chico para que termine rápido, ej.: `https://github.com/honojs/hono`). Darle "Analizar".

Verificar en el reporte final:
- [ ] Título del hero dice "¿Te sirve este **repo**?"
- [ ] Grid de scores tiene **7 tiles**: Stack & Arq, Calidad, Docs & DX, Mantenimiento & Actividad, Seguridad, Madurez deps, Testing & CI/CD.
- [ ] Card "Banderas" (no "Top 3 Riesgos") renderiza 3 elementos.
- [ ] Card "Veredicto" muestra badge grande coloreado (verde/amarillo/azul/rojo) + prosa debajo.
- [ ] Description y score total renderizan normal.

- [ ] **Step 5: Smoke test del chat**

En la sección de chat del reporte, escribir: "¿es seguro usarlo en producción?" → enviar.

Verificar:
- [ ] Placeholder del input dice "¿es seguro usarlo en producción?, ¿cómo es el onboarding?, ¿tiene alternativas mejores?"
- [ ] Subtítulo del chat dice "El agente recuerda este repo. Preguntá lo que necesites para decidir si usarlo."
- [ ] La respuesta del agente es prosa natural (no JSON).
- [ ] No hay errores en la consola del browser ni en la terminal del backend.

- [ ] **Step 6: Verificar portafolio**

Abrir `http://localhost:4321/portfolio` (o equivalente).

Verificar:
- [ ] El repo analizado aparece con su score.
- [ ] La columna de resumen muestra el `sintesisTecnica` del reporte.
- [ ] Abrir `portfolio.json` en disco: el campo del entry es `sintesisTecnica` (no `resumen`).

- [ ] **Step 7: Commit final (si aplica)**

Si hiciste cualquier ajuste menor durante el smoke test, commitealo:

```bash
git add -A
git status  # confirmá que no hay nada raro staged
git commit -m "chore: ajustes menores post smoke test"
```

Si no hay cambios: nada que commitear — cerrar el plan acá.

---

## Task 14: Cargar contenido del README en `analyze_repo_structure`

Durante el smoke test el agente no tuvo acceso al contenido del README: la tool solo devolvía `hasReadme` y `readmeLength`. Eso hacía que la `descripcion` se inferiera desde nombres de archivos y la pregunta de chat "¿Para qué LLM me sirve este skill?" disparara respuestas genéricas (el agente describía sus propias capacidades en lugar del repo). Fix: incluir un snippet del README en el output de la tool para que el LLM tenga texto real sobre qué hace el proyecto.

**Files:**
- Modify: `src/types/index.ts` — agregar `readmeContent: string | null` a `RepoStructure`
- Modify: `src/tools/github-analyzer.ts` — incluir el contenido truncado en el output
- Modify: `src/agent.ts` — actualizar el `SYSTEM_PROMPT` para indicar que use `readmeContent` como fuente primaria para `descripcion`

- [ ] **Step 1: Agregar `readmeContent` al tipo `RepoStructure`**

En `src/types/index.ts`, dentro de la interface `RepoStructure` (después del campo `readmeLength`), agregar:

```typescript
  readmeContent: string | null
```

Queda así:

```typescript
export interface RepoStructure {
  metadata: RepoMetadata
  rootFiles: string[]
  packageJson: Record<string, unknown> | null
  tsconfig: Record<string, unknown> | null
  hasReadme: boolean
  readmeLength: number
  readmeContent: string | null
  hasEslint: boolean
  hasPrettier: boolean
  hasDockerfile: boolean
  hasDockerCompose: boolean
  hasCiCd: boolean
  ciCdFiles: string[]
}
```

- [ ] **Step 2: Incluir el snippet del README en el output de la tool**

En `src/tools/github-analyzer.ts`, en la construcción del `structure` object (alrededor de la línea 101), agregar el campo `readmeContent` truncado a 8000 caracteres. Definir una constante y usarla:

Primero, al tope del archivo (después de `const GITHUB_API = ...`), agregar:

```typescript
const README_SNIPPET_MAX = 8000
```

Luego, en el `structure` object, agregar `readmeContent`:

```typescript
    const structure: RepoStructure = {
      metadata,
      rootFiles,
      packageJson: packageJsonRaw ? JSON.parse(packageJsonRaw) : null,
      tsconfig: tsconfigRaw ? JSON.parse(tsconfigRaw) : null,
      hasReadme: readmeRaw !== null,
      readmeLength: readmeRaw?.length ?? 0,
      readmeContent: readmeRaw ? readmeRaw.slice(0, README_SNIPPET_MAX) : null,
      hasEslint,
      hasPrettier,
      hasDockerfile,
      hasDockerCompose,
      hasCiCd: ciCdFiles.length > 0,
      ciCdFiles,
    }
```

**Por qué 8000 chars:** es suficiente para capturar la sección inicial (título + resumen + quickstart) de la mayoría de los READMEs sin inflar el contexto. Un README promedio útil entra entero; los mega-READMEs de 50KB+ quedan truncados al inicio, que es lo relevante.

- [ ] **Step 3: Actualizar el `SYSTEM_PROMPT` para usar `readmeContent` como fuente primaria**

En `src/agent.ts`, dentro del `SYSTEM_PROMPT`, encontrar la línea que describe las fuentes para `descripcion`:

```
Fuentes, en orden de preferencia: (1) metadata.description de analyze_repo_structure si existe y es informativa, (2) README.md, (3) package.json description, (4) infiere desde dependencias y estructura.
```

Reemplazar por:

```
Fuentes, en orden de preferencia: (1) readmeContent de analyze_repo_structure si es informativo — leelo de verdad, no lo ignores, (2) metadata.description si readmeContent está vacío o es pobre, (3) package.json description, (4) inferencia desde dependencias y estructura SOLO como último recurso.
```

Adicionalmente, en la sección "EVIDENCIA REQUERIDA POR DIMENSIÓN", en el bullet de `documentacionDx`, reemplazar:

```
- documentacionDx: README presente, longitud útil (no vacío), quickstart, ejemplos de código, API docs, CONTRIBUTING.md, changelog, badges.
```

por:

```
- documentacionDx: README presente y su calidad real (leé readmeContent — ¿tiene quickstart?, ¿ejemplos de código?, ¿explica la API?, ¿o es solo un título y badges?). Presencia de CONTRIBUTING.md, changelog.
```

- [ ] **Step 4: Verificar tipado + commit**

```bash
npx tsc --noEmit
git add src/types/index.ts src/tools/github-analyzer.ts src/agent.ts
git commit -m "feat(analyzer): incluir snippet del README en el output de analyze_repo_structure"
```

Expected: `tsc --noEmit` clean.

- [ ] **Step 5: Smoke test rápido con un repo conocido**

Arrancar el backend si no está corriendo:

```bash
npm run dev:server
```

Desde el browser, analizar `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill` (el repo del reporte fallido). Verificar:
- [ ] En la consola del backend, al llamar `analyze_repo_structure`, el output incluye `"readmeContent": "..."` con texto real del README.
- [ ] La `descripcion` generada por el agente refleja contenido del README (no solo inferencia de directorios).

Si el README sigue sin aparecer en el output, hay un bug — escalate.

---

## Task 15: Endurecer `CHAT_SYSTEM_PROMPT` contra auto-descripción

En el smoke test, cuando el dev preguntó "¿Para qué LLM me sirve este skill?", llama3.1 confundió "este skill" (el repo analizado) con las capacidades del propio agente de due diligence y vendió las features del agente en vez de analizar el repo. Fix: reforzar el prompt de chat para anclar explícitamente "este repo / este skill / esta librería" al repositorio analizado, y prohibir auto-descripción.

**Files:**
- Modify: `src/agent.ts` — ajustar `CHAT_SYSTEM_PROMPT`

- [ ] **Step 1: Agregar reglas anti-auto-descripción al `CHAT_SYSTEM_PROMPT`**

En `src/agent.ts`, encontrar el `CHAT_SYSTEM_PROMPT` actual y reemplazarlo por:

```typescript
const CHAT_SYSTEM_PROMPT = `Eres un staff engineer con 15 años de experiencia que ya revisó este repo y emitió el reporte.

CONTEXTO: En turnos anteriores de esta conversación aparece un bloque \`\`\`json con el reporte técnico completo. Ese reporte YA FUE ENTREGADO — no lo repitas, no lo reescribas, no emitas otro JSON. El dev ya lo tiene.

REGLA DE REFERENCIA (crítica — si fallás acá, el dev queda confundido):
Cuando el dev diga "este repo", "este skill", "esta librería", "este proyecto", "esto", o cualquier demostrativo, SIEMPRE se refiere al REPOSITORIO ANALIZADO (el que aparece en el campo "repo" del reporte JSON anterior), NUNCA a vos como agente, NUNCA a la herramienta de due diligence.

PROHIBIDO describir tus propias capacidades como agente ("puedo evaluar repos", "te ayudo a analizar proyectos", "sirvo para tomar decisiones", etc.). El dev no te preguntó qué hacés vos — te preguntó sobre el repo que acabás de analizar. Si tu respuesta empieza con "Este skill/repo te puede servir para..." y seguís describiendo funciones de análisis de GitHub, estás describiendo a vos mismo — detenete y releé la pregunta apuntando al repo analizado.

AHORA ESTÁS EN MODO CONVERSACIÓN. Reglas absolutas:
- PROHIBIDO emitir bloques \`\`\`json, \`\`\`, o cualquier formato estructurado tipo schema. Si tu respuesta empieza con \`{\` o \`\`\`\`, está mal.
- Respondé SIEMPRE en prosa natural en español, en 2 a 5 oraciones. Podés usar listas markdown con guiones si aclaran.
- El reporte (incluyendo descripcion, tecnologias y scores) está en tu memoria — usalo como fuente principal, pero respondé a la pregunta específica del dev sobre el REPO ANALIZADO, no resumas todo el reporte.
- Si la pregunta requiere info que no está en el reporte (ej. detalles de implementación interna, comparación con otro repo no analizado), decilo explícitamente: "No tengo ese dato en el reporte" — no inventes.
- No llames tools salvo que la pregunta exija datos nuevos que no tengas.
- Tono directo, técnico, objetivo. No suavices problemas. Hablás de adopción/integración/forks, no de inversión.

Si tu primer impulso es escribir \`\`\`json o describir tus capacidades como agente, detenete: estás en modo conversación, y el sujeto es el REPO ANALIZADO.`
```

**Cambios respecto al prompt actual**:
- Nueva sección "REGLA DE REFERENCIA" que fija "este repo / este skill" al repositorio analizado.
- Nueva sección "PROHIBIDO describir tus propias capacidades" con un ejemplo concreto del error observado.
- Regla nueva: "Si la pregunta requiere info que no está en el reporte, decilo explícitamente — no inventes."
- Cierre reforzado: "el sujeto es el REPO ANALIZADO".

- [ ] **Step 2: Verificar tipado + commit**

```bash
npx tsc --noEmit
git add src/agent.ts
git commit -m "feat(agent): reforzar chat prompt contra auto-descripción y fijar referente 'este repo'"
```

Expected: `tsc --noEmit` clean.

- [ ] **Step 3: Smoke test rápido del chat**

Con el backend corriendo, analizar cualquier repo. En el chat hacer preguntas con pronombres ambiguos, por ejemplo:
- "¿para qué sirve este skill?"
- "¿podés usarlo en producción?"
- "¿cómo se compara con otros del mismo tipo?"

Verificar:
- [ ] La respuesta describe el REPO ANALIZADO, no las capacidades del agente.
- [ ] Si la pregunta excede los datos del reporte, el agente dice "no tengo ese dato" en vez de inventar.
- [ ] No emite JSON.

---

## Task 16: Feature flag `MODEL_PROVIDER` — agregar Anthropic API

Durante el smoke test con llama3.1:8b (vía Ollama) se observaron alucinaciones en métricas específicas (ej. "último commit hace 2 meses" cuando en realidad fue hace 2 semanas). Es limitación de un modelo chico parseando outputs grandes de tools. Fix: permitir elegir el provider vía env var y agregar soporte para Anthropic API (Claude Sonnet 4.5) como alternativa más confiable, sin romper la opción local.

**Decisión:** feature flag (no swap). Default sigue siendo Ollama (no rompe setup existente). Anthropic se activa con `MODEL_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`.

**Modelo default para Anthropic:** `claude-sonnet-4-5-20250929`. Balance calidad/costo para análisis estructurado (~$0.04-0.08 por reporte).

**Files:**
- Modify: `package.json` — agregar dep `@anthropic-ai/sdk`
- Modify: `src/agent.ts` — factorizar selección de modelo en helper, agregar rama Anthropic
- Modify: `.env.example` — documentar variables nuevas
- Modify: `CLAUDE.md` — actualizar sección de stack con opción Anthropic

- [ ] **Step 1: Instalar `@anthropic-ai/sdk`**

```bash
npm install @anthropic-ai/sdk
```

Expected: dep agregada a `package.json` y `package-lock.json` actualizado. Sin breaking changes — es peer de `@strands-agents/sdk`.

- [ ] **Step 2: Agregar helper `buildModel` en `src/agent.ts`**

En `src/agent.ts`, importar `AnthropicModel` al top (cerca del import de `OpenAIModel`):

```typescript
import { AnthropicModel } from '@strands-agents/sdk/models/anthropic'
```

Dentro de `buildAgent(mcpClient, sessionId?)`, reemplazar el bloque actual de instanciación del modelo (las ~10 líneas que empiezan con `const ollamaHost = ...` y terminan con `})`) por una llamada a un nuevo helper. Agregar el helper fuera de `buildAgent` (antes de su definición, al nivel del módulo):

```typescript
function buildModel() {
  const provider = (process.env.MODEL_PROVIDER || 'ollama').toLowerCase()

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error(
        'MODEL_PROVIDER=anthropic requiere ANTHROPIC_API_KEY en el entorno. ' +
          'Conseguí una en https://console.anthropic.com/settings/keys y agregala al .env.'
      )
    }
    return new AnthropicModel({
      modelId: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
      apiKey,
      params: {
        temperature: 0.1,
      },
    })
  }

  if (provider !== 'ollama') {
    throw new Error(
      `MODEL_PROVIDER="${provider}" no soportado. Valores válidos: "ollama", "anthropic".`
    )
  }

  // Ollama expone API compatible con OpenAI en /v1
  const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434'
  return new OpenAIModel({
    api: 'chat',
    modelId: process.env.OLLAMA_MODEL || 'llama3.1',
    apiKey: 'ollama',
    temperature: 0.1,
    topP: 0.9,
    clientConfig: {
      baseURL: `${ollamaHost}/v1`,
    },
  })
}
```

En `buildAgent`, reemplazar el bloque del modelo con:

```typescript
  const model = buildModel()
```

(Eliminar las líneas actuales que construyen el `OpenAIModel` inline y el comentario sobre Ollama — ya están dentro de `buildModel`.)

**Notas importantes**:
- `AnthropicModel` usa `params.temperature` (no `temperature` top-level — ver `AnthropicModelConfig` extends `BaseModelConfig`, `temperature` no existe; los params extra van en `params`).
- Fail-fast explícito si falta `ANTHROPIC_API_KEY` — mejor un error claro que un 401 cryptic más tarde.
- Fail-fast también si `MODEL_PROVIDER` es un valor desconocido (typo protection).

- [ ] **Step 3: Verificar tipado**

```bash
npx tsc --noEmit
```

Expected: clean.

Si hay error de tipo en `AnthropicModel` al pasar `params.temperature`, leé `node_modules/@strands-agents/sdk/dist/src/models/anthropic.d.ts` para confirmar la forma exacta del config. El type `AnthropicModelConfig` tiene `params?: Record<string, unknown>`, así que `temperature` dentro de `params` es válido (se pasa tal cual a la API de Anthropic).

- [ ] **Step 4: Actualizar `.env.example`**

Al final de `.env.example`, agregar:

```
# Model provider: "ollama" (default) o "anthropic"
MODEL_PROVIDER=ollama

# Anthropic API (solo si MODEL_PROVIDER=anthropic)
# Obtené una API key en https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
```

- [ ] **Step 5: Actualizar `CLAUDE.md`**

En `CLAUDE.md`, en la sección "Stack y comandos" → subsección donde menciona "Proveedor LLM: Ollama local", reemplazar:

```
- **Proveedor LLM:** **Ollama local** — se usa `OpenAIModel` apuntando a `http://localhost:11434/v1` (Ollama expone API OpenAI-compatible). Modelo default: `llama3.1`.
```

con:

```
- **Proveedor LLM:** configurable vía `MODEL_PROVIDER`:
  - `ollama` (default) — `OpenAIModel` apuntando a `http://localhost:11434/v1` (Ollama expone API OpenAI-compatible). Modelo default: `llama3.1`. Gratis, offline, calidad limitada por tamaño del modelo local.
  - `anthropic` — `AnthropicModel` con Claude Sonnet 4.5 (default `claude-sonnet-4-5-20250929`). Requiere `ANTHROPIC_API_KEY`. Parsea tool outputs con más precisión; recomendado si ves alucinaciones en métricas con Ollama.
```

En la sección "Variables de entorno requeridas (.env):", reemplazar el bloque por:

```
OLLAMA_HOST=http://localhost:11434        # solo si MODEL_PROVIDER=ollama
OLLAMA_MODEL=llama3.1                     # solo si MODEL_PROVIDER=ollama
MODEL_PROVIDER=ollama                     # "ollama" o "anthropic"
ANTHROPIC_API_KEY=                        # solo si MODEL_PROVIDER=anthropic
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929 # opcional, default ya apunta a Sonnet 4.5
GITHUB_PERSONAL_ACCESS_TOKEN
PORT=3001
```

Y cerca del prerequisito sobre Ollama, aclarar:

```
Prerequisito (solo si `MODEL_PROVIDER=ollama`): tener Ollama corriendo (`ollama serve`) con un modelo descargado (`ollama pull llama3.1`). Si usás `MODEL_PROVIDER=anthropic`, no hace falta Ollama.
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/agent.ts .env.example CLAUDE.md
git commit -m "feat(agent): feature flag MODEL_PROVIDER con soporte Anthropic API (Claude Sonnet 4.5)"
```

- [ ] **Step 7: Smoke test con Anthropic**

En tu `.env` local:
```
MODEL_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...   # tu key
```

Reiniciar el backend (`tsx watch` debería detectarlo solo si el proceso sigue vivo; si no, `npm run dev:server`).

Re-analizar `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill` en el browser.

Verificar:
- [ ] `descripcion` coherente con el README.
- [ ] `ultimoCommitHace` coincide con la realidad (no alucina).
- [ ] Chat responde sobre el repo, no describe el agente.
- [ ] Reporte completo llega en ~20-40 segundos (latencia aceptable de Sonnet).

Si el reporte es coherente, el fix validó. Si seguís viendo alucinaciones con Sonnet, hay un bug más profundo en la tool (no el modelo) — escalate.
