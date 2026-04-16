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

export interface ScoreDimension {
  score: number
  justificacion: string
}

export interface AnalysisScores {
  stackArquitectura: ScoreDimension
  calidadCodigo: ScoreDimension
  escalabilidad: ScoreDimension
  saludEquipo: ScoreDimension
  seguridad: ScoreDimension
  madurezDependencias: ScoreDimension
}

export interface TechStack {
  frontend: string[]
  backend: string[]
  database: string[]
  infraestructura: string[]
  testing: string[]
  cicd: string[]
}

export interface RepoMetrics {
  stars: number
  forks: number
  contributorsActivos30d: number
  commitsUltimoMes: number
  ultimoCommitHace: string
  prsAbiertos: number
  prsMergeadosUltimoMes: number
  issuesAbiertos: number
  tieneTests: boolean
  edadProyecto: string
}

export interface AnalysisReport {
  repo: string
  fecha: string
  scores: AnalysisScores
  tecnologias: TechStack
  metricas: RepoMetrics
  deudaTecnica: 'Alta' | 'Media' | 'Baja'
  deudaJustificacion: string
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
