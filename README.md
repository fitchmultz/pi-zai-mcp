# pi-zai-mcp

Project-local pi extension that exposes the Z.ai MCP server tools to pi.

It bridges these Z.ai MCP servers:

- Web Search MCP: `https://api.z.ai/api/mcp/web_search_prime/mcp`
- Web Reader MCP: `https://api.z.ai/api/mcp/web_reader/mcp`
- Zread MCP: `https://api.z.ai/api/mcp/zread/mcp`
- Vision MCP: local stdio server via `npx -y @z_ai/mcp-server@latest`

## Setup

```bash
npm install
export Z_AI_API_KEY="your_z_ai_api_key"
# optional alias also supported: ZAI_API_KEY
```

The extension is auto-discoverable from:

```text
.pi/extensions/zai-mcp.ts
```

Run pi from this project directory, or install this package as a pi package later.

## Configuration

Optional environment variables:

- `Z_AI_API_KEY` / `ZAI_API_KEY`: required Z.ai API key.
- `Z_AI_MODE`: passed to the vision MCP server, defaults to `ZAI`.
- `Z_AI_MCP_SERVERS`: comma-separated subset of `search,reader,zread,vision`; defaults to all.

Example without vision startup:

```bash
export Z_AI_MCP_SERVERS=search,reader,zread
```

## Tools

On startup, the extension connects to each enabled Z.ai MCP server, lists its tools, and registers pi tools named:

```text
z_ai_<server>_<mcpToolName>
```

Examples include tools like:

- `z_ai_search_webSearchPrime`
- `z_ai_reader_webReader`
- `z_ai_zread_search_doc`
- `z_ai_zread_get_repo_structure`
- `z_ai_zread_read_file`

Vision tools are discovered from `@z_ai/mcp-server@latest`.

Fallback generic tools are always registered:

- `z_ai_mcp_list_tools` — list Z.ai MCP tools and schemas.
- `z_ai_mcp_call_tool` — call any enabled Z.ai MCP tool by exact server/tool name.

Command:

- `/zai-mcp-status` — show configured server connection status.

Large MCP outputs are truncated to pi's standard 50KB / 2000-line limit; full output is saved to a temp file and the path is included in the tool result.

## Validation

```bash
npm run typecheck
```
