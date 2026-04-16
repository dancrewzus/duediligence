# Due Diligence Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an AI agent that performs technical due diligence on GitHub repos and displays results in a modern web dashboard.

**Architecture:** Strands Agents SDK powers the AI agent with 3 tool sources (custom GitHub analyzer, MCP GitHub server, portfolio management). Hono serves an HTTP API consumed by an Astro frontend. The CLI entry point shares the same agent configuration.

**Tech Stack:** TypeScript ESM, @strands-agents/sdk, zod, axios, Hono, Astro, @modelcontextprotocol/server-github

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Root dependencies, scripts for CLI + web |
| `tsconfig.json` | Strict TypeScript ESM config |
| `.env.example` | Template for required env vars |
| `.gitignore` | Node, env, portfolio exclusions |
| `src/types/index.ts` | All shared interfaces: RepoStructure, AnalysisReport, PortfolioEntry |
| `src/session/portfolio.ts` | Read/write portfolio.json + tool definitions (save_analysis, get_portfolio) |
| `src/tools/github-analyzer.ts` | tool(): analyze_repo_structure — GitHub REST API calls |
| `src/mcp/github-mcp.ts` | McpClient factory with graceful failure |
| `src/agent.ts` | createAgent() — assembles Agent with system prompt, tools, MCP |
| `src/index.ts` | CLI entry point — readline loop |
| `src/server.ts` | Hono HTTP server — POST /api/analyze, GET /api/portfolio |
| `web/package.json` | Astro dependencies |
| `web/astro.config.mjs` | Astro config |
| `web/src/layouts/Layout.astro` | Base HTML layout with dark theme |
| `web/src/styles/global.css` | Design tokens, typography, component styles |
| `web/src/components/ScoreBar.astro` | Progress bar X/10 with color coding |
| `web/src/components/RiskStrengthCard.astro` | Card for risks or strengths list |
| `web/src/components/ReportCard.astro` | Full report dashboard composing sub-components |
| `web/src/components/AnalysisForm.astro` | URL input + submit + loading + result display |
| `web/src/components/PortfolioTable.astro` | Table of past analyses |
| `web/src/pages/index.astro` | Main page — analysis form + report |
| `web/src/pages/portfolio.astro` | Portfolio history page |

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "duediligence",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "tsx src/index.ts",
    "dev:server": "tsx watch src/server.ts",
    "dev:web": "cd web && npm run dev",
    "build": "tsc",
    "start:server": "node dist/server.js"
  },
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

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "web"]
}
```

- [ ] **Step 3: Create .env.example**

```
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_pat
PORT=3001
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
.env
portfolio.json
web/node_modules/
web/dist/
web/.astro/
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated, no errors.

- [ ] **Step 6: Verify TypeScript compiles**

Create a minimal `src/index.ts`:
```typescript
console.log('duediligence agent starting...')
```

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json .env.example .gitignore src/index.ts
git commit -m "chore: scaffold project with dependencies and TypeScript config"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Define all interfaces**

```typescript
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

export interface AnalysisScores {
  stackArquitectura: number
  calidadCodigo: number
  escalabilidad: number
  saludEquipo: number
  seguridad: number
  madurezDependencias: number
}

export interface AnalysisReport {
  repo: string
  fecha: string
  scores: AnalysisScores
  deudaTecnica: 'Alta' | 'Media' | 'Baja'
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

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add shared TypeScript interfaces"
```

---

### Task 3: Portfolio Management Tools

**Files:**
- Create: `src/session/portfolio.ts`

- [ ] **Step 1: Implement portfolio read/write and tool definitions**

```typescript
import { tool } from '@strands-agents/sdk'
import { z } from 'zod'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PortfolioEntry } from '../types/index.js'

const PORTFOLIO_PATH = resolve(process.cwd(), 'portfolio.json')

export function loadPortfolio(): PortfolioEntry[] {
  if (!existsSync(PORTFOLIO_PATH)) {
    writeFileSync(PORTFOLIO_PATH, '[]', 'utf-8')
    return []
  }
  const raw = readFileSync(PORTFOLIO_PATH, 'utf-8')
  return JSON.parse(raw) as PortfolioEntry[]
}

function savePortfolio(entries: PortfolioEntry[]): void {
  writeFileSync(PORTFOLIO_PATH, JSON.stringify(entries, null, 2), 'utf-8')
}

export const saveAnalysis = tool({
  name: 'save_analysis',
  description: 'Save a completed analysis to the portfolio. Call this after generating a due diligence report.',
  inputSchema: z.object({
    repo: z.string().describe('Full repo name owner/repo'),
    score: z.number().describe('Overall investment score 0-10'),
    resumen: z.string().describe('Brief summary of the analysis in Spanish'),
  }),
  callback: (input) => {
    const portfolio = loadPortfolio()
    const entry: PortfolioEntry = {
      repo: input.repo,
      fecha: new Date().toISOString(),
      score: input.score,
      resumen: input.resumen,
    }
    portfolio.push(entry)
    savePortfolio(portfolio)
    return `Analysis saved for ${input.repo} with score ${input.score}/10.`
  },
})

export const getPortfolio = tool({
  name: 'get_portfolio',
  description: 'Get all previously analyzed startups from the portfolio. Use this to compare startups or answer questions about past analyses.',
  inputSchema: z.object({}),
  callback: () => {
    const portfolio = loadPortfolio()
    if (portfolio.length === 0) {
      return 'Portfolio is empty. No startups have been analyzed yet.'
    }
    return JSON.stringify(portfolio, null, 2)
  },
})
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/session/portfolio.ts
git commit -m "feat: add portfolio management tools (save_analysis, get_portfolio)"
```

