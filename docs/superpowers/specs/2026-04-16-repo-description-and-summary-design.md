# Descripción de repo y resumen ejecutivo en el reporte

**Fecha:** 2026-04-16
**Topic:** Mostrar descripción del repo y síntesis ejecutiva en la UI del reporte

## Contexto

Hoy el header del reporte muestra solo `repo`, `fecha` y `scoreTotal`. El inversionista no sabe *de qué trata* el proyecto antes de entrar al detalle de scores. Además, `AnalysisReport.resumen` existe en el tipo y lo produce el agente, pero no se renderiza en ningún componente — información valiosa desperdiciada.

## Objetivo

Que el inversionista pueda ubicarse rápido al abrir un reporte:

1. **Qué es el repo** — descripción oficial de GitHub (one-liner).
2. **Qué concluyo del análisis** — resumen ejecutivo del agente (2-3 frases).

Ambas piezas antes de exponerse al detalle técnico.

## Cambios

### 1. Tipo

En [src/types/index.ts](../../../src/types/index.ts), agregar a `AnalysisReport`:

```ts
descripcion: string | null
```

`resumen: string` ya existe — no se toca.

### 2. Agente

En [src/agent.ts](../../../src/agent.ts) (system prompt / contrato de salida JSON):

- Incluir `descripcion` en el esquema del JSON que debe emitir el agente.
- Valor: copiar literalmente `metadata.description` devuelto por `analyze_repo_structure`. Si viene `null`, emitir `null`.
- Reforzar que `resumen` sea una síntesis ejecutiva de 2-3 frases orientada a inversor (qué tipo de proyecto es, señales clave, veredicto corto). No debe repetir los scores dimensión por dimensión.

### 3. UI — Header

En [web/src/components/ReportCard.astro](../../../web/src/components/ReportCard.astro), en `report-header-info` (líneas 20-23), agregar entre `report-repo` y `report-date`:

```astro
{report.descripcion && <p class="report-description">{report.descripcion}</p>}
```

Estilo: `font-size: 0.95rem`, `color: var(--text-secondary)`, `line-height: 1.5`, `margin-top: 6px`.

Si `descripcion` es `null` o cadena vacía, no se renderiza el párrafo — el header queda visualmente idéntico a como está hoy.

### 4. UI — Resumen ejecutivo

En el mismo componente, insertar una nueva sección entre el header (línea 28) y `<TechStackCard/>` (línea 30):

```astro
<div class="report-summary card">
  <h3 class="section-title">Resumen ejecutivo</h3>
  <p class="summary-text">{report.resumen}</p>
</div>
```

Reutiliza `.card` y `.section-title` existentes. `.summary-text` toma el mismo patrón que `.recommendation-text` (0.95rem, `--text-secondary`, line-height 1.7).

### 5. Fallbacks y compatibilidad

- **`descripcion` null/vacía:** párrafo no se renderiza (condicional en template).
- **Reportes antiguos** ya guardados que no tengan `descripcion`: el campo llega `undefined`, el condicional lo trata como ausente — no rompe.
- **`resumen` faltante** (no debería ocurrir): siempre se espera que el agente lo produzca; si algún día viene vacío, la card muestra un párrafo vacío. No agregamos guard porque es caso imposible bajo el contrato actual y contradice "no validar lo que no puede pasar".

## Out of scope

- Modificar `PortfolioEntry` (ya tiene su propio `resumen` para la tabla del portafolio).
- Cambiar el formato box-drawing del reporte en consola.
- Traducir la descripción de GitHub si viene en inglés.
