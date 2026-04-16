import { McpClient } from '@strands-agents/sdk'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

export async function createGitHubMcp(): Promise<McpClient | null> {
  try {
    const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN
    if (!token) {
      console.error('[MCP] GITHUB_PERSONAL_ACCESS_TOKEN not set — skipping MCP GitHub')
      return null
    }

    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: {
        ...(process.env as Record<string, string>),
        GITHUB_PERSONAL_ACCESS_TOKEN: token,
      },
    })

    const mcpClient = new McpClient({ transport })
    console.log('[MCP] GitHub MCP server connected successfully')
    return mcpClient
  } catch (error) {
    console.error('[MCP] Failed to connect GitHub MCP server — agent will work without MCP tools')
    console.error('[MCP]', error instanceof Error ? error.message : error)
    return null
  }
}
