# Due Diligence Técnico — Agente con Strands Agents

> Challenge **"Construye con Strands Agents"** de AWS en **Nerdearla Chile 2026**

Agente de IA que analiza un repositorio público de GitHub y te dice si **te sirve adoptarlo**: qué hace el proyecto, qué tan sano está el código, si está mantenido, si es seguro y qué tan riesgoso sería integrarlo. El output es un reporte estructurado con scores por dimensión, banderas, fortalezas y un veredicto de adopción.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Runtime / Lenguaje | Node.js 20+, TypeScript (ESM) |
| Ejecución TS | tsx |
| SDK principal | `@strands-agents/sdk` (RC) — `Agent`, `tool`, `McpClient`, `SessionManager`, `FileStorage` |
| Proveedor LLM (default) | **Ollama** local — adaptador `OpenAIModel` del SDK contra `http://localhost:11434/v1` |
| Proveedor LLM alternativo | **AWS Bedrock** — `BedrockModel` con Claude Sonnet 4.5 (bearer API key o SigV4) |
| Validación de schemas | zod v4 (requerido por `tool()`) |
| MCP GitHub | `@modelcontextprotocol/server-github` vía `npx` (sin Docker) |
| HTTP Client | axios (GitHub REST API directa) |
| Backend web | Hono + `@hono/node-server` con **Server-Sent Events** |
| Frontend | Astro 5 (componentes `.astro`, CSS vanilla, tema dark con aurora/glassmorphism) |
| Persistencia | `portfolio.json` + snapshots por sesión en `sesiones/` (`FileStorage` del SDK) |

### Variables de entorno (`.env`)

El proyecto incluye un `.env.example` que podés copiar como base. Lo mínimo para correr con Ollama local:

```env
MODEL_PROVIDER=ollama                    # "ollama" (default) o "bedrock"
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.1                    # o qwen3:8b, qwen2.5-coder, mistral-nemo
GITHUB_PERSONAL_ACCESS_TOKEN=your_pat    # para GitHub REST API y MCP
PORT=3001
```

Si `MODEL_PROVIDER=bedrock`, además:

```env
AWS_REGION=us-east-1
BEDROCK_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0

# Opción A — bearer token:
BEDROCK_API_KEY=...

# Opción B — credenciales AWS estándar (SigV4):
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Para Bedrock necesitás habilitar acceso al modelo previamente en la [consola de Bedrock](https://console.aws.amazon.com/bedrock/home#/modelaccess).

### Setup de Ollama (solo si usás el provider local)

```bash
# macOS/Linux
curl -fsSL https://ollama.com/install.sh | sh

# Descargar modelo con soporte de tool-calling
ollama pull llama3.1

