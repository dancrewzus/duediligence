# Due Diligence Técnico para Startups — Agente con Strands Agents

> Challenge **"Construye con Strands Agents"** de AWS en **Nerdearla Chile 2026**

Agente de IA que realiza due diligence técnico de startups a partir de su repositorio de GitHub. Evalúa calidad de código, arquitectura, deuda técnica, salud del equipo y genera un **score de inversión técnica**.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Runtime / Lenguaje | Node.js 20+, TypeScript (ESM) |
| Ejecución TS | tsx |
| SDK principal | `@strands-agents/sdk` (RC) — `Agent`, `tool`, `McpClient` |
| Proveedor LLM | **Ollama** (local, open source) — `llama3.1` por default |
| Adaptador LLM | `OpenAIModel` del SDK apuntando al endpoint OpenAI-compatible de Ollama |
| Validación de schemas | zod v4 (requerido por `tool()`) |
| MCP GitHub | `@modelcontextprotocol/server-github` vía npx |
| HTTP Client | axios (GitHub REST API) |
| Backend web | Hono + `@hono/node-server` con streaming vía **Server-Sent Events** |
| Frontend | Astro 5 (componentes `.astro`, CSS vanilla, tema dark con aurora/glassmorphism) |

### Credenciales requeridas (`.env`)

```env
# Ollama local — asegurate de tener `ollama serve` corriendo
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.1

# GitHub Personal Access Token (para GitHub REST API y MCP server)
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_pat

# Puerto del servidor Hono
PORT=3001
```

### Setup de Ollama

Antes de correr el proyecto necesitas tener Ollama instalado y un modelo descargado:

```bash
# Instalar Ollama (macOS/Linux)
curl -fsSL https://ollama.com/install.sh | sh

# Descargar un modelo con soporte de tool-calling
ollama pull llama3.1

# (Si no usas la app de macOS) arrancar el servidor
ollama serve
```

**Modelos recomendados con buen tool-calling:**
- `llama3.1` (8B) — balance velocidad/calidad, default del proyecto
- `qwen2.5-coder` — enfocado en código, puede ser más preciso analizando repos
- `mistral-nemo` — buena latencia

> ⚠️ **Nota sobre modelos locales:** los modelos de 8B parámetros a veces ignoran los resultados de los tools o alucinan datos. Si tu hardware lo permite, `llama3.1:70b` es notoriamente más confiable. Para swapear proveedor por uno cloud (Bedrock, Anthropic, OpenAI), basta con cambiar el modelo en `src/agent.ts`.

---

## Estructura del proyecto

```
due-diligence-agent/
├── src/
│   ├── index.ts                    # CLI — loop de conversación readline
│   ├── server.ts                   # Servidor Hono (SSE + portfolio REST)
│   ├── agent.ts                    # Configuración del agente Strands (system prompt + schema)
│   ├── server/
│   │   └── stream-events.ts        # Helpers: tool→stage mapping, parseo del reporte
│   ├── tools/
│   │   └── github-analyzer.ts      # @tool personalizado
│   ├── mcp/
│   │   └── github-mcp.ts           # Conexión al MCP server de GitHub
│   ├── session/
│   │   └── portfolio.ts            # Session management y portafolio
│   └── types/
│       └── index.ts                # Interfaces TypeScript (AnalysisReport, etc.)
├── web/
│   ├── src/
│   │   ├── layouts/Layout.astro    # Layout con aurora background + footer
│   │   ├── pages/                  # / (analizar) · /portfolio
│   │   └── components/
│   │       ├── AnalysisForm.astro  # Form + timeline SSE + razonamiento en vivo
│   │       ├── ReportCard.astro    # Header del reporte (descripción + score total)
│   │       ├── ScoreBar.astro      # Barra de score por dimensión + justificación
│   │       ├── TechStackCard.astro # Stack detectado por categoría
│   │       ├── MetricsCard.astro   # Métricas cuantitativas del repo
│   │       ├── RiskStrengthCard.astro # Top 3 riesgos / fortalezas
│   │       └── PortfolioTable.astro   # Tabla del portafolio
│   └── package.json
├── portfolio.json                  # Persistencia local del portafolio (gitignored)
├── .env                            # Variables de entorno (gitignored)
├── tsconfig.json
└── package.json
```

---

## Tools implementados

### 1. `analyze_repo_structure` — `@tool` personalizado

Dado un `owner/repo` de GitHub:

- Llama a la GitHub REST API para obtener el árbol de archivos.
- Lee archivos clave: `package.json`, `tsconfig.json`, `README.md`, archivos de configuración (eslint, prettier, docker, ci/cd).
- Extrae: dependencias, devDependencies, scripts, versiones, estructura de carpetas.
- Retorna un objeto estructurado con todos estos datos para que el agente los analice.

### 2. MCP Server de GitHub — acceso a historial y actividad

- Usa el MCP client nativo de `@strands-agents/sdk` para conectarse al `github-mcp-server`.
- El agente usa sus tools para: listar commits recientes, ver issues, ver pull requests, obtener estadísticas de contributors.

### 3. Session management — portafolio de análisis

- Guarda cada análisis completado en `portfolio.json` con: repo, fecha, score, resumen.
- Al iniciar, carga el portafolio existente y lo pasa como contexto al agente.
- El agente puede responder preguntas como:
  - *"¿Cuál de los repos analizados tiene mejor score?"*
  - *"Compara Startup A vs Startup B"*

---

## Formato del reporte de salida

El agente emite siempre un **bloque JSON** con el schema completo del reporte. El frontend lo renderiza como tarjetas (score total, descripción ejecutiva, stack, métricas, riesgos, fortalezas, recomendación). El schema es estricto — todos los campos son obligatorios:

