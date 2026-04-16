# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Agente de due diligence técnico para startups construido con **Strands Agents SDK (TypeScript)**. Dado un repo de GitHub, evalúa calidad de código, arquitectura, deuda técnica, salud del equipo y produce un score de inversión técnica.

El proyecto aún no está scaffoldeado — esta guía describe la arquitectura objetivo.

## Stack y comandos

- **Runtime:** Node.js 20+, TypeScript ESM (`"type": "module"`)
- **SDK principal:** `@strands-agents/sdk` (RC en npm) — usar `Agent` y `tool`
- **Proveedor LLM:** Amazon Bedrock con Claude Sonnet 4 (default del SDK)
- **Validación:** `zod` (requerido por `@tool` del SDK)
- **HTTP:** `axios` o `node-fetch` para GitHub REST API directa
- **MCP:** `github/github-mcp-server` vía `npx` (sin Docker)

Scripts esperados en `package.json`:

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc"
  }
}
```

Variables de entorno requeridas (`.env`):

```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
GITHUB_PERSONAL_ACCESS_TOKEN
```

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
