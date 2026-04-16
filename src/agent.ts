import { Agent, McpClient } from '@strands-agents/sdk'
import { OpenAIModel } from '@strands-agents/sdk/models/openai'
import { analyzeRepoStructure } from './tools/github-analyzer.js'
import { saveAnalysis, getPortfolio, loadPortfolio } from './session/portfolio.js'
import { createGitHubMcp } from './mcp/github-mcp.js'

const SYSTEM_PROMPT = `Eres un CTO senior con 15 años de experiencia evaluando startups para fondos de inversión.
Tu trabajo es realizar due diligence técnico de repositorios de GitHub y generar un reporte de inversión técnica objetivo y accionable.

Cuando el usuario te dé un repositorio de GitHub, debes:
1. Usar analyze_repo_structure para obtener la estructura del proyecto
2. Usar las herramientas del MCP de GitHub para analizar actividad del equipo (commits, PRs, issues, contributors)
3. Evaluar cada dimensión técnica con criterio de CTO experimentado

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
