# Due Diligence Técnico para Startups — Agente con Strands Agents

> Challenge **"Construye con Strands Agents"** de AWS en **Nerdearla Chile 2026**

Agente de IA que realiza due diligence técnico de startups a partir de su repositorio de GitHub. Evalúa calidad de código, arquitectura, deuda técnica, salud del equipo y genera un **score de inversión técnica**.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Runtime / Lenguaje | Node.js 20+, TypeScript (ESM) |
| Ejecución TS | tsx |
| SDK principal | `@strands-agents/sdk` (RC) — `Agent` y `tool` |
| Proveedor LLM | Amazon Bedrock con Claude Sonnet 4 (default) |
| Validación de schemas | zod (requerido por `@tool`) |
| MCP GitHub | `github/github-mcp-server` vía npx |
| HTTP Client | axios o node-fetch (GitHub REST API) |

### Credenciales requeridas (`.env`)

```env
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_pat
```

---

## Estructura del proyecto

```
due-diligence-agent/
├── src/
│   ├── index.ts              # Entry point, loop de conversación
│   ├── agent.ts              # Configuración del agente Strands
│   ├── tools/
│   │   └── github-analyzer.ts  # @tool personalizado
│   ├── mcp/
│   │   └── github-mcp.ts     # Conexión al MCP server de GitHub
│   ├── session/
│   │   └── portfolio.ts      # Session management y portafolio
│   └── types/
│       └── index.ts          # Interfaces TypeScript del proyecto
├── portfolio.json            # Persistencia local del portafolio
├── .env                      # Variables de entorno
├── tsconfig.json
└── package.json
```

---

## Tools implementados

### 1. `analyze_repo_structure` — `@tool` personalizado

Dado un `owner/repo` de GitHub:

- Llama a la GitHub REST API para obtener el árbol de archivos.
- Lee archivos clave: `package.json`, `tsconfig.json`, `README.md`, archivos de configuración (eslint, prettier, docker, ci/cd).
- Extrae: dependencias, devDependencies, scripts, versiones, estructura de carpetas.
- Retorna un objeto estructurado con todos estos datos para que el agente los analice.

### 2. MCP Server de GitHub — acceso a historial y actividad

- Usa el MCP client nativo de `@strands-agents/sdk` para conectarse al `github-mcp-server`.
- El agente usa sus tools para: listar commits recientes, ver issues, ver pull requests, obtener estadísticas de contributors.

### 3. Session management — portafolio de análisis

- Guarda cada análisis completado en `portfolio.json` con: repo, fecha, score, resumen.
- Al iniciar, carga el portafolio existente y lo pasa como contexto al agente.
- El agente puede responder preguntas como:
  - *"¿Cuál de los repos analizados tiene mejor score?"*
  - *"Compara Startup A vs Startup B"*

---

## Formato del reporte de salida

El agente genera siempre este formato cuando completa un análisis:

```
╔══════════════════════════════════════════════════════════════╗
║        DUE DILIGENCE TÉCNICO — [NOMBRE STARTUP]            ║
║        github.com/[owner/repo]                              ║
╠══════════════════════════════════════════════════════════════╣
║  📐 Stack & Arquitectura          [X/10]                    ║
║  🧹 Calidad de código             [X/10]                    ║
║  ⚠️  Deuda técnica                [Alta/Media/Baja]         ║
║  🚀 Escalabilidad                 [X/10]                    ║
║  👥 Salud del equipo              [X/10]                    ║
║  🔒 Seguridad (básica)            [X/10]                    ║
║  📦 Madurez de dependencias       [X/10]                    ║
╠══════════════════════════════════════════════════════════════╣
║  🎯 SCORE DE INVERSIÓN TÉCNICA    [X.X / 10]               ║
╠══════════════════════════════════════════════════════════════╣
║  ⚠️  TOP 3 RIESGOS                                          ║
║  1. ...                                                     ║
║  2. ...                                                     ║
║  3. ...                                                     ║
╠══════════════════════════════════════════════════════════════╣
║  ✅ TOP 3 FORTALEZAS                                        ║
║  1. ...                                                     ║
║  2. ...                                                     ║
║  3. ...                                                     ║
╠══════════════════════════════════════════════════════════════╣
║  💡 RECOMENDACIÓN AL INVERSOR                               ║
║  ...                                                        ║
╚══════════════════════════════════════════════════════════════╝
```

---

## System prompt del agente

> Eres un CTO senior con 15 años de experiencia evaluando startups para fondos de inversión. Tu trabajo es realizar due diligence técnico de repositorios de GitHub y generar un reporte de inversión técnica objetivo y accionable.
>
> Cuando el usuario te dé una URL de GitHub, debes:
> 1. Usar `analyze_repo_structure` para obtener la estructura del proyecto
> 2. Usar las herramientas del MCP de GitHub para analizar actividad del equipo
> 3. Evaluar cada dimensión técnica con criterio de CTO experimentado
> 4. Generar el reporte con el formato establecido
>
> También tienes acceso al portafolio de análisis anteriores. Puedes comparar startups, responder preguntas sobre análisis pasados y actualizar el portafolio.
>
> Sé directo, técnico y objetivo. No suavices los problemas que encuentres. Un inversor necesita la verdad, no lo que quiere escuchar.

---

## Uso

```bash
# Instalar dependencias
npm install

# Ejecutar el agente en modo desarrollo
npm run dev

# Compilar TypeScript
npm run build
```

---

## Notas de implementación

- El entry point es un loop de conversación simple en consola (readline).
- TypeScript estricto con tipos para todo.
- El MCP de GitHub se conecta vía npx (sin Docker) para simplicidad.
- Manejo de errores graceful: si el MCP falla, el agente sigue funcionando con solo el `@tool` personalizado.
- `portfolio.json` se crea automáticamente si no existe.
