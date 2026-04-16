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
