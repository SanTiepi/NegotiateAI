# NegotiateAI MCP Server

MCP (Model Context Protocol) server that wraps NegotiateAI into 6 tools callable by Claude Desktop, Claude Code, or any MCP client.

## Prerequisites

- Node.js 20+
- `ANTHROPIC_API_KEY` environment variable set
- Dependencies installed in both root and `mcp/` directories

## Installation

```bash
cd mcp/
npm install
```

## Usage

### With Claude Desktop

Add to your `claude_desktop_config.json` (typically at `%APPDATA%\Claude\claude_desktop_config.json` on Windows or `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "negotiate-ai": {
      "command": "node",
      "args": ["c:/PROJET IA/NegotiateAI/mcp/index.mjs"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

### With Claude Code

Add to your project or global MCP settings:

```json
{
  "negotiate-ai": {
    "command": "node",
    "args": ["c:/PROJET IA/NegotiateAI/mcp/index.mjs"],
    "env": {
      "ANTHROPIC_API_KEY": "sk-ant-..."
    }
  }
}
```

### Standalone

```bash
ANTHROPIC_API_KEY=sk-ant-... node mcp/index.mjs
```

Or from the project root:

```bash
npm run mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `negotiate_setup` | Create a new negotiation session with AI adversary |
| `negotiate_turn` | Send a message and get adversary response + analytics |
| `negotiate_feedback` | Get detailed scoring and bias analysis for a session |
| `negotiate_plan` | Generate an optimal negotiation strategy plan |
| `negotiate_prepare` | Run 3 auto-simulations and produce a preparation dossier |
| `negotiate_profile` | View your progression profile (belts, streaks, biases) |

## Typical flow

1. `negotiate_setup` with your negotiation context -> get `sessionId`
2. `negotiate_turn` (repeat) with your messages -> get adversary responses + live analytics
3. `negotiate_feedback` -> get detailed scoring
4. `negotiate_plan` -> get optimal retry strategy

For preparation without interactive play, use `negotiate_prepare` which runs 3 simulations automatically.
