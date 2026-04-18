import { tool } from '@strands-agents/sdk'
import { z } from 'zod'
import axios from 'axios'
import type { RepoStructure, RepoMetadata } from '../types/index.js'

const GITHUB_API = 'https://api.github.com'
const README_SNIPPET_MAX = 8000

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
      readmeContent: readmeRaw ? readmeRaw.slice(0, README_SNIPPET_MAX) : null,
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
