# pi-zai-mcp

Give pi agents Z.ai-powered web search, URL reading, repository reading, and vision tools through MCP without leaving a pi session. This is an unofficial community package, not an official Z.ai package.

This package focuses on Z.AI MCP servers. GLM-5.1 model access is already covered by pi's built-in `zai` provider (`ZAI_API_KEY`) and the OpenAI-compatible Z.AI API; this package adds the external MCP context/tools that Z.AI documents for coding agents.

## What you get

`pi-zai-mcp` registers up to four curated pi tools, one per Z.AI MCP server:

- `z_ai_search` — search the live web with Z.AI Web Search MCP.
- `z_ai_reader` — read URLs and convert pages to model-friendly Markdown/text with Z.AI Web Reader MCP.
- `z_ai_zread` — inspect public GitHub repositories through Zread search, file reading, and directory-structure actions.
- `z_ai_vision` — analyze images and videos through Z.AI vision actions for UI screenshots, OCR, error screenshots, diagrams, charts, UI diffs, general image understanding, and video understanding.

Z.AI also documents Slide/Poster, Translation, and Video Effect Template agents as API agents, not MCP servers. They are not registered as MCP tools by this package unless Z.AI publishes MCP endpoints for them.

## Z.AI MCP coverage

Reviewed Z.AI docs on 2026-06-05:

- GLM-5.1 supports text input/output, 200K context, 128K max output, thinking mode, streaming, function calling, context caching, structured output, and MCP integration.
- Web Search MCP documents web search with query, domain filter, recency filter, content size, and location options. The current remote MCP tool is `web_search_prime`.
- Web Reader MCP documents URL reading with timeout, cache, Markdown/text, image retention, GFM, image data URL, image summary, and link summary options. The current remote MCP tool is `webReader`.
- Zread MCP documents `search_doc`, `read_file`, and `get_repo_structure` for public GitHub repository search, file reading, and structure inspection.
- Vision MCP documents UI artifact generation, screenshot OCR, error screenshot diagnosis, technical diagram understanding, data visualization analysis, UI diff checking, image analysis, and video analysis. The current npm package (`@z_ai/mcp-server@0.1.4`) exposes the image/video actions as `analyze_image` and `analyze_video`.

The pi-facing API is intentionally smaller than the upstream MCP tool list. Upstream MCP names are implementation details; agents see four stable tools with clear arguments.

## Install

Install from npm:

```bash
pi install npm:pi-zai-mcp
```

Install from GitHub:

```bash
pi install https://github.com/fitchmultz/pi-zai-mcp
```

Compatibility note: this release is tested against pi `0.78.1`, which is the suggested minimum baseline for this package version. Pi-bundled runtime packages are declared as optional wildcard peers, so npm peer ranges do not hard-block users from trying newer pi releases; runtime behavior is only verified against the tested baseline until a follow-up package release confirms it.

Try it without installing permanently:

```bash
export Z_AI_API_KEY="your_z_ai_api_key"
pi -e npm:pi-zai-mcp
```

Run from a local clone:

```bash
git clone https://github.com/fitchmultz/pi-zai-mcp.git
cd pi-zai-mcp
npm install
export Z_AI_API_KEY="your_z_ai_api_key"
pi -e .
```

## Configure

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `Z_AI_API_KEY` / `ZAI_API_KEY` | Yes | none | Z.ai API key used for HTTP MCP Bearer auth and the vision stdio server. |
| `Z_AI_MCP_SERVERS` | No | `all` | Comma-separated subset of `search,reader,zread,vision`; disabled servers do not register their pi tools. |
| `Z_AI_MCP_TIMEOUT_MS` | No | `180000` | Per-connection/tool-call timeout in milliseconds; vision and repository-search actions can take longer than ordinary search/read calls. |
| `Z_AI_MODE` | No | `ZAI` | Passed through to the vision MCP server; Z.AI docs list `ZAI` as the supported value. |

Example: disable vision server access for a lighter setup.

```bash
export Z_AI_MCP_SERVERS=search,reader,zread
```

## Tool reference

Agents can inspect these descriptions through pi tool discovery. This section is the human-readable source of truth for the curated pi-facing shape.

### `z_ai_search`

Search the live web through Z.AI Web Search MCP.

Arguments:

- `query` — required search query. Z.AI recommends keeping it under about 70 characters.
- `domain_filter` — optional whitelist domain such as `docs.z.ai` or `github.com`.
- `recency_filter` — optional `oneDay`, `oneWeek`, `oneMonth`, `oneYear`, or `noLimit`.
- `content_size` — optional `medium` or `high`; high returns more context and costs more quota.
- `location` — optional `cn` or `us` region hint.

### `z_ai_reader`

Read a specific URL through Z.AI Web Reader MCP.

Arguments:

- `url` — required URL to fetch and convert.
- `timeout` — optional timeout in seconds.
- `no_cache` — optional cache bypass.
- `return_format` — optional `markdown` or `text`.
- `retain_images` — optional image-reference retention.
- `no_gfm` — optional GitHub Flavored Markdown disable switch.
- `keep_img_data_url` — optional image data URL retention.
- `with_images_summary` — optional image summary.
- `with_links_summary` — optional link summary.

