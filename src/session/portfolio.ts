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
