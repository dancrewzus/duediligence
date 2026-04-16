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