# Arrancar el servidor (si no usás la app de macOS)
ollama serve
```

> ⚠️ **Nota sobre modelos locales:** los modelos de 8B parámetros a veces ignoran resultados de tools o alucinan datos. Para análisis confiables, `llama3.1:70b` es notoriamente mejor, o directamente `MODEL_PROVIDER=bedrock` con Claude Sonnet 4.5.

---

## Estructura del proyecto

```
duediligence/
├── src/
│   ├── index.ts                    # CLI — loop de conversación readline
│   ├── server.ts                   # Servidor Hono (SSE analyze + chat + portfolio)
│   ├── agent.ts                    # Agent Strands (system prompt análisis + chat) y builder multi-provider
│   ├── server/
│   │   └── stream-events.ts        # Tool→stage mapping, parseo del JSON del reporte
│   ├── tools/
│   │   └── github-analyzer.ts      # @tool analyze_repo_structure
│   ├── mcp/
│   │   └── github-mcp.ts           # Cliente MCP del SDK → github-mcp-server
│   ├── session/
│   │   └── portfolio.ts            # Tools de portafolio (save/get) + persistencia JSON
│   └── types/
│       └── index.ts                # AnalysisReport, PortfolioEntry, RepoStructure, etc.
├── web/
│   ├── src/
│   │   ├── layouts/Layout.astro       # Layout global (aurora background, footer)
│   │   ├── pages/
│   │   │   ├── index.astro            # Form + timeline + reporte en vivo
│   │   │   └── portfolio.astro        # Tabla del portafolio persistido
│   │   ├── components/
│   │   │   ├── AnalysisForm.astro     # Form, timeline SSE, reasoning en vivo, chat post-reporte
│   │   │   └── PortfolioTable.astro   # Render del portafolio con detalle expandible
│   │   └── styles/                    # CSS vanilla por feature
│   └── package.json
├── sesiones/                       # Snapshots por repo (FileStorage del SDK, gitignored)
├── portfolio.json                  # Portafolio persistido (gitignored, se crea al vuelo)
├── .env.example
├── tsconfig.json
└── package.json
```

---

## Capacidades del agente

### 1. `analyze_repo_structure` — `@tool` personalizado

Dado un `owner/repo` de GitHub:

- Llama a la GitHub REST API para obtener metadata y árbol de archivos.
- Lee archivos clave: `package.json`, `tsconfig.json`, `README.md`, configs (ESLint, Prettier, Docker, CI/CD).
- Extrae dependencias, devDependencies, scripts, versiones, estructura de carpetas y el contenido del README.
- Retorna un `RepoStructure` tipado para que el LLM razone sobre él.

### 2. MCP Server de GitHub — historial y actividad del equipo

- Cliente MCP nativo del SDK conectado a `@modelcontextprotocol/server-github` vía `npx`.
- Expone tools para: `list_commits`, `list_pull_requests`, `list_contributors`, `list_issues`.
- **Degradación grácil:** si el MCP falla al iniciar (timeout, token inválido, etc.), el agente sigue funcionando con solo el `@tool` custom.

### 3. Session management — portafolio + memoria por repo

- **Portafolio persistente** (`portfolio.json`): cada análisis completado se guarda con `repo`, `fecha`, `score`, `descripcion`, `sintesisTecnica`, `veredictoDetalle`, `duracionMs` y el reporte completo.
- **Snapshots por repo** (`sesiones/<owner>__<repo>/…`): el `FileStorage` del SDK guarda el historial de conversación para que el dev pueda seguir charlando con el agente sobre el repo ya analizado (modo chat).
- Al iniciar, el portafolio se inyecta como contexto en el system prompt, permitiendo comparaciones ("¿cuál tiene mejor score?", "compara A vs B") vía el tool `get_portfolio`.
- Re-analizar el mismo repo **borra el snapshot previo** para arrancar limpio.

---

## Endpoints (`src/server.ts`)

| Método | Ruta | Qué hace |
|--------|------|----------|
| `GET`  | `/api/analyze/stream?repoUrl=...&provider=ollama\|bedrock` | SSE con eventos `stage`, `tool`, `reasoning`, `report`, `error`, `done` durante el análisis |
| `GET`  | `/api/portfolio` | Lista de análisis persistidos (JSON) |
| `GET`  | `/api/chat/stream?repoUrl=...&message=...` | SSE de chat post-reporte usando el snapshot de sesión del repo |

El mapeo `tool → stage` vive en [stream-events.ts](src/server/stream-events.ts) (p. ej. `analyze_repo_structure` → `fetching_metadata`, tools MCP → `fetching_github_data`). El servidor es authoritative para persistir el portafolio — si el LLM olvida llamar `save_analysis`, el server guarda igual al emitir el evento `report`.

---

## Contrato del reporte

El agente responde con **un único bloque** ` ```json ... ``` ` con el schema exacto. El frontend lo parsea y renderiza como tarjetas. El tipo canónico es [AnalysisReport en types/index.ts](src/types/index.ts):

```jsonc
{
  "descripcion": "1–3 oraciones (≤500 chars) explicando QUÉ es el proyecto",
  "scores": {
    "stackArquitectura":       { "score": 0-10, "justificacion": "..." },
    "calidadCodigo":           { "score": 0-10, "justificacion": "..." },
    "documentacionDx":         { "score": 0-10, "justificacion": "..." },
    "mantenimientoActividad":  { "score": 0-10, "justificacion": "..." },
    "seguridad":               { "score": 0-10, "justificacion": "..." },
    "madurezDependencias":     { "score": 0-10, "justificacion": "..." },
    "testingCicd":             { "score": 0-10, "justificacion": "..." }
  },
  "tecnologias": {
    "frontend":        ["Astro 5", "CSS vanilla"],
    "backend":         ["Node 20", "Hono 4", "TypeScript 5"],
    "database":        [],
    "infraestructura": [],
    "testing":         [],
    "cicd":            []
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
  "deudaTecnica": "Alta | Media | Baja",
  "deudaJustificacion": "...",
  "scoreTotal": 4.9,
  "banderas":   ["...", "...", "..."],   // exactamente 3 — señales de alerta para el dev
  "fortalezas": ["...", "...", "..."],   // exactamente 3 — puntos fuertes concretos
  "veredicto": "Adoptar | Usar con cautela | Solo referencia | Evitar",
  "veredictoDetalle": "2–3 oraciones explicando cuándo tiene sentido usar (o no) el repo",
  "sintesisTecnica": "2–3 oraciones con la síntesis técnica para el dev"
}
```

**Defaults cuando no hay dato** (el agente nunca inventa): número → `-1`, string → `"N/D"`, array → `[]`.

Tras cada análisis el servidor persiste la entrada en `portfolio.json` y guarda el snapshot de la sesión en `sesiones/`.

---

## Tono del agente

> Eres un **staff engineer** con 15 años de experiencia evaluando repositorios open source. Tu trabajo es ayudar a otro dev que acaba de encontrar un repo en GitHub a decidir **si le sirve**: qué hace, si está bien construido, si es seguro adoptarlo, si va a estar mantenido cuando lo necesite, y si podrá entenderlo aunque el README sea pobre.
>
> Directo, técnico, objetivo. El dev necesita la verdad — no suavizamos problemas. Hablamos de adopción/integración/forks, no de inversión.

En **modo chat** (después de emitido el reporte), el agente responde en prosa natural usando el reporte como memoria, sin repetirlo ni emitir JSON.

---

## Uso

```bash
# 0. Prerequisito (solo si MODEL_PROVIDER=ollama)
ollama pull llama3.1
ollama serve

# 1. Instalar dependencias
npm install
cd web && npm install && cd ..

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tu GITHUB_PERSONAL_ACCESS_TOKEN (y credenciales de Bedrock si aplica)

# 3. Backend — elegí una de las dos:
npm run dev          # CLI interactivo (readline)
npm run dev:server   # Servidor Hono en http://localhost:3001

# 4. Frontend (en otra terminal)
npm run dev:web      # http://localhost:4321

# Build TypeScript del backend
npm run build
npm run start:server # Correr el build compilado
```

---

## Notas de implementación

### Backend

- **Multi-provider en runtime:** `buildAgent(mcpClient, sessionId, providerOverride?)` permite pasar `?provider=bedrock` por query al endpoint SSE y construir el agente con el modelo elegido sin reiniciar el server.
- **Bedrock + bearer token:** el Strands SDK inserta `Authorization: Bearer <key>` vía middleware, pero AWS SDK v3 corre SigV4 antes y falla con "Could not load credentials" si no encuentra creds. El código pasa credenciales dummy al `clientConfig.credentials` para que el chain no explote — el middleware sobreescribe el header final.
- **Session isolation:** cada `owner/repo` usa su propio `sessionId` normalizado (`owner__repo`). Re-analizar borra el snapshot con `FileStorage.deleteSession` para arrancar limpio.
- **MCP opcional:** el server chequea `listTools()` al conectar; si falla, el agente arranca sin el MCP client en la lista de tools.
- **Robustez del JSON:** temperatura baja (0.1), system prompt con schema + checklist, `extractReport` tolera ` ```json ` o bloque sin etiqueta y aplica fallback de parsing si el LLM agrega texto alrededor.
- **Persistencia authoritative:** el server guarda el portafolio al emitir `report`, independientemente de si el LLM llamó `save_analysis`. Un fallo al persistir no bloquea la emisión del evento.

### Frontend

- **Timeline de progreso** con 5 estados (`starting`, `fetching_metadata`, `fetching_github_data`, `analyzing`, `generating_report`) que se iluminan conforme llegan los eventos SSE del backend.
- **Frases rotando** por stage cada 3s con crossfade, sin bias en la rotación.
- **Timer mm:ss.d** en vivo durante el análisis; al terminar se congela con el valor exacto que reportó el servidor (`duracionMs`), y en el portafolio se muestra como pill de duración junto al score.
- **Panel de razonamiento** (`<details>`) que stremea los chunks de texto del LLM mientras piensa.
- **Cierre limpio del `EventSource`** al re-submitear o al llegar `error`/`done` — evita UI clobber.
- **Render del reporte** con tarjetas: header (descripción + score total + veredicto), stack por categoría, métricas, scores por dimensión con justificación, banderas/fortalezas y síntesis técnica. Todo el render client-side escapa HTML para prevenir XSS por prompt-injection en READMEs maliciosos.
- **Chat post-reporte** conectado a `/api/chat/stream` — el agente responde en prosa usando la sesión ya cargada.
- **Portafolio:** fila clickeable que expande el reporte completo; el nombre del repo es un link directo al repositorio en GitHub.
- Diseño: tema dark con **aurora background** animado, grid sutil, glassmorphism, tipografía Inter + Space Grotesk + JetBrains Mono.
- Footer con atribución al autor y al challenge **Nerdearla Chile 2026**.