### `z_ai_zread`

Inspect public GitHub repositories through Z.AI Zread MCP.

Arguments:

- `action` — required `search_doc`, `read_file`, or `get_repo_structure`.
- `repo_name` — required public GitHub repository in `owner/repo` form.
- `query` — required for `search_doc`.
- `language` — optional `en` or `zh` for `search_doc`.
- `file_path` — required for `read_file`.
- `dir_path` — optional for `get_repo_structure`; defaults upstream to the repository root.

### `z_ai_vision`

Analyze images and videos through Z.AI Vision MCP. For most MCP clients, images must be available as local paths or remote URLs; pasting images directly may bypass MCP and call the model provider instead.

Arguments:

- `action` — required action:
  - `ui_to_artifact` — convert UI screenshot to code, prompt, spec, or description.
  - `extract_text_from_screenshot` — OCR screenshots containing text, code, terminals, or docs.
  - `diagnose_error_screenshot` — analyze an error screenshot and suggest fixes.
  - `understand_technical_diagram` — explain architecture, flowchart, UML, ER, sequence, or system diagrams.
  - `analyze_data_visualization` — analyze charts, dashboards, metrics, trends, anomalies, or comparisons.
  - `ui_diff_check` — compare expected/reference and actual UI screenshots.
  - `analyze_image` — general image analysis fallback.
  - `analyze_video` — analyze MP4/MOV/M4V video up to 8 MB.
- `prompt` — required instructions for the chosen action.
- `image_source` — required for single-image actions except `ui_diff_check` and `analyze_video`.
- `expected_image_source` and `actual_image_source` — required for `ui_diff_check`.
- `video_source` — required for `analyze_video`.
- `output_type` — required for `ui_to_artifact`; `code`, `prompt`, `spec`, or `description`.
- `programming_language` — optional for OCR/code screenshots.
- `context` — optional for error diagnosis.
- `diagram_type` — optional for technical diagrams.
- `analysis_focus` — optional for data visualizations.

## Use

Typical flow:

1. Use one of the four curated tools directly: `z_ai_search`, `z_ai_reader`, `z_ai_zread`, or `z_ai_vision`.
2. If a tool call fails, run `/zai-mcp-status` in interactive pi to inspect server connection status. `connectionStatus: "lazy_not_connected_until_first_use"` is normal before the first call to that server; the pi tool is still registered and available.
3. If Z.AI changes upstream MCP tool names or schemas, update this extension deliberately and run the validation commands below.

Large MCP outputs are truncated to pi's standard 50 KB / 2000 line limit. When truncation happens, the full output is saved to a temp file and the path is included in the tool result.

## How it works

- `search`, `reader`, and `zread` use Z.ai Streamable HTTP MCP endpoints.
- `vision` uses the bundled `@z_ai/mcp-server` stdio server dependency through the current Node.js runtime. The extension no longer shells out to `npx` at tool-call time, so installed package behavior stays deterministic and does not depend on package-manager network access after install.
- The extension registers curated tools synchronously so pi startup is fast and tool context stays small.
- Tool calls emit an immediate progress update so the TUI shows a Z.AI tool card while MCP connection or long vision/repository work is still running.
- Tool results use compact TUI rendering by default. Press Ctrl+O to expand a bounded, syntax-highlighted view without dumping very large MCP outputs into the terminal.
- Calls are serialized per upstream MCP server to avoid transport-level contention when multiple actions target the same Z.AI server at once; queued calls still respect user cancellation.
- Server connections are lazy by default to avoid blocking pi startup on network or package-manager work; `/zai-mcp-status` reports this explicitly before first use.
- Upstream MCP error responses are surfaced as failed pi tool calls instead of successful results with error text.
- `session_shutdown` closes any opened MCP transports.

## Security and data flow

- Pi extensions run with your local user permissions. Review code before installing any third-party pi package.
- The extension reads `Z_AI_API_KEY` or `ZAI_API_KEY` from the environment; it does not store credentials.
- HTTP MCP calls send the key as a Bearer token to Z.ai MCP endpoints.
- Vision calls start a local stdio MCP server and pass the key in that child process environment.
- Truncated full outputs are written under your OS temp directory, not this repo.

## Verify this repo

```bash
npm install
npm run typecheck
npm audit --omit=dev
npm publish --dry-run
```

For install-path checks, use a temporary project so local `.pi/settings.json` changes do not affect another repo:

```bash
tmpdir="$(mktemp -d)"
cd "$tmpdir"
pi install -l /path/to/pi-zai-mcp
```

## Current limits

- Requires a Z.ai API key and network access for real tool calls.
- The pi-facing API is curated. If upstream MCP schemas or tool names change, update this extension and docs intentionally.
- Verification currently consists of TypeScript typechecking, npm audit, npm dry-run packing, and pi install smoke checks; there is no dedicated unit test suite yet.

## Project map

```text
extensions/zai-mcp.ts  # public pi package entrypoint
src/index.ts           # extension implementation
package.json           # npm + pi package manifest
CHANGELOG.md           # release notes
```
