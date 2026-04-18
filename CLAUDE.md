# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Agente de due diligence técnico para startups construido con **Strands Agents SDK (TypeScript)**. Dado un repo de GitHub, evalúa calidad de código, arquitectura, deuda técnica, salud del equipo y produce un score de inversión técnica.

El proyecto aún no está scaffoldeado — esta guía describe la arquitectura objetivo.

## Stack y comandos

- **Runtime:** Node.js 20+, TypeScript ESM (`"type": "module"`)
- **SDK principal:** `@strands-agents/sdk` (RC en npm) — usar `Agent`, `tool`, `McpClient`
- **Proveedor LLM:** configurable vía `MODEL_PROVIDER`:
  - `ollama` (default) — `OpenAIModel` apuntando a `http://localhost:11434/v1` (Ollama expone API OpenAI-compatible). Modelo default: `llama3.1`. Gratis, offline, calidad limitada por tamaño del modelo local.
  - `bedrock` — `BedrockModel` con Claude Sonnet 4.5 (default `us.anthropic.claude-sonnet-4-5-20250929-v1:0`). Auth vía `BEDROCK_API_KEY` (bearer) o credenciales AWS estándar. Billing y governance unificados con AWS; requiere habilitar acceso al modelo en la consola de Bedrock.
- **Validación:** `zod` v4 (requerido por `tool()` del SDK)
- **HTTP:** `axios` para GitHub REST API directa
- **MCP:** `@modelcontextprotocol/server-github` vía `npx` (sin Docker)
- **Backend web:** Hono + `@hono/node-server`
- **Frontend:** Astro 5 con CSS vanilla y tema dark

Scripts en `package.json`:

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "dev:server": "tsx watch src/server.ts",
    "dev:web": "cd web && npm run dev",
    "build": "tsc"
  }
}
```

Variables de entorno requeridas (`.env`):

```
OLLAMA_HOST=http://localhost:11434        # solo si MODEL_PROVIDER=ollama
OLLAMA_MODEL=llama3.1                     # solo si MODEL_PROVIDER=ollama
MODEL_PROVIDER=ollama                     # "ollama" o "bedrock"
AWS_REGION=us-east-1                         # solo si MODEL_PROVIDER=bedrock
BEDROCK_API_KEY=                             # opcional: bearer token; si no, se usa SigV4
BEDROCK_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0  # opcional, default ya apunta a Sonnet 4.5
GITHUB_PERSONAL_ACCESS_TOKEN
PORT=3001
```

Prerequisito (solo si `MODEL_PROVIDER=ollama`): tener Ollama corriendo (`ollama serve`) con un modelo descargado (`ollama pull llama3.1`). Si usás `MODEL_PROVIDER=bedrock`, no hace falta Ollama — pero necesitás acceso habilitado al modelo en la consola de Bedrock y credenciales AWS configuradas.

## Arquitectura objetivo

```
src/
├── index.ts              # Entry point — loop de conversación readline
├── agent.ts              # Configuración del Strands Agent (system prompt + tools)
├── tools/
│   └── github-analyzer.ts  # @tool: analyze_repo_structure
├── mcp/
│   └── github-mcp.ts     # Cliente MCP nativo del SDK → github-mcp-server
├── session/
│   └── portfolio.ts      # Portafolio persistente (portfolio.json)
└── types/
    └── index.ts          # Interfaces compartidas
```

Tres piezas de capacidad que suman tickets y que el agente debe usar coordinadamente:

1. **`@tool` `analyze_repo_structure`** — llama a GitHub REST API, lee `package.json`, `tsconfig.json`, `README.md`, config de eslint/prettier/docker/ci, y retorna un objeto con dependencias, scripts, versiones y estructura de carpetas para que el LLM razone sobre él.

2. **MCP GitHub server** — conectado vía cliente MCP nativo del SDK. Expone tools para commits, issues, PRs y contributors. **Debe degradar grácilmente**: si el MCP falla al iniciar, el agente sigue funcionando con solo el `@tool` personalizado.

3. **Session / portfolio management** — `Map<sessionId, AnalysisHistory>` en memoria + persistencia en `portfolio.json` (se crea si no existe). Al iniciar, cargar el portafolio y pasarlo como contexto para que el agente pueda comparar startups previamente analizadas (`"¿cuál tiene mejor score?"`, `"compara A vs B"`).

## Contrato de salida del reporte

Cuando el agente completa un análisis, **siempre** debe emitir el reporte en el formato box-drawing especificado — con estas dimensiones puntuadas X/10: Stack & Arquitectura, Calidad de código, Escalabilidad, Salud del equipo, Seguridad, Madurez de dependencias; Deuda técnica como Alta/Media/Baja; un **Score de Inversión Técnica** agregado; Top 3 Riesgos, Top 3 Fortalezas y una Recomendación al inversor.

Tras cada análisis completado, guardar en `portfolio.json`: `{ repo, fecha, score, resumen }`.

## Tono del agente

System prompt: "CTO senior con 15 años de experiencia evaluando startups para fondos de inversión". **Directo, técnico, objetivo — no suavizar problemas**. El inversor necesita la verdad, no lo que quiere escuchar.
