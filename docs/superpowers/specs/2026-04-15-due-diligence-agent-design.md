# Due Diligence Tecnico — Spec de Diseno

> Agente de IA para due diligence tecnico de startups. Dado un repo de GitHub, evalua calidad de codigo, arquitectura, deuda tecnica, salud del equipo y produce un score de inversion tecnica.

**Contexto:** Challenge "Construye con Strands Agents" de AWS en Nerdearla Chile 2026.

---

## Stack tecnologico

| Capa | Tecnologia |
|------|-----------|
| Runtime | Node.js 20+, TypeScript ESM (`"type": "module"`) |
| Ejecucion TS | tsx |
| SDK agente | `@strands-agents/sdk` (preview) — `Agent`, `tool`, `McpClient` |
| Proveedor LLM | Amazon Bedrock — Claude Sonnet 4 |
| Validacion | zod (requerido por `tool()` del SDK) |
| MCP GitHub | `@modelcontextprotocol/server-github` via npx + stdio |
| HTTP client | axios (GitHub REST API) |
| Backend web | Hono (servidor HTTP para API) |
| Frontend | Astro (componentes `.astro`, CSS vanilla) |
| Env | dotenv |

---

## Estructura del proyecto

```
duediligence/
├── src/
│   ├── index.ts                # Entry point CLI — readline loop
│   ├── server.ts               # Entry point Web — Hono HTTP server
│   ├── agent.ts                # Configuracion del Agent (compartido CLI y web)
│   ├── tools/
│   │   └── github-analyzer.ts  # tool(): analyze_repo_structure (GitHub REST API)
│   ├── mcp/
│   │   └── github-mcp.ts      # McpClient → @modelcontextprotocol/server-github
│   ├── session/
│   │   └── portfolio.ts       # CRUD portfolio.json + tools save_analysis/get_portfolio
│   └── types/
│       └── index.ts           # Interfaces compartidas
├── web/                        # Astro frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index.astro         # Pagina principal — input URL + reporte
│   │   │   └── portfolio.astro     # Historico de analisis
│   │   ├── components/
│   │   │   ├── AnalysisForm.astro
│   │   │   ├── ReportCard.astro        # Dashboard visual del reporte
│   │   │   ├── ScoreBar.astro          # Barra de progreso X/10
│   │   │   ├── RiskStrengthCard.astro  # Cards para riesgos/fortalezas
│   │   │   └── PortfolioTable.astro    # Tabla de analisis pasados
│   │   ├── layouts/
│   │   │   └── Layout.astro
│   │   └── styles/
│   │       └── global.css
│   ├── astro.config.mjs
│   └── package.json
├── package.json                # Root con scripts para CLI y web
├── tsconfig.json
├── .env
├── .env.example
├── .gitignore
└── portfolio.json              # Persistencia local (auto-creado)
```

---

## Dependencias

### Root (backend + CLI)

```json
{
  "type": "module",
  "dependencies": {
    "@strands-agents/sdk": "latest",
    "zod": "^3.23",
    "axios": "^1.7",
    "hono": "^4",
    "@hono/node-server": "^1",
    "dotenv": "^16.4"
  },
  "devDependencies": {
    "typescript": "^5.5",
    "tsx": "^4.19",
    "@types/node": "^20"
  }
}
```

`@modelcontextprotocol/sdk` viene como dependencia transitiva de `@strands-agents/sdk`. Usamos `StdioClientTransport` de `@modelcontextprotocol/sdk/client/stdio.js`.

### Web (frontend)

Astro con dependencias minimas — sin framework de UI (React/Vue). CSS vanilla con custom properties.

---

## Los 3 tools del agente

### Tool 1: `analyze_repo_structure` (custom tool)

**Proposito:** Obtener la estructura y configuracion de un repo de GitHub via REST API para que el LLM tenga datos concretos sobre los que razonar.

**Input schema:**
```typescript
z.object({
  owner: z.string().describe('GitHub repository owner'),
  repo: z.string().describe('GitHub repository name'),
})
```

