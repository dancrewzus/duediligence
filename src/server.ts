import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { streamSSE } from 'hono/streaming'
import { createAgent } from './agent.js'
import { loadPortfolio, persistReport } from './session/portfolio.js'
import { mapToolToStage, STAGE_LABELS, extractReport, type Stage } from './server/stream-events.js'

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

app.get('/api/analyze/stream', async (c) => {
  const repoUrl = c.req.query('repoUrl')
  if (!repoUrl) {
    return c.json({ error: 'Missing repoUrl query param' }, 400)
  }
  const parsed = parseRepoUrl(repoUrl)
  if (!parsed) {
    return c.json({ error: 'Invalid GitHub URL. Expected https://github.com/owner/repo' }, 400)
  }

  return streamSSE(c, async (stream) => {
    const emitStage = (stage: Stage) =>
      stream.writeSSE({ event: 'stage', data: JSON.stringify({ stage, label: STAGE_LABELS[stage] }) })

    try {
      const { agent } = await getAgent()
      await emitStage('starting')

      const prompt = `Analiza el repositorio ${parsed.owner}/${parsed.repo} (https://github.com/${parsed.owner}/${parsed.repo}) y genera el reporte de due diligence técnico completo.`

      let buffer = ''
      let currentStage: Stage = 'starting'

      for await (const evt of agent.stream(prompt)) {
        switch (evt.type) {
          case 'beforeToolCallEvent': {
            const toolName = evt.toolUse.name
            const nextStage = mapToolToStage(toolName)
            if (nextStage !== currentStage) {
              currentStage = nextStage
              await emitStage(nextStage)
            }
            await stream.writeSSE({
              event: 'tool',
              data: JSON.stringify({ tool: toolName, status: 'start' }),
            })
            break
          }
          case 'afterToolCallEvent': {
            await stream.writeSSE({
              event: 'tool',
              data: JSON.stringify({ tool: evt.toolUse.name, status: 'complete' }),
            })
            break
          }
          case 'modelStreamUpdateEvent': {
            const inner = evt.event
            if (
              inner.type === 'modelContentBlockDeltaEvent' &&
              inner.delta?.type === 'textDelta' &&
              typeof inner.delta.text === 'string'
            ) {
              buffer += inner.delta.text
              await stream.writeSSE({
                event: 'token',
                data: JSON.stringify({ text: inner.delta.text }),
              })
            }
            break
          }
        }
      }

      if (currentStage !== 'generating_report') {
        currentStage = 'generating_report'
        await emitStage('generating_report')
      }

      const report = extractReport(buffer)
      if (report) {
        report.repo = `${parsed.owner}/${parsed.repo}`
        report.fecha = new Date().toISOString()
        await stream.writeSSE({ event: 'report', data: JSON.stringify(report) })
        try {
          persistReport(report)
        } catch (persistErr) {
          console.error('[server] persistReport failed:', persistErr)
        }
      } else {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ message: 'No se pudo parsear el reporte JSON desde la respuesta del agente.' }),
        })
      }
    } catch (err) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({
          message: err instanceof Error ? err.message : 'Analysis failed',
        }),
      })
    } finally {
      await stream.writeSSE({ event: 'done', data: '{}' })
    }
  })
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