---

### Task 4: GitHub Analyzer Tool

**Files:**
- Create: `src/tools/github-analyzer.ts`

- [ ] **Step 1: Implement the analyze_repo_structure tool**

```typescript
import { tool } from '@strands-agents/sdk'
import { z } from 'zod'
import axios from 'axios'
import type { RepoStructure, RepoMetadata } from '../types/index.js'

const GITHUB_API = 'https://api.github.com'

function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'duediligence-agent',
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

async function fetchFileContent(owner: string, repo: string, path: string): Promise<string | null> {
  try {
    const res = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
      headers: githubHeaders(),
    })
    if (res.data.encoding === 'base64' && res.data.content) {
      return Buffer.from(res.data.content, 'base64').toString('utf-8')
    }
    return null
  } catch {
    return null
  }
}

async function fetchRepoMetadata(owner: string, repo: string): Promise<RepoMetadata> {
  const res = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: githubHeaders(),
  })
  const d = res.data
  return {
    name: d.name,
    fullName: d.full_name,
    description: d.description,
    language: d.language,
    stars: d.stargazers_count,
    forks: d.forks_count,
    openIssues: d.open_issues_count,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    pushedAt: d.pushed_at,
    defaultBranch: d.default_branch,
    size: d.size,
  }
}

async function fetchRootContents(owner: string, repo: string): Promise<string[]> {
  const res = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/contents`, {
    headers: githubHeaders(),
  })
  return res.data.map((item: { name: string }) => item.name)
}