```jsonc
{
  "descripcion": "1–3 oraciones (≤500 chars) explicando QUÉ es el proyecto",
  "scores": {
    "stackArquitectura":    { "score": 0-10, "justificacion": "..." },
    "calidadCodigo":        { "score": 0-10, "justificacion": "..." },
    "escalabilidad":        { "score": 0-10, "justificacion": "..." },
    "saludEquipo":          { "score": 0-10, "justificacion": "..." },
    "seguridad":            { "score": 0-10, "justificacion": "..." },
    "madurezDependencias":  { "score": 0-10, "justificacion": "..." }
  },
  "tecnologias": {
    "frontend":       ["React 18", "Astro 5"],
    "backend":        ["Node 20", "Hono"],
    "database":       ["PostgreSQL 15"],
    "infraestructura":["Docker", "GitHub Actions"],
    "testing":        [],
    "cicd":           ["GitHub Actions"]
  },
  "metricas": {
    "contributors": 3,
    "commitsUltimoMes": 42,
    "issuesAbiertas": 7,
    "issuesCerradas": 120,
    "prsAbiertas": 2,
    "prsMergeadas": 58,
    "ultimoCommit": "2026-04-10",
    "estrellas": 214,
    "forks": 18,
    "lenguajePrincipal": "TypeScript"
  },
  "deudaTecnica": "Alta | Media | Baja",
  "scoreTotal": 7.1,
  "riesgos":    ["...", "...", "..."],   // exactamente 3
  "fortalezas": ["...", "...", "..."],   // exactamente 3
  "recomendacion": "...",
  "resumen": "2–3 oraciones de síntesis ejecutiva"
}
```

Tras cada análisis completado, se persiste en `portfolio.json`: `{ repo, descripcion, fecha, scoreTotal, resumen }` + el reporte completo para render rápido en la tabla.

---

## System prompt del agente

> Eres un CTO senior con 15 años de experiencia evaluando startups para fondos de inversión. Tu trabajo es realizar due diligence técnico de repositorios de GitHub y generar un reporte de inversión técnica objetivo y accionable.
>
> Cuando el usuario te dé una URL de GitHub, debes:
> 1. Usar `analyze_repo_structure` para obtener la estructura del proyecto
> 2. Usar las herramientas del MCP de GitHub para analizar actividad del equipo
> 3. Evaluar cada dimensión técnica con criterio de CTO experimentado
> 4. Generar el reporte con el formato establecido
>
> También tienes acceso al portafolio de análisis anteriores. Puedes comparar startups, responder preguntas sobre análisis pasados y actualizar el portafolio.
>
> Sé directo, técnico y objetivo. No suavices los problemas que encuentres. Un inversor necesita la verdad, no lo que quiere escuchar.

---

## Uso

```bash
# 0. Prerequisito: Ollama corriendo con el modelo descargado
ollama pull llama3.1
ollama serve  # (no es necesario si usas la app de macOS)

# 1. Instalar dependencias
npm install
cd web && npm install && cd ..

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tu GitHub PAT

# 3. Correr el backend (CLI o servidor)
npm run dev          # CLI interactivo via readline
npm run dev:server   # Servidor Hono en http://localhost:3001

# 4. Correr el frontend Astro (en otra terminal)
npm run dev:web      # http://localhost:4321

# Compilar TypeScript (backend)
npm run build
```

---

## Notas de implementación

### Backend

- El entry point CLI es un loop de conversación simple via readline.
- El servidor Hono expone:
  - `GET  /api/analyze/stream?repoUrl=...` — **Server-Sent Events** con eventos `stage`, `tool`, `reasoning`, `report`, `error`, `done`.
  - `GET  /api/portfolio` — lista de análisis persistidos.
  - `POST /api/portfolio/clear` — reset del portafolio.
- El mapeo tool → stage vive en `src/server/stream-events.ts` (p. ej. `analyze_repo_structure` → `fetching_metadata`; tools MCP de commits → `fetching_github_data`).
- El servidor Hono es authoritative para la persistencia del portfolio (evita desync con lo que el LLM decide guardar via `save_analysis`). Un fallo al persistir no bloquea la emisión del evento `report`.
- El MCP de GitHub se conecta vía `npx -y @modelcontextprotocol/server-github` (sin Docker) para simplicidad. Si el MCP falla al conectar (probado con `listTools()`), el agente sigue funcionando con solo el `@tool` custom.
- `portfolio.json` se crea automáticamente si no existe.
- TypeScript estricto con tipos para todo (`AnalysisReport` es el contrato compartido).
- Para forzar JSON válido: temperatura baja, system prompt con schema exacto + checklist, y retry con un reintento si el parseo falla.

### Frontend

- **Timeline de progreso** con 5 estados (`starting`, `fetching_metadata`, `fetching_github_data`, `analyzing`, `generating_report`) que se iluminan conforme llegan eventos SSE.
- **Panel de razonamiento en vivo** (`<details>`) que stremea los chunks de texto del LLM mientras piensa.
- **Cierre limpio del EventSource** al re-submitear o al llegar `error`/`done` para evitar UI clobber.
- **Render del reporte** con tarjetas: header (descripción + score total), stack por categoría, métricas cuantitativas, scores por dimensión con justificación, riesgos/fortalezas y recomendación.
- Render client-side escapa HTML para prevenir XSS por prompt-injection via READMEs maliciosos.
- Diseño: tema dark con **aurora background** animado, grid sutil, glassmorphism, tipografía Inter + Space Grotesk + JetBrains Mono.
- Footer con atribución al autor y al challenge **Nerdearla Chile 2026**.
