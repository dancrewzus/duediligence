# Reposicionamiento a audiencia dev

**Fecha:** 2026-04-17
**Estado:** Diseño aprobado, pendiente plan de implementación

## Contexto

El proyecto nació como due diligence técnico **para inversores**: un CTO senior evalúa una startup y emite un reporte con "Score de Inversión Técnica" y "Recomendación al inversor". El system prompt, los campos del schema JSON, los textos de UI y el wrapper del chat están todos orientados a esa audiencia.

El cambio de foco es a **developers** que acaban de encontrar un repo (README malo, propósito poco claro) y necesitan responder rápido: **"¿me sirve este repo?"**. La pregunta guía deja de ser "¿conviene invertir?" y pasa a ser "¿vale la pena adoptarlo/integrarlo/forkearlo?".

Este cambio implica repensar dimensiones de score, renombrar campos del schema, reescribir prompts (análisis + chat) y ajustar la UI.

## Decisiones de diseño

### Audiencia y pregunta guía

- **Rol del agente:** "staff engineer con 15 años de experiencia evaluando repositorios open source" (reemplaza "CTO senior evaluando startups para fondos de inversión").
- **Pregunta guía:** "¿Me sirve este repo?". Cada justificación de score debe responderla implícitamente.
- **Tono:** directo, técnico, concreto. Sin suavizar problemas. Sin jerga de inversión.

### Dimensiones de score (7, antes 6)

| Dimensión | Estado | Nombre en schema |
|---|---|---|
| Stack & Arquitectura | sin cambios | `stackArquitectura` |
| Calidad de código | sin cambios | `calidadCodigo` |
| Documentación & DX | **nueva** (reemplaza Escalabilidad) | `documentacionDx` |
| Mantenimiento & Actividad | **reframe** de Salud del equipo | `mantenimientoActividad` |
| Seguridad | sin cambios | `seguridad` |
| Madurez de dependencias | sin cambios | `madurezDependencias` |
| Testing & CI/CD | **nueva** (antes métrica) | `testingCicd` |

**Racional:**
- *Escalabilidad* es una lente de inversor (¿aguanta crecimiento?). Un dev adoptando una librería rara vez la mide. *Documentación & DX* es lo primero que mata la adopción cuando el README es malo — es la lente que más importa para la pregunta guía.
- *Salud del equipo* como "bus factor" es inversor; *Mantenimiento & Actividad* es dev ("¿responden issues?, ¿hay releases recientes?").
- *Testing & CI/CD* hoy es solo la métrica booleana `tieneTests`. Para un dev que va a depender del repo, tener tests + CI confiable es decisivo y merece peso explícito en el score total.

### Veredicto categórico

Campo nuevo `veredicto` con 4 valores enum (como `deudaTecnica`):

- `"Adoptar"` — verde
- `"Usar con cautela"` — amarillo
- `"Solo referencia"` — azul neutro
- `"Evitar"` — rojo

Complementado por `veredictoDetalle` (prosa, 2-3 oraciones con el porqué y cuándo tiene sentido usarlo).

**Racional:** un dev que cae al repo por Google quiere la decisión arriba y los detalles abajo. Un badge grande coloreado comunica la decisión en un segundo; la prosa sigue disponible para matizar.

### Schema JSON — cambios completos

**Renombrados / reemplazados:**

| Antes | Ahora | Tipo |
|---|---|---|
| `scores.escalabilidad` | `scores.documentacionDx` | `ScoreDimension` |
| `scores.saludEquipo` | `scores.mantenimientoActividad` | `ScoreDimension` |
| `recomendacion` (prosa) | `veredicto` | enum de 4 valores |
| — | `veredictoDetalle` (nuevo) | prosa 2-3 oraciones |
| `resumen` | `sintesisTecnica` | prosa 2-3 oraciones |
| `riesgos` | `banderas` | `string[]` de 3 elementos |

**Nuevos:**
- `scores.testingCicd: ScoreDimension`

**Sin cambios:** `repo`, `descripcion`, `fecha`, `scores.stackArquitectura`, `scores.calidadCodigo`, `scores.seguridad`, `scores.madurezDependencias`, `tecnologias`, `metricas`, `deudaTecnica`, `deudaJustificacion`, `scoreTotal` (ahora promedio de 7), `fortalezas`.

**PortfolioEntry:** el campo `resumen` pasa a llamarse `sintesisTecnica` para mantener consistencia. El portafolio existente se considera obsoleto para este diseño — se empieza de cero.

### System prompt (análisis)

