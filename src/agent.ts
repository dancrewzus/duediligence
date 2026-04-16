import { Agent, McpClient } from '@strands-agents/sdk'
import { OpenAIModel } from '@strands-agents/sdk/models/openai'
import { analyzeRepoStructure } from './tools/github-analyzer.js'
import { saveAnalysis, getPortfolio, loadPortfolio } from './session/portfolio.js'
import { createGitHubMcp } from './mcp/github-mcp.js'

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

  // Ollama expone una API compatible con OpenAI en /v1 — usamos OpenAIModel apuntado al host local.
  // apiKey es dummy: Ollama no valida pero el cliente OpenAI requiere un string no vacio.
  const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434'
  const model = new OpenAIModel({
    api: 'chat',
    modelId: process.env.OLLAMA_MODEL || 'llama3.1',
    apiKey: 'ollama',
    clientConfig: {
      baseURL: `${ollamaHost}/v1`,
    },
  })

  const mcpClient = await createGitHubMcp()

  const tools: (typeof analyzeRepoStructure | typeof saveAnalysis | typeof getPortfolio | McpClient)[] = [
    analyzeRepoStructure,
    saveAnalysis,
    getPortfolio,
  ]
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