async function checkCiCdFiles(owner: string, repo: string): Promise<string[]> {
  try {
    const res = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/contents/.github/workflows`, {
      headers: githubHeaders(),
    })
    return res.data.map((item: { name: string }) => item.name)
  } catch {
    return []
  }
}

export const analyzeRepoStructure = tool({
  name: 'analyze_repo_structure',
  description:
    'Analyze a GitHub repository structure. Fetches metadata, dependencies, configuration files, and project structure. Use this as the first step when evaluating a startup repository.',
  inputSchema: z.object({
    owner: z.string().describe('GitHub repository owner (e.g. "facebook")'),
    repo: z.string().describe('GitHub repository name (e.g. "react")'),
  }),
  callback: async (input) => {
    const { owner, repo } = input

    const [metadata, rootFiles, ciCdFiles] = await Promise.all([
      fetchRepoMetadata(owner, repo),
      fetchRootContents(owner, repo),
      checkCiCdFiles(owner, repo),
    ])

    const packageJsonRaw = await fetchFileContent(owner, repo, 'package.json')
    const tsconfigRaw = await fetchFileContent(owner, repo, 'tsconfig.json')
    const readmeRaw = await fetchFileContent(owner, repo, 'README.md')

    const hasEslint = rootFiles.some(
      (f) => f.startsWith('.eslintrc') || f === 'eslint.config.js' || f === 'eslint.config.mjs'
    )
    const hasPrettier = rootFiles.some((f) => f.startsWith('.prettierrc') || f === 'prettier.config.js')
    const hasDockerfile = rootFiles.includes('Dockerfile')
    const hasDockerCompose = rootFiles.some((f) => f.startsWith('docker-compose'))

    const structure: RepoStructure = {
      metadata,
      rootFiles,
      packageJson: packageJsonRaw ? JSON.parse(packageJsonRaw) : null,
      tsconfig: tsconfigRaw ? JSON.parse(tsconfigRaw) : null,
      hasReadme: readmeRaw !== null,
      readmeLength: readmeRaw?.length ?? 0,
      hasEslint,
      hasPrettier,
      hasDockerfile,
      hasDockerCompose,
      hasCiCd: ciCdFiles.length > 0,
      ciCdFiles,
    }

    return JSON.stringify(structure, null, 2)
  },
})
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/github-analyzer.ts
git commit -m "feat: add analyze_repo_structure tool (GitHub REST API)"
```

---

### Task 5: MCP GitHub Client

**Files:**
- Create: `src/mcp/github-mcp.ts`

- [ ] **Step 1: Implement MCP client factory with graceful degradation**

```typescript
import { McpClient } from '@strands-agents/sdk'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

export async function createGitHubMcp(): Promise<McpClient | null> {
  try {
    const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN
    if (!token) {
      console.error('[MCP] GITHUB_PERSONAL_ACCESS_TOKEN not set — skipping MCP GitHub')
      return null
    }

    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: {
        ...process.env as Record<string, string>,
        GITHUB_PERSONAL_ACCESS_TOKEN: token,
      },
    })

    const mcpClient = new McpClient({ transport })
    console.log('[MCP] GitHub MCP server connected successfully')
    return mcpClient
  } catch (error) {
    console.error('[MCP] Failed to connect GitHub MCP server — agent will work without MCP tools')
    console.error('[MCP]', error instanceof Error ? error.message : error)
    return null
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/mcp/github-mcp.ts
git commit -m "feat: add MCP GitHub client with graceful degradation"
```

---

### Task 6: Agent Configuration

**Files:**
- Create: `src/agent.ts`

- [ ] **Step 1: Implement createAgent factory**

```typescript
import { Agent, BedrockModel } from '@strands-agents/sdk'
import type { McpClient } from '@strands-agents/sdk'
import { analyzeRepoStructure } from './tools/github-analyzer.js'
import { saveAnalysis, getPortfolio, loadPortfolio } from './session/portfolio.js'
import { createGitHubMcp } from './mcp/github-mcp.js'

const SYSTEM_PROMPT = `Eres un CTO senior con 15 años de experiencia evaluando startups para fondos de inversión.
Tu trabajo es realizar due diligence técnico de repositorios de GitHub y generar un reporte de inversión técnica objetivo y accionable.

Cuando el usuario te dé un repositorio de GitHub, debes:
1. Usar analyze_repo_structure para obtener la estructura del proyecto
2. Usar las herramientas del MCP de GitHub para analizar actividad del equipo (commits, PRs, issues, contributors)
3. Evaluar cada dimensión técnica con criterio de CTO experimentado
4. Guardar el análisis con save_analysis

Tienes acceso al portafolio de análisis anteriores via get_portfolio.
Puedes comparar startups y responder preguntas sobre análisis pasados.

IMPORTANTE: Cuando completes un análisis, tu respuesta SIEMPRE debe incluir un bloque JSON delimitado por \`\`\`json y \`\`\` con este formato exacto:
\`\`\`json
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
\`\`\`

Sé directo, técnico y objetivo. No suavices los problemas que encuentres.
El inversor necesita la verdad, no lo que quiere escuchar.`

export interface AgentContext {
  agent: Agent
  mcpClient: McpClient | null
}

export async function createAgent(): Promise<AgentContext> {
  const portfolio = loadPortfolio()

  const portfolioContext =
    portfolio.length > 0
      ? `\n\nPortafolio actual (${portfolio.length} análisis previos):\n${JSON.stringify(portfolio, null, 2)}`
      : '\n\nPortafolio vacío — no hay análisis previos.'

  const model = new BedrockModel({
    region: process.env.AWS_REGION || 'us-east-1',
    modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  })

  const mcpClient = await createGitHubMcp()

  const tools: unknown[] = [analyzeRepoStructure, saveAnalysis, getPortfolio]
  if (mcpClient) {
    tools.push(mcpClient)
  }

  const agent = new Agent({
    model,
    systemPrompt: SYSTEM_PROMPT + portfolioContext,
    tools,
  })

  return { agent, mcpClient }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors. There may be type issues with the `tools` array — if so, adjust the type to match what the SDK expects (e.g., `tools: tools as any`). The Strands SDK preview may have loose types here.

- [ ] **Step 3: Commit**

```bash
git add src/agent.ts
git commit -m "feat: add agent configuration with system prompt and tools"
```

---

### Task 7: CLI Entry Point

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Implement the readline conversation loop**

Replace the placeholder `src/index.ts` with:

```typescript
import 'dotenv/config'
import * as readline from 'node:readline'
import { createAgent } from './agent.js'

async function main() {
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║   Due Diligence Técnico — Agente de Inversión   ║')
  console.log('║   Powered by Strands Agents + Claude Sonnet 4   ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log()

  console.log('Inicializando agente...')
  const { agent, mcpClient } = await createAgent()
  console.log('Agente listo. Escribe una URL de GitHub para analizar.')
  console.log('Escribe "exit" o "salir" para terminar.\n')

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const prompt = () => {
    rl.question('> ', async (input) => {
      const trimmed = input.trim()

      if (!trimmed) {
        prompt()
        return
      }

      if (trimmed === 'exit' || trimmed === 'salir') {
        console.log('\nCerrando agente...')
        if (mcpClient) {
          await mcpClient.disconnect()
        }
        rl.close()
        process.exit(0)
      }

      try {
        const result = await agent.invoke(trimmed)
        console.log('\n' + String(result) + '\n')
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error)
      }

      prompt()
    })
  }

  prompt()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add CLI entry point with readline conversation loop"
```

---

### Task 8: Hono HTTP Server

**Files:**
- Create: `src/server.ts`

- [ ] **Step 1: Implement the Hono server with both endpoints**

```typescript
import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createAgent } from './agent.js'
import { loadPortfolio } from './session/portfolio.js'
import type { AnalysisReport } from './types/index.js'

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

function extractReport(text: string): AnalysisReport | null {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/)
  if (!jsonMatch) return null
  try {
    return JSON.parse(jsonMatch[1]) as AnalysisReport
  } catch {
    return null
  }
}

app.post('/api/analyze', async (c) => {
  const body = await c.req.json<{ repoUrl: string }>()

  const parsed = parseRepoUrl(body.repoUrl)
  if (!parsed) {
    return c.json({ error: 'Invalid GitHub URL. Expected format: https://github.com/owner/repo' }, 400)
  }

  try {
    const { agent } = await getAgent()
    const prompt = `Analiza el repositorio ${parsed.owner}/${parsed.repo} (https://github.com/${parsed.owner}/${parsed.repo}) y genera el reporte de due diligence técnico completo.`
    const result = await agent.invoke(prompt)
    const text = String(result)
    const report = extractReport(text)

    if (report) {
      report.repo = `${parsed.owner}/${parsed.repo}`
      report.fecha = new Date().toISOString()
      return c.json(report)
    }

    return c.json({ raw: text, error: 'Could not parse structured report from agent response' }, 500)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Analysis failed' }, 500)
  }
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

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Smoke test the server starts**

Create a `.env` file with your actual credentials (copy from `.env.example`), then run:

Run: `timeout 10 npx tsx src/server.ts || true`
Expected: See "Due Diligence API server starting on port 3001..." in output (it may fail on agent init without valid AWS creds — that's expected).

- [ ] **Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat: add Hono HTTP server with /api/analyze and /api/portfolio"
```

---

### Task 9: Astro Frontend — Scaffolding

**Files:**
- Create: `web/package.json`
- Create: `web/astro.config.mjs`
- Create: `web/tsconfig.json`
- Create: `web/src/layouts/Layout.astro`
- Create: `web/src/styles/global.css`

- [ ] **Step 1: Create web/package.json**

```json
{
  "name": "duediligence-web",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "astro": "^5"
  }
}
```

- [ ] **Step 2: Create web/astro.config.mjs**

```javascript
import { defineConfig } from 'astro/config'

export default defineConfig({
  server: {
    port: 4321,
  },
})
```

- [ ] **Step 3: Create web/tsconfig.json**

```json
{
  "extends": "astro/tsconfigs/strict"
}
```

- [ ] **Step 4: Install web dependencies**

Run: `cd web && npm install && cd ..`
Expected: `web/node_modules/` created, no errors.

- [ ] **Step 5: Create web/src/styles/global.css**

```css
:root {
  /* Background */
  --bg-primary: #0a0a0f;
  --bg-secondary: #12121a;
  --bg-card: #1a1a2e;
  --bg-card-hover: #1f1f35;

  /* Text */
  --text-primary: #f0f0f5;
  --text-secondary: #9ca3af;
  --text-muted: #6b7280;

  /* Accents */
  --accent-blue: #3b82f6;
  --accent-green: #10b981;
  --accent-yellow: #f59e0b;
  --accent-red: #ef4444;

  /* Borders */
  --border-subtle: #2a2a3e;
  --border-active: #3b82f6;

  /* Score colors */
  --score-good: #10b981;
  --score-ok: #f59e0b;
  --score-bad: #ef4444;

  /* Spacing */
  --radius: 12px;
  --radius-sm: 8px;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
  min-height: 100vh;
}

a {
  color: var(--accent-blue);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 24px;
}

/* Nav */
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 0;
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 48px;
}

.nav-brand {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.nav-brand span {
  color: var(--accent-blue);
}

.nav-links {
  display: flex;
  gap: 32px;
}

.nav-links a {
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 500;
  transition: color 0.2s;
}

.nav-links a:hover,
.nav-links a.active {
  color: var(--text-primary);
  text-decoration: none;
}

/* Cards */
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  padding: 24px;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 28px;
  font-size: 0.95rem;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--accent-blue);
  color: white;
}

.btn-primary:hover {
  background: #2563eb;
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Input */
.input {
  width: 100%;
  padding: 14px 18px;
  font-size: 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.2s;
}

.input:focus {
  border-color: var(--border-active);
}

.input::placeholder {
  color: var(--text-muted);
}

/* Badge */
.badge {
  display: inline-block;
  padding: 4px 12px;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.badge-green {
  background: rgba(16, 185, 129, 0.15);
  color: var(--accent-green);
}

.badge-yellow {
  background: rgba(245, 158, 11, 0.15);
  color: var(--accent-yellow);
}

.badge-red {
  background: rgba(239, 68, 68, 0.15);
  color: var(--accent-red);
}

/* Spinner */
.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border-subtle);
  border-top-color: var(--accent-blue);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Loading overlay */
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 60px 0;
  color: var(--text-secondary);
}
```

- [ ] **Step 6: Create web/src/layouts/Layout.astro**

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
    <title>{title} | Due Diligence Tecnico</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div class="container">
      <nav class="nav">
        <div class="nav-brand">Due Diligence <span>Tecnico</span></div>
        <div class="nav-links">
          <a href="/" class={activePage === 'analyze' ? 'active' : ''}>Analizar</a>
          <a href="/portfolio" class={activePage === 'portfolio' ? 'active' : ''}>Portfolio</a>
        </div>
      </nav>
      <slot />
    </div>
  </body>
</html>

<style is:global>
  @import '../styles/global.css';
</style>
```

- [ ] **Step 7: Verify Astro builds**

Run: `cd web && npx astro check 2>/dev/null; cd ..`
Expected: No fatal errors (warnings are OK at this stage since pages don't exist yet).

- [ ] **Step 8: Commit**

```bash
git add web/
git commit -m "feat: scaffold Astro frontend with dark theme layout and styles"
```

---

### Task 10: Frontend — ScoreBar Component

**Files:**
- Create: `web/src/components/ScoreBar.astro`

- [ ] **Step 1: Create the ScoreBar component**

```astro
---
interface Props {
  label: string
  score: number
  max?: number
}

const { label, score, max = 10 } = Astro.props
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
</style>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/ScoreBar.astro
git commit -m "feat: add ScoreBar component with color-coded progress bars"
```

---

### Task 11: Frontend — RiskStrengthCard Component

**Files:**
- Create: `web/src/components/RiskStrengthCard.astro`

- [ ] **Step 1: Create the RiskStrengthCard component**

```astro
---
interface Props {
  title: string
  items: string[]
  variant: 'risk' | 'strength'
}

const { title, items, variant } = Astro.props
const icon = variant === 'risk' ? '⚠️' : '✅'
---

<div class={`rsc card rsc-${variant}`}>
  <h3 class="rsc-title">{icon} {title}</h3>
  <ol class="rsc-list">
    {items.map((item) => (
      <li class="rsc-item">{item}</li>
    ))}
  </ol>
</div>

<style>
  .rsc {
    flex: 1;
    min-width: 280px;
  }

  .rsc-risk {
    border-left: 3px solid var(--accent-red);
  }

  .rsc-strength {
    border-left: 3px solid var(--accent-green);
  }

  .rsc-title {
    font-size: 0.9rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 16px;
    color: var(--text-primary);
  }

  .rsc-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-left: 20px;
  }

  .rsc-item {
    font-size: 0.9rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/RiskStrengthCard.astro
git commit -m "feat: add RiskStrengthCard component for risks and strengths"
```

---

### Task 12: Frontend — ReportCard Component

**Files:**
- Create: `web/src/components/ReportCard.astro`

- [ ] **Step 1: Create the full report dashboard component**

```astro
---
import ScoreBar from './ScoreBar.astro'
import RiskStrengthCard from './RiskStrengthCard.astro'

interface Props {
  report: {
    repo: string
    fecha: string
    scores: {
      stackArquitectura: number
      calidadCodigo: number
      escalabilidad: number
      saludEquipo: number
      seguridad: number
      madurezDependencias: number
    }
    deudaTecnica: string
    scoreTotal: number
    riesgos: string[]
    fortalezas: string[]
    recomendacion: string
  }
}

const { report } = Astro.props
const scoreTotalColor = report.scoreTotal > 7 ? 'good' : report.scoreTotal >= 4 ? 'ok' : 'bad'
const deudaClass = report.deudaTecnica === 'Baja' ? 'green' : report.deudaTecnica === 'Media' ? 'yellow' : 'red'
const fecha = new Date(report.fecha).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })
---

<div class="report">
  <!-- Header -->
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

  <!-- Score Bars -->
  <div class="report-scores card">
    <h3 class="section-title">Dimensiones Tecnicas</h3>
    <div class="scores-grid">
      <ScoreBar label="Stack & Arquitectura" score={report.scores.stackArquitectura} />
      <ScoreBar label="Calidad de Codigo" score={report.scores.calidadCodigo} />
      <ScoreBar label="Escalabilidad" score={report.scores.escalabilidad} />
      <ScoreBar label="Salud del Equipo" score={report.scores.saludEquipo} />
      <ScoreBar label="Seguridad" score={report.scores.seguridad} />
      <ScoreBar label="Madurez de Dependencias" score={report.scores.madurezDependencias} />
    </div>
    <div class="deuda-row">
      <span class="deuda-label">Deuda Tecnica</span>
      <span class={`badge badge-${deudaClass}`}>{report.deudaTecnica}</span>
    </div>
  </div>

  <!-- Risks & Strengths -->
  <div class="report-details">
    <RiskStrengthCard title="Top 3 Riesgos" items={report.riesgos} variant="risk" />
    <RiskStrengthCard title="Top 3 Fortalezas" items={report.fortalezas} variant="strength" />
  </div>

  <!-- Recommendation -->
  <div class="report-recommendation card">
    <h3 class="section-title">💡 Recomendacion al Inversor</h3>
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

  /* Header */
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

  /* Scores grid */
  .scores-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 24px;
  }

  .deuda-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 16px;
    border-top: 1px solid var(--border-subtle);
  }

  .deuda-label {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  /* Details */
  .report-details {
    display: flex;
    gap: 20px;
  }

  /* Recommendation */
  .recommendation-text {
    font-size: 0.95rem;
    color: var(--text-secondary);
    line-height: 1.7;
  }

  @media (max-width: 768px) {
    .scores-grid {
      grid-template-columns: 1fr;
    }
    .report-details {
      flex-direction: column;
    }
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/ReportCard.astro
git commit -m "feat: add ReportCard dashboard component"
```

---

### Task 13: Frontend — AnalysisForm Component

**Files:**
- Create: `web/src/components/AnalysisForm.astro`

- [ ] **Step 1: Create the analysis form with client-side JS for fetch**

```astro
---
// No server-side props needed — this is a client-interactive component
---

<div id="analysis-section">
  <div class="hero">
    <h1 class="hero-title">Due Diligence <span>Tecnico</span></h1>
    <p class="hero-subtitle">Evalua la salud tecnica de cualquier startup en GitHub</p>
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

  <div id="loading" class="loading" style="display: none;">
    <div class="spinner"></div>
    <p>Analizando repositorio... esto puede tomar unos minutos</p>
  </div>

  <div id="error" class="error-message card" style="display: none;">
    <p id="error-text"></p>
  </div>

  <div id="report-container"></div>
</div>

<style>
  .hero {
    text-align: center;
    margin-bottom: 40px;
  }

  .hero-title {
    font-size: 2.5rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    margin-bottom: 8px;
  }

  .hero-title span {
    color: var(--accent-blue);
  }

  .hero-subtitle {
    color: var(--text-secondary);
    font-size: 1.1rem;
  }

  .analysis-form {
    margin-bottom: 32px;
  }

  .form-row {
    display: flex;
    gap: 12px;
  }

  .form-row .input {
    flex: 1;
  }

  .error-message {
    border-left: 3px solid var(--accent-red);
    color: var(--accent-red);
    margin-bottom: 24px;
  }
</style>

<script>
  const API_BASE = 'http://localhost:3001'

  const form = document.getElementById('analysis-form') as HTMLFormElement
  const input = document.getElementById('repo-url') as HTMLInputElement
  const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement
  const loading = document.getElementById('loading') as HTMLDivElement
  const errorDiv = document.getElementById('error') as HTMLDivElement
  const errorText = document.getElementById('error-text') as HTMLParagraphElement
  const reportContainer = document.getElementById('report-container') as HTMLDivElement

  function getScoreColor(score: number): string {
    if (score > 7) return 'var(--score-good)'
    if (score >= 4) return 'var(--score-ok)'
    return 'var(--score-bad)'
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

  function renderScoreBar(label: string, score: number): string {
    const pct = (score / 10) * 100
    const cls = getScoreClass(score)
    return `
      <div class="score-bar">
        <div class="score-bar-header">
          <span class="score-bar-label">${label}</span>
          <span class="score-bar-value score-${cls}">${score}/10</span>
        </div>
        <div class="score-bar-track">
          <div class="score-bar-fill score-fill-${cls}" style="width: ${pct}%"></div>
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
            <h2 class="report-repo">${r.repo}</h2>
            <p class="report-date">${fecha}</p>
          </div>
          <div class="report-score-total score-total-${totalCls}">
            <span class="score-number">${r.scoreTotal.toFixed(1)}</span>
            <span class="score-label">/ 10</span>
          </div>
        </div>

        <div class="report-scores card">
          <h3 class="section-title">Dimensiones Tecnicas</h3>
          <div class="scores-grid">
            ${renderScoreBar('Stack & Arquitectura', r.scores.stackArquitectura)}
            ${renderScoreBar('Calidad de Codigo', r.scores.calidadCodigo)}
            ${renderScoreBar('Escalabilidad', r.scores.escalabilidad)}
            ${renderScoreBar('Salud del Equipo', r.scores.saludEquipo)}
            ${renderScoreBar('Seguridad', r.scores.seguridad)}
            ${renderScoreBar('Madurez de Dependencias', r.scores.madurezDependencias)}
          </div>
          <div class="deuda-row">
            <span class="deuda-label">Deuda Tecnica</span>
            <span class="badge ${getBadgeClass(r.deudaTecnica)}">${r.deudaTecnica}</span>
          </div>
        </div>

        <div class="report-details">
          <div class="card rsc rsc-risk">
            <h3 class="rsc-title">⚠️ Top 3 Riesgos</h3>
            <ol class="rsc-list">${r.riesgos.map((i: string) => `<li class="rsc-item">${i}</li>`).join('')}</ol>
          </div>
          <div class="card rsc rsc-strength">
            <h3 class="rsc-title">✅ Top 3 Fortalezas</h3>
            <ol class="rsc-list">${r.fortalezas.map((i: string) => `<li class="rsc-item">${i}</li>`).join('')}</ol>
          </div>
        </div>

        <div class="report-recommendation card">
          <h3 class="section-title">💡 Recomendacion al Inversor</h3>
          <p class="recommendation-text">${r.recomendacion}</p>
        </div>
      </div>
    `
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const url = input.value.trim()
    if (!url) return

    submitBtn.disabled = true
    loading.style.display = 'flex'
    errorDiv.style.display = 'none'
    reportContainer.innerHTML = ''

    try {
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: url }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Analysis failed')
      }

      if (data.scores) {
        reportContainer.innerHTML = renderReport(data)
      } else {
        throw new Error(data.error || 'Could not parse report')
      }
    } catch (err: any) {
      errorText.textContent = err.message || 'Error al analizar el repositorio'
      errorDiv.style.display = 'block'
    } finally {
      submitBtn.disabled = false
      loading.style.display = 'none'
    }
  })
</script>
```

Note: The `AnalysisForm` duplicates the report rendering as client-side JS (innerHTML) because the report is fetched dynamically after page load. The `ReportCard.astro` server component is used on the portfolio detail page where data is available at build/request time.

- [ ] **Step 2: Commit**

```bash
git add web/src/components/AnalysisForm.astro
git commit -m "feat: add AnalysisForm with client-side report rendering"
```

---

### Task 14: Frontend — PortfolioTable Component

**Files:**
- Create: `web/src/components/PortfolioTable.astro`

- [ ] **Step 1: Create the portfolio table component**

```astro
---
// Client-side fetched — no props needed
---

<div id="portfolio-section">
  <div class="portfolio-header">
    <h1 class="portfolio-title">Portfolio de Analisis</h1>
    <p class="portfolio-subtitle">Historial de startups evaluadas</p>
  </div>

  <div id="portfolio-loading" class="loading">
    <div class="spinner"></div>
    <p>Cargando portfolio...</p>
  </div>

  <div id="portfolio-empty" class="empty-state card" style="display: none;">
    <p>No hay analisis previos. <a href="/">Analiza tu primera startup</a></p>
  </div>

  <div id="portfolio-table-wrapper" style="display: none;">
    <div class="table-controls">
      <button id="sort-score" class="btn-sort active">Ordenar por Score</button>
      <button id="sort-date" class="btn-sort">Ordenar por Fecha</button>
    </div>
    <div id="portfolio-list" class="portfolio-list"></div>
  </div>
</div>

<style>
  .portfolio-header {
    margin-bottom: 32px;
  }

  .portfolio-title {
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin-bottom: 4px;
  }

  .portfolio-subtitle {
    color: var(--text-secondary);
  }

  .empty-state {
    text-align: center;
    padding: 48px;
    color: var(--text-secondary);
  }

  .table-controls {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  .btn-sort {
    padding: 8px 16px;
    font-size: 0.8rem;
    font-weight: 600;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-sort:hover,
  .btn-sort.active {
    color: var(--text-primary);
    border-color: var(--accent-blue);
  }

  .portfolio-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .portfolio-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius);
    transition: all 0.2s;
    cursor: default;
  }

  .portfolio-row:hover {
    background: var(--bg-card-hover);
    border-color: var(--border-active);
  }

  .portfolio-row-info {
    flex: 1;
  }

  .portfolio-row-repo {
    font-weight: 700;
    font-size: 1rem;
    margin-bottom: 4px;
  }

  .portfolio-row-meta {
    display: flex;
    gap: 16px;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .portfolio-row-summary {
    flex: 2;
    font-size: 0.85rem;
    color: var(--text-secondary);
    padding: 0 24px;
    line-height: 1.5;
  }

  .portfolio-row-score {
    font-size: 1.5rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    min-width: 60px;
    text-align: right;
  }
</style>

<script>
  const API_BASE = 'http://localhost:3001'

  const loadingEl = document.getElementById('portfolio-loading') as HTMLDivElement
  const emptyEl = document.getElementById('portfolio-empty') as HTMLDivElement
  const tableWrapper = document.getElementById('portfolio-table-wrapper') as HTMLDivElement
  const listEl = document.getElementById('portfolio-list') as HTMLDivElement
  const sortScoreBtn = document.getElementById('sort-score') as HTMLButtonElement
  const sortDateBtn = document.getElementById('sort-date') as HTMLButtonElement

  interface PortfolioItem {
    repo: string
    fecha: string
    score: number
    resumen: string
  }

  let portfolio: PortfolioItem[] = []
  let sortBy: 'score' | 'date' = 'score'

  function getScoreColor(score: number): string {
    if (score > 7) return 'var(--score-good)'
    if (score >= 4) return 'var(--score-ok)'
    return 'var(--score-bad)'
  }

  function renderList() {
    const sorted = [...portfolio].sort((a, b) => {
      if (sortBy === 'score') return b.score - a.score
      return new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    })

    listEl.innerHTML = sorted
      .map((item) => {
        const fecha = new Date(item.fecha).toLocaleDateString('es-CL', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
        return `
          <div class="portfolio-row">
            <div class="portfolio-row-info">
              <div class="portfolio-row-repo">${item.repo}</div>
              <div class="portfolio-row-meta">
                <span>${fecha}</span>
              </div>
            </div>
            <div class="portfolio-row-summary">${item.resumen}</div>
            <div class="portfolio-row-score" style="color: ${getScoreColor(item.score)}">
              ${item.score.toFixed(1)}
            </div>
          </div>
        `
      })
      .join('')
  }

  sortScoreBtn.addEventListener('click', () => {
    sortBy = 'score'
    sortScoreBtn.classList.add('active')
    sortDateBtn.classList.remove('active')
    renderList()
  })

  sortDateBtn.addEventListener('click', () => {
    sortBy = 'date'
    sortDateBtn.classList.add('active')
    sortScoreBtn.classList.remove('active')
    renderList()
  })

  async function loadPortfolio() {
    try {
      const res = await fetch(`${API_BASE}/api/portfolio`)
      portfolio = await res.json()

      loadingEl.style.display = 'none'

      if (portfolio.length === 0) {
        emptyEl.style.display = 'block'
      } else {
        tableWrapper.style.display = 'block'
        renderList()
      }
    } catch {
      loadingEl.style.display = 'none'
      emptyEl.style.display = 'block'
      emptyEl.querySelector('p')!.textContent = 'Error al cargar el portfolio. Verifica que el servidor este corriendo.'
    }
  }

  loadPortfolio()
</script>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/PortfolioTable.astro
git commit -m "feat: add PortfolioTable with sorting and score badges"
```

---

### Task 15: Frontend — Pages

**Files:**
- Create: `web/src/pages/index.astro`
- Create: `web/src/pages/portfolio.astro`

- [ ] **Step 1: Create the main analysis page**

```astro
---
import Layout from '../layouts/Layout.astro'
import AnalysisForm from '../components/AnalysisForm.astro'
---

<Layout title="Analizar" activePage="analyze">
  <AnalysisForm />
</Layout>
```

- [ ] **Step 2: Create the portfolio page**

```astro
---
import Layout from '../layouts/Layout.astro'
import PortfolioTable from '../components/PortfolioTable.astro'
---

<Layout title="Portfolio" activePage="portfolio">
  <PortfolioTable />
</Layout>
```

- [ ] **Step 3: Verify Astro dev server starts**

Run: `cd web && npx astro dev --host 2>&1 | head -20`
Expected: See "Local http://localhost:4321/" in output.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/
git commit -m "feat: add analysis and portfolio pages"
```

---

### Task 16: Update Root Scripts and Final Wiring

**Files:**
- Modify: `package.json` (root)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add CLAUDE.md and README.md to git**

```bash
git add CLAUDE.md README.md
git commit -m "docs: add project documentation"
```

- [ ] **Step 2: Verify full backend compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Verify Astro frontend builds**

Run: `cd web && npx astro build && cd ..`
Expected: Build completes with output in `web/dist/`.

- [ ] **Step 4: Commit any final adjustments**

```bash
git add -A
git commit -m "chore: final wiring and build verification"
```

---

### Task 17: End-to-End Smoke Test

This task requires valid AWS and GitHub credentials in `.env`.

- [ ] **Step 1: Start the backend server**

Run: `npx tsx src/server.ts &`
Expected: "Agent initialized. API ready at http://localhost:3001"

- [ ] **Step 2: Test the portfolio endpoint**

Run: `curl http://localhost:3001/api/portfolio`
Expected: `[]` (empty array)

- [ ] **Step 3: Start the Astro frontend**

Run: `cd web && npx astro dev &`
Expected: "Local http://localhost:4321/"

- [ ] **Step 4: Open the browser and test**

1. Open http://localhost:4321/
2. Verify the dark theme loads, input field and "Analizar" button are visible
3. Enter a small public repo URL (e.g., `https://github.com/sindresorhus/is`)
4. Click "Analizar" — should see loading spinner
5. Wait for the analysis to complete — should see the full dashboard report
6. Navigate to http://localhost:4321/portfolio — should see the analysis in the table

- [ ] **Step 5: Test CLI entry point**

Run: `npx tsx src/index.ts`
Expected: Banner appears, agent initializes. Type a repo URL and get a text analysis. Type "salir" to exit.

- [ ] **Step 6: Kill background processes and commit**

```bash
kill %1 %2 2>/dev/null
git add -A
git commit -m "chore: verified end-to-end smoke test passes"
```