- Rol: staff engineer evaluando repos open source.
- Flujo de trabajo: igual (analyze_repo_structure → MCP tools → reporte).
- Formato final: sigue siendo un bloque ```json único sin prosa antes/después.
- Evidencia requerida por dimensión:
  - **Documentación & DX:** README presente/ausente, longitud útil, quickstart, ejemplos, API docs, CONTRIBUTING.md, changelog.
  - **Mantenimiento & Actividad:** antigüedad del último commit, frecuencia de releases, `issuesAbiertos` vs commits recientes como proxy de respuesta, contributors activos.
  - **Testing & CI/CD:** frameworks (vitest/jest/mocha/pytest), scripts de test, workflows en `.github/workflows`, badge de coverage.
- Checklist pre-emisión actualizado:
  - ¿Los 7 scores están entre 0 y 10?
  - ¿`veredicto` es uno de los 4 valores exactos?
  - ¿`veredictoDetalle` tiene 2-3 oraciones orientadas al dev?
  - ¿`banderas` y `fortalezas` tienen 3 elementos cada uno?
- Ejemplo literal del JSON de respuesta: se actualiza al nuevo schema (7 scores, nuevos nombres, `veredicto` + `veredictoDetalle`, `sintesisTecnica`, `banderas`).

### Chat system prompt (conversación post-reporte)

- Rol: "staff engineer que ya revisó este repo".
- Contexto: "El dev ya vio el reporte" (antes "el inversor").
- Reglas anti-JSON sin cambios.
- Wrapper del mensaje en `server.ts`: `Pregunta del inversor:` → `Pregunta del dev:`.

### UI — cambios en `AnalysisForm.astro`

**Hero:**
- Título: `Due Diligence **Técnico**` → `¿Te sirve este **repo**?`
- Subtítulo nuevo: "Antes de forkear, integrar o pedir permisos, tené la decisión técnica en segundos: qué hace, si está mantenido, y si vale la pena adoptarlo."
- Pill: sin cambios.

**Report header:** sin cambios estructurales. El número grande y el "/ 10" se mantienen como están; no se agrega label extra.

**Veredicto (nueva card, reemplaza "Recomendación al inversor"):**
- Título de sección: "Veredicto".
- Badge grande coloreado con el valor de `veredicto` (~1.1rem, padding generoso).
- Mapping de colores:
  - `Adoptar` → verde (`--accent-green`)
  - `Usar con cautela` → amarillo (`--accent-yellow`)
  - `Solo referencia` → azul (`--accent-blue`)
  - `Evitar` → rojo (`--accent-red`)
- Prosa de `veredictoDetalle` debajo del badge, usando `.recommendation-text`.

**Grid de dimensiones:**
- De 6 tiles a 7 en `scores-grid`. Se mantiene `grid-template-columns: 1fr 1fr` en desktop; el 7° tile queda huérfano en su fila (aceptable visualmente).
- Labels nuevas en `renderScoreBar`:
  - "Escalabilidad" → **"Documentación & DX"**
  - "Salud del equipo" → **"Mantenimiento & Actividad"**
  - Nueva: **"Testing & CI/CD"**

**Riesgos/Banderas:**
- Título de la card: "Top 3 Riesgos" → **"Banderas"** (o "Banderas rojas" si queda corto).
- La key del campo ya es `banderas` en el schema, así que el render usa `r.banderas`.

**Métricas y deuda técnica:** sin cambios.

### Chat UI

- Subtítulo: "El agente recuerda este análisis. Hacé preguntas o pedí profundizar." → **"El agente recuerda este repo. Preguntá lo que necesites para decidir si usarlo."**
- Placeholder: "Ej: profundiza en seguridad, ¿qué pasa con el bus factor?" → **"Ej: ¿es seguro usarlo en producción?, ¿cómo es el onboarding?, ¿tiene alternativas mejores?"**
- Lógica de EventSource y bubbles: sin cambios.

## Archivos afectados

| Archivo | Cambios |
|---|---|
| `src/types/index.ts` | `AnalysisScores` (renombres + `testingCicd`), `AnalysisReport` (renombres de campos), `PortfolioEntry` (renombre `resumen` → `sintesisTecnica`) |
| `src/agent.ts` | `SYSTEM_PROMPT` completo (rol, schema documentado, ejemplo JSON, checklist), `CHAT_SYSTEM_PROMPT` (rol, contexto dev) |
| `src/server.ts` | Wrapper del chat: `Pregunta del dev:`; prompt de análisis sin cambios estructurales |
| `src/session/portfolio.ts` | `saveAnalysis` tool (arg `resumen` → `sintesisTecnica`, descripción), `persistReport` usa `report.sintesisTecnica`, `PortfolioEntry` actualizado |
| `web/src/components/AnalysisForm.astro` | Hero, nueva card de Veredicto con badge + estilos, labels de dimensiones, título "Banderas", render de `r.banderas` y `r.veredicto`/`r.veredictoDetalle`, textos del chat |

## Consideraciones

- **Portafolio existente:** los entries guardados tienen campo `resumen` (schema viejo). No se migra — se documenta que el archivo `portfolio.json` puede borrarse/quedar obsoleto. Alternativa si se quiere preservar: leer `resumen` como fallback de `sintesisTecnica` en `loadPortfolio`. No incluido en este diseño para no agregar compat shim.
- **Sesiones guardadas en `sesiones/`:** el SessionManager restaura snapshots que referencian el schema viejo. No se migra — se recomienda limpiar el directorio tras el cambio. El server ya borra la sesión en cada re-análisis ([server.ts:53](../../../src/server.ts#L53)).
- **Backwards compat:** no se preserva. El proyecto es pre-producción y la audiencia cambió; mantener ambos schemas suma complejidad sin valor.
- **Scope fuera del diseño:** el `@tool analyze_repo_structure` no cambia — ya expone todos los datos que las nuevas dimensiones necesitan (README, CI files, package.json).