**Logica:**
1. GET `/repos/{owner}/{repo}` — metadata del repo (lenguaje, estrellas, forks, ultimo push)
2. GET `/repos/{owner}/{repo}/contents` — listado raiz de archivos
3. GET contenido de archivos clave (si existen):
   - `package.json` — dependencias, scripts, version de Node
   - `tsconfig.json` — configuracion de TypeScript
   - `README.md` — existencia y tamano
   - `.eslintrc*` / `eslint.config.*` — linting
   - `.prettierrc*` — formatting
   - `Dockerfile` / `docker-compose.yml` — containerizacion
   - `.github/workflows/*.yml` — CI/CD
4. Retorna un objeto `RepoStructure` con todos estos datos parseados

**Headers:** `Authorization: Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}`

### Tool 2: MCP GitHub (McpClient)

**Proposito:** Acceso a historial y actividad del repo — commits, issues, PRs, contributors. Datos que el tool custom no cubre.

**Conexion:**
```typescript
import { McpClient } from '@strands-agents/sdk'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const mcpClient = new McpClient({
  transport: new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN }
  })
})
```

**Degradacion gracil:** La conexion MCP se intenta en un try/catch. Si falla:
- Se loguea el error a stderr
- El Agent se crea sin el McpClient en su array de tools
- El agente funciona con capacidad reducida (solo analyze_repo_structure)
- El LLM marca "datos insuficientes" en dimensiones que dependian del MCP

### Tool 3: Portfolio management (save_analysis + get_portfolio)

**`save_analysis`:**
```typescript
z.object({
  repo: z.string().describe('Full repo name owner/repo'),
  score: z.number().describe('Overall investment score 0-10'),
  resumen: z.string().describe('Brief summary of the analysis'),
})
```
Agrega `{ repo, fecha: new Date().toISOString(), score, resumen }` a `portfolio.json`.

**`get_portfolio`:**
```typescript
z.object({})
```
Lee y retorna el contenido actual de `portfolio.json`. Permite al agente comparar startups y responder preguntas sobre analisis pasados.

**Auto-creacion:** Si `portfolio.json` no existe al iniciar, se crea con `[]`.

---

## API HTTP (Hono)

### `POST /api/analyze`

**Request:**
```json
{ "repoUrl": "https://github.com/owner/repo" }
```

**Proceso:**
1. Parsea owner/repo de la URL
2. Ejecuta `agent.invoke()` con prompt de analisis
3. El agente usa sus tools, razona, y genera el reporte
4. Parsea la respuesta del agente a JSON estructurado

**Response:**
```json
{
  "repo": "owner/repo",
  "fecha": "2026-04-15T...",
  "scores": {
    "stackArquitectura": 7,
    "calidadCodigo": 6,
    "escalabilidad": 5,
    "saludEquipo": 8,
    "seguridad": 4,
    "madurezDependencias": 7
  },
  "deudaTecnica": "Media",
  "scoreTotal": 6.2,
  "riesgos": ["...", "...", "..."],
  "fortalezas": ["...", "...", "..."],
  "recomendacion": "...",
  "resumen": "..."
}
```

### `GET /api/portfolio`

Retorna el array de `portfolio.json`.

---

## Frontend Astro

### Pagina principal (`/`)

- Header: branding "Due Diligence Tecnico"
- Input centrado para URL del repo GitHub
- Boton "Analizar"
- Loading state: spinner + "Analizando repositorio..."
- Resultado: dashboard visual del reporte (ReportCard)

### Pagina portfolio (`/portfolio`)

- Tabla/grid con analisis pasados
- Columnas: repo, fecha, score total, resumen
- Ordenable por score o fecha
- Click en fila expande el detalle

### Componentes visuales del reporte

**ScoreBar:** Barra de progreso horizontal X/10 con colores segun rango:
- Verde (>7): bueno
- Amarillo (4-7): aceptable
- Rojo (<4): problematico

**ReportCard:** Dashboard completo:
- Score total grande y prominente (badge circular con color)
- 6 ScoreBars para cada dimension
- Badge de deuda tecnica: Alta (rojo), Media (amarillo), Baja (verde)
- Dos cards lado a lado: Riesgos (icono warning) y Fortalezas (icono check)
- Bloque de texto: Recomendacion al inversor

