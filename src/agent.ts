import { Agent, FileStorage, McpClient, SessionManager } from '@strands-agents/sdk'
import { OpenAIModel } from '@strands-agents/sdk/models/openai'
import { resolve } from 'node:path'
import { analyzeRepoStructure } from './tools/github-analyzer.js'
import { saveAnalysis, getPortfolio, loadPortfolio } from './session/portfolio.js'
import { createGitHubMcp } from './mcp/github-mcp.js'

export const SESSIONS_DIR = resolve(process.cwd(), 'sesiones')

// SDK only accepts [a-z0-9_-]+ as sessionId; normalize owner/repo accordingly.
export function repoSessionId(owner: string, repo: string): string {
  return `${owner}__${repo}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
}

const SYSTEM_PROMPT = `Eres un CTO senior con 15 años de experiencia evaluando startups para fondos de inversión.
Tu trabajo es realizar due diligence técnico de repositorios de GitHub y emitir un reporte de inversión estructurado.

FLUJO DE TRABAJO (no te saltes pasos):
1. Llama a analyze_repo_structure con { owner, repo } del repositorio solicitado.
2. Llama a las tools del MCP de GitHub (list_commits, list_pull_requests, list_contributors, list_issues) para medir actividad del equipo.
3. Con los datos obtenidos, redacta el reporte final.

FORMATO DE RESPUESTA FINAL (regla absoluta):
Tu última respuesta —después de todas las tool calls— DEBE ser ÚNICAMENTE un bloque de código con la etiqueta \`\`\`json ... \`\`\`, sin texto antes y sin texto después. Nada de prosa, nada de explicaciones, nada de resúmenes fuera del JSON. Solo el bloque JSON.

SCHEMA EXACTO del JSON (todos los campos son obligatorios, nombres exactos, tipos exactos):
- descripcion: string OBLIGATORIO, NUNCA null, NUNCA omitir. 1-3 oraciones (máximo 500 caracteres) explicando QUÉ ES el proyecto desde el punto de vista funcional — qué hace, para quién, en qué categoría encaja. Esta descripción es lo PRIMERO que lee el inversor; debe poder entender el proyecto sin mirar nada más. Fuentes, en orden de preferencia: (1) metadata.description de analyze_repo_structure si existe y es informativa, (2) README.md, (3) package.json description, (4) infiere desde dependencias y estructura. No copies slogans de marketing vacíos; sé concreto.
- scores: objeto con 6 claves (stackArquitectura, calidadCodigo, escalabilidad, saludEquipo, seguridad, madurezDependencias). Cada una es { score: number entre 0 y 10, justificacion: string corto }.
- tecnologias: objeto con 6 claves (frontend, backend, database, infraestructura, testing, cicd). Cada una es un string[] con los nombres + versiones detectados.
- metricas: objeto con 10 claves numéricas y de texto exactamente como en el ejemplo.
- deudaTecnica: uno de exactamente tres valores literales: "Alta", "Media", o "Baja". Nada de pipes ni variantes.
- deudaJustificacion: string.
- scoreTotal: number con un decimal (promedio ponderado de los 6 scores).
- riesgos: string[] con exactamente 3 elementos.
- fortalezas: string[] con exactamente 3 elementos.
- recomendacion: string (2-3 oraciones dirigidas al inversor).
- resumen: string de 2-3 oraciones con la síntesis ejecutiva para inversor (qué tipo de proyecto es, señales clave, veredicto corto). No repitas los scores dimensión por dimensión.

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
    "calidadCodigo": { "score": 6, "justificacion": "ESLint y Prettier configurados, tsconfig estricto. No hay suite de tests (sin jest/vitest/mocha en devDependencies)." },
    "escalabilidad": { "score": 5, "justificacion": "Sin Dockerfile ni docker-compose. No se detectó infraestructura cloud. Arquitectura monolítica de un solo servidor." },
    "saludEquipo": { "score": 4, "justificacion": "Solo 1 contributor activo en los últimos 30 días; último commit hace 3 semanas. PRs mergeados el último mes: 2." },
    "seguridad": { "score": 5, "justificacion": "No hay Dependabot ni SAST configurado. Dependencias con 6 meses de antigüedad promedio." },
    "madurezDependencias": { "score": 6, "justificacion": "21 dependencias runtime, versiones recientes (React 18.3, Hono 4.x). No se detectan libs deprecadas." }
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
  "scoreTotal": 5.5,
  "riesgos": [
    "Bus factor de 1: un solo contributor activo pone en riesgo continuidad del proyecto.",
    "Sin tests automáticos: cada cambio puede romper funcionalidad existente sin aviso.",
    "Sin CI/CD ni infraestructura declarativa: deployment manual propenso a errores."
  ],
  "fortalezas": [
    "Stack moderno con TypeScript estricto y linting configurado.",
    "Arquitectura clara con separación frontend/backend.",
    "Dependencias actualizadas (<6 meses promedio)."
  ],
  "recomendacion": "Watch. Stack técnico sólido pero bus factor y ausencia de tests son riesgos serios para inversión. Antes de comprometer capital exigir: contratar al menos 1 ingeniero adicional y cobertura de tests >60% en 90 días.",
  "resumen": "Framework web orientado a sitios content-driven, con stack moderno (TypeScript estricto, linting). Liderado por 1 solo contributor activo y sin tests automáticos, lo que compromete continuidad y velocidad de iteración. Apto para watch, no para invertir aún hasta resolver bus factor y cobertura."
}
\`\`\`

RECORDATORIO FINAL: tu última respuesta al usuario debe ser SOLO un bloque \`\`\`json { ... } \`\`\` siguiendo el schema de arriba. Sin prosa antes ni después. Si no seguís este formato exacto, el sistema no puede procesar la respuesta.

CHECKLIST antes de emitir el JSON final:
- ¿"descripcion" está presente, es un string no vacío, y explica qué ES el proyecto en ≤500 caracteres? (obligatorio)
- ¿Los 6 scores están todos entre 0 y 10?
- ¿"deudaTecnica" es exactamente "Alta", "Media" o "Baja"?
- ¿"riesgos" y "fortalezas" tienen exactamente 3 elementos cada uno?
Si alguna respuesta es no, corregí antes de emitir.`

const CHAT_SYSTEM_PROMPT = `Eres un CTO senior con 15 años de experiencia evaluando startups.

CONTEXTO: En turnos anteriores de esta conversación aparece un bloque \`\`\`json con el reporte de due diligence completo. Ese reporte YA FUE ENTREGADO — no lo repitas, no lo reescribas, no emitas otro JSON. El inversor ya lo tiene.

AHORA ESTÁS EN MODO CONVERSACIÓN. Reglas absolutas:
- PROHIBIDO emitir bloques \`\`\`json, \`\`\`, o cualquier formato estructurado tipo schema. Si tu respuesta empieza con \`{\` o \`\`\`\`, está mal.
- Respondé SIEMPRE en prosa natural en español, en 2 a 5 oraciones. Podés usar listas markdown con guiones si aclaran.
- El reporte ya está en tu memoria — usalo como fuente, pero respondé a la pregunta específica del usuario, no resumas todo el reporte.
- No llames tools salvo que la pregunta exija datos nuevos que no tengas.
- Tono directo, técnico, objetivo. No suavices problemas.

Si tu primer impulso es escribir \`\`\`json, detenete: estás en modo conversación.`

function buildPortfolioContext(): string {
  const portfolio = loadPortfolio()
  return portfolio.length > 0
    ? `\n\nPortafolio actual (${portfolio.length} análisis previos):\n${JSON.stringify(portfolio, null, 2)}`
    : '\n\nPortafolio vacío — no hay análisis previos.'
}

export function chatSystemPrompt(): string {
  return CHAT_SYSTEM_PROMPT + buildPortfolioContext()
}

export interface AgentContext {
  agent: Agent
  mcpClient: McpClient | null
}

export function createMcp(): Promise<McpClient | null> {
  return createGitHubMcp()
}

export function buildAgent(mcpClient: McpClient | null, sessionId?: string): Agent {
  const portfolioContext = buildPortfolioContext()

  // Ollama expone una API compatible con OpenAI en /v1 — usamos OpenAIModel apuntado al host local.
  // apiKey es dummy: Ollama no valida pero el cliente OpenAI requiere un string no vacio.
  const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434'
  const model = new OpenAIModel({
    api: 'chat',
    modelId: process.env.OLLAMA_MODEL || 'llama3.1',
    apiKey: 'ollama',
    temperature: 0.1,
    topP: 0.9,
    clientConfig: {
      baseURL: `${ollamaHost}/v1`,
    },
  })

  const tools: (typeof analyzeRepoStructure | typeof saveAnalysis | typeof getPortfolio | McpClient)[] = [
    analyzeRepoStructure,
    saveAnalysis,
    getPortfolio,
  ]
  if (mcpClient) {
    tools.push(mcpClient)
  }

  const sessionManager = sessionId
    ? new SessionManager({ sessionId, storage: { snapshot: new FileStorage(SESSIONS_DIR) } })
    : undefined

  return new Agent({
    model,
    systemPrompt: SYSTEM_PROMPT + portfolioContext,
    tools,
    sessionManager,
  })
}

export async function createAgent(): Promise<AgentContext> {
  const mcpClient = await createMcp()
  const agent = buildAgent(mcpClient)
  return { agent, mcpClient }
}
