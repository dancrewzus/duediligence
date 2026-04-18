import 'dotenv/config'
import * as readline from 'node:readline'
import { createAgent } from './agent.js'

async function main() {
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║   Due Diligence Técnico — ¿Te sirve este repo?   ║')
  console.log('║   Powered by Strands Agents + Ollama (local)     ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log()

  console.log('Inicializando agente...')
  const { agent, mcpClient } = await createAgent()
  console.log('Agente listo. Escribe una URL de GitHub para analizar.')
  console.log('Escribe "exit" o "salir" para terminar.\n')

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const prompt = () => {
    rl.question('> ', async (input) => {
      const trimmed = input.trim()

      if (!trimmed) {
        prompt()
        return
      }

      if (trimmed === 'exit' || trimmed === 'salir') {
        console.log('\nCerrando agente...')
        if (mcpClient) {
          await mcpClient.disconnect()
        }
        rl.close()
        process.exit(0)
      }

      try {
        const result = await agent.invoke(trimmed)
        console.log('\n' + String(result) + '\n')
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error)
      }

      prompt()
    })
  }

  prompt()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