**PortfolioTable:** Tabla con filas clickeables, badges de score con color.

### Paleta de colores

Oscura/profesional — estilo fintech/VC dashboard:
- Fondo: dark (#0a0a0f, #12121a)
- Cards: bordes sutiles, fondo ligeramente mas claro
- Acentos: azul (#3b82f6) y verde (#10b981) para transmitir confianza
- Texto: blanco/gris claro
- Alertas: rojo (#ef4444), amarillo (#f59e0b), verde (#10b981)

---

## System prompt del agente

```
Eres un CTO senior con 15 anos de experiencia evaluando startups para fondos de inversion.
Tu trabajo es realizar due diligence tecnico de repositorios de GitHub y generar un reporte
de inversion tecnica objetivo y accionable.

Cuando el usuario te de un repositorio de GitHub, debes:
1. Usar analyze_repo_structure para obtener la estructura del proyecto
2. Usar las herramientas del MCP de GitHub para analizar actividad del equipo
   (commits, PRs, issues, contributors)
3. Evaluar cada dimension tecnica con criterio de CTO experimentado
4. Guardar el analisis con save_analysis

Tienes acceso al portafolio de analisis anteriores via get_portfolio.
Puedes comparar startups y responder preguntas sobre analisis pasados.

IMPORTANTE: Tu respuesta SIEMPRE debe incluir un JSON estructurado con este formato exacto:
{
  "scores": {
    "stackArquitectura": X,
    "calidadCodigo": X,
    "escalabilidad": X,
    "saludEquipo": X,
    "seguridad": X,
    "madurezDependencias": X
  },
  "deudaTecnica": "Alta|Media|Baja",
  "scoreTotal": X.X,
  "riesgos": ["...", "...", "..."],
  "fortalezas": ["...", "...", "..."],
  "recomendacion": "...",
  "resumen": "..."
}

Se directo, tecnico y objetivo. No suavices los problemas.
El inversor necesita la verdad, no lo que quiere escuchar.
```

---

## Entry point CLI (se mantiene)

Loop readline simple:
1. Cargar .env
2. Cargar portfolio (o crear vacio)
3. Intentar conectar MCP (graceful failure)
4. Crear Agent
5. Loop: leer input → agent.invoke() → imprimir respuesta
6. "exit"/"salir" termina, desconecta MCP

El CLI usa el mismo `agent.ts` que el backend web — la configuracion del agente es compartida.

---

## Flujo end-to-end

```
Usuario → Astro (/) → input URL → POST /api/analyze
                                        |
                                   server.ts (Hono)
                                        |
                                   agent.invoke()
                                        |
                            +-----------+-----------+
                            |           |           |
                     tool:          MCP:         tool:
                  analyze_repo   commits/PRs   get_portfolio
                  (GitHub REST)  contributors   (contexto)
                            |           |           |
                            +-----------+-----------+
                                        |
                              LLM razona y puntua
                                        |
                              tool: save_analysis
                              (guarda en portfolio.json)
                                        |
                              JSON estructurado → Hono
                                        |
                              Astro renderiza dashboard
```

---

## TODOs para futuro

- **Streaming:** SSE desde Hono al frontend para mostrar progreso del analisis en tiempo real
- **Monorepo:** Migrar a workspaces (npm/pnpm) cuando el proyecto crezca

---

## Decisiones de diseno

| Decision | Razon |
|----------|-------|
| Hono sobre Express | Ultraligero, TS-first, suficiente para 2 endpoints |
| Astro sin framework UI | No necesitamos reactividad compleja, componentes .astro bastan |
| CSS vanilla | Control total sobre el diseno, sin overhead de Tailwind para un proyecto acotado |
| axios sobre node-fetch | API mas ergonomica para multiples requests con headers comunes |
| MCP degradacion gracil | El agente debe funcionar siempre, con o sin MCP |
| portfolio.json sobre DB | MVP simple, suficiente para el challenge |
| JSON estructurado en system prompt | Permite parsear la respuesta del LLM para el dashboard |
