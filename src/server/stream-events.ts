import type { AnalysisReport } from '../types/index.js'

export type Stage =
  | 'starting'
  | 'fetching_metadata'
  | 'analyzing_activity'
  | 'evaluating'
  | 'generating_report'
  | 'done'

export const STAGE_LABELS: Record<Stage, string> = {
  starting: 'Iniciando análisis',
  fetching_metadata: 'Leyendo estructura del repo',
  analyzing_activity: 'Analizando actividad del equipo',
  evaluating: 'Evaluando dimensiones técnicas',
  generating_report: 'Generando reporte final',
  done: 'Análisis completo',
}

const GITHUB_MCP_TOOLS = new Set([
  'list_commits',
  'list_pull_requests',
  'list_issues',
  'list_contributors',
  'search_commits',
  'search_issues',
  'search_pull_requests',
  'get_commit',
  'get_pull_request',
  'get_issue',
])

export function mapToolToStage(toolName: string): Stage {
  if (toolName === 'analyze_repo_structure') return 'fetching_metadata'
  if (GITHUB_MCP_TOOLS.has(toolName)) return 'analyzing_activity'
  if (toolName === 'save_analysis' || toolName === 'get_portfolio') return 'generating_report'
  return 'evaluating'
}

export function extractReport(text: string): AnalysisReport | null {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/)
  if (!jsonMatch) return null
  try {
    return JSON.parse(jsonMatch[1]) as AnalysisReport
  } catch {
    return null
  }
}
