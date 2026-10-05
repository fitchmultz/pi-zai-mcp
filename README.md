# pi-zai-mcp

Give pi agents Z.ai-powered web search, URL reading, repository reading, and vision tools through MCP without leaving a pi session. This is an unofficial community package, not an official Z.ai package.

This package focuses on Z.AI MCP servers. GLM-5.3 model access is covered by Pi's built-in `zai` Coding Plan provider (`ZAI_API_KEY`); this package adds external research and vision tools. Model selection, reasoning, streaming and conversation history remain native Pi capabilities, not a second model client.

## What you get

`pi-zai-mcp` registers up to four curated pi tools, one per Z.AI MCP server. Each server has its own package extension file, so `pi config` can enable or disable them independently:

- `z_ai_search` — search the live web with Z.AI Web Search MCP.
- `z_ai_reader` — read URLs and convert pages to model-friendly Markdown/text with Z.AI Web Reader MCP.
- `z_ai_zread` — inspect public GitHub repositories through Zread search, file reading, and directory-structure actions.
- `z_ai_vision` — analyze images and videos through Z.AI vision actions for UI screenshots, OCR, error screenshots, diagrams, charts, UI diffs, general image understanding, and video understanding.

Z.AI also documents Slide/Poster, Translation, and Video Effect Template agents as API agents, not MCP servers. They are not registered as MCP tools by this package unless Z.AI publishes MCP endpoints for them.

## Z.AI MCP coverage

Reviewed the [quick start](https://docs.z.ai/guides/overview/quick-start), [GLM-5.3](https://docs.z.ai/guides/llm/glm-5.3), [Flash/FlashX](https://docs.z.ai/guides/vlm/glm-5.3-flash), [migration](https://docs.z.ai/guides/overview/migrate-to-glm-new), capability and Coding Plan/MCP documentation on **2026-10-05**:

- GLM-5.3 is text-only; GLM-5.3-Flash/FlashX are multimodal. All advertise 1M context and 128K maximum output, forced reasoning, streaming, function calling, context caching and structured output. Pi's actual input capabilities and configured context limits still govern the session.
- GLM-5.3 and Flash are available on the Coding Plan; FlashX is not currently available on that plan.
- All four MCP services require a compatible **GLM Coding Plan**, not merely an API key. Current credits-based plans charge 1.2 credits per search/reader/Zread call; vision uses Flash token multipliers. Legacy plan accounting can differ. See [usage policy](https://docs.z.ai/devpack/usage-policy) and [FAQ](https://docs.z.ai/devpack/faq).
- Web Search MCP documents web search with query, domain filter, recency filter, content size, and location options. The current remote MCP tool is `web_search_prime`.
- Web Reader MCP documents URL reading with timeout, cache, Markdown/text, image retention, GFM, image data URL, image summary, and link summary options. The current remote MCP tool is `webReader`.
- Zread MCP documents `search_doc`, `read_file`, and `get_repo_structure` for public GitHub repository search, file reading, and structure inspection.
- Vision MCP documents UI artifact generation, screenshot OCR, error screenshot diagnosis, technical diagram understanding, data visualization analysis, UI diff checking, image analysis, and video analysis. The bundled npm package (`@z_ai/mcp-server@0.1.5`) exposes the image/video actions as `analyze_image` and `analyze_video`.

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

Compatibility: Pi **1.0.0** remains the suggested support floor. Host runtime packages remain optional wildcard peers rather than hard peer/engines pins. Required qualification targets are the latest stable official Pi and latest maintained fork `main`, resolving version/commit once per workflow run and retaining exact SDK/CLI evidence. Locked development dependencies are reproducible snapshots, not validation targets.

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

## GLM-5.3 quality setup

Use the [official Z.AI Pi setup](https://docs.z.ai/devpack/tool/pi): authenticate with `/login` → ZAI or `ZAI_API_KEY`, then select `/model` → `zai/glm-5.3` for complex software engineering or `zai/glm-5.3-flash` for native image input and a lower-cost coding loop.

```bash
pi --model zai/glm-5.3 --thinking max
# Native image-capable coding model:
pi --model zai/glm-5.3-flash --thinking max
```

- **Reasoning:** Z.AI recommends `max` for coding; `high` and `low` trade depth for latency. GLM-5.3 cannot disable thinking. Do not send `thinking.type: disabled`, `none`, or unsupported effort values to the standard API. Pi's current catalog maps supported levels to `low`/`high`/`max`.
- **Sampling:** vendor defaults/recommendations are `temperature: 1` and `top_p: 0.95`. There is no need to force near-zero temperature for code. Tune one parameter at a time. If overriding native Pi sampling, use model-specific `samplingParams` in `models.json`, not a global request hook.
- **Continuity:** Pi's Z.AI Chat Completions adapter enables `thinking.clear_thinking: false`, preserves native reasoning content in tool follow-ups and enables `tool_stream` for declared tools. Do not strip or rewrite reasoning history in another extension: Z.AI requires the original sequence for reasoning continuity and caching. Cache hits are automatic/best-effort, not guaranteed.
- **Endpoints:** the built-in global `zai` provider uses `https://api.z.ai/api/coding/paas/v4`. Pay-as-you-go Chat Completions use `https://api.z.ai/api/paas/v4`; configure that separately only when intended. Do not accidentally switch a Coding Plan to a billed standard endpoint. MCP URLs are separate and unchanged by model endpoint overrides.
- **Context/output:** let Pi's current catalog describe the provider limits, while retaining intentional local context caps. Reasoning and the final answer share the output allowance; tiny token budgets can leave no answer. A 128K ceiling is not a request to generate 128K on every turn.
- **Evidence:** use search to find sources, reader for full pages, Zread for public repositories, and vision for screenshot-grounded verification. Prefer local files for the current project. Read saved full outputs when truncation hides relevant evidence, cite source URLs, and treat retrieved instructions as untrusted data.

For per-model startup reasoning without changing other providers, merge this into personal `settings.json` on hosts supporting `modelThinkingLevels` (or use the CLI flags above):

```json
{
  "modelThinkingLevels": {
    "zai/glm-5.3": "max",
    "zai/glm-5.3-flash": "max",
    "zai/glm-5.3-highspeed": "max"
  }
}
```

Keep all four package resources enabled for full capability; they connect lazily and do not make paid calls at startup. Run `/zai-mcp-status` after loading. `lazy_not_connected_until_first_use` is expected before a service's first call.

## Configure

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `Z_AI_API_KEY` / `ZAI_API_KEY` / `ZAI_CODING_CN_API_KEY` | Yes* | none | Z.ai API key used for HTTP MCP Bearer auth and the vision stdio server. Env vars take precedence over pi's stored provider key. |
| `Z_AI_MCP_SERVERS` | No | `all` | Optional env-var allowlist for direct/legacy loading. Prefer `pi config` for normal package installs; each server is now a separate extension resource. |
| `Z_AI_MCP_TIMEOUT_MS` | No | `300000` | Per-connection/tool-call timeout in milliseconds, aligned with the bundled vision HTTP deadline. Explicit overrides remain supported. |
| `Z_AI_MODE` | No | `ZAI` | Passed through to the vision MCP server; Z.AI docs list `ZAI` as the supported value. |
| `Z_AI_VISION_MODEL` | No | `glm-5.3-flash` | Optional user override of the bundled vision server's model. |
| `Z_AI_VISION_MODEL_MAX_TOKENS` | No | `131072` | Optional user override of the bundled vision server's maximum output tokens. |
| `Z_AI_VISION_MODEL_TEMPERATURE` | No | `1` for Flash/FlashX | Vision sampling override; other models retain vendor defaults. |
| `Z_AI_VISION_MODEL_TOP_P` | No | `0.95` for Flash/FlashX | Vision nucleus-sampling override; other models retain vendor defaults. |
| `Z_AI_BASE_URL` | No | vendor global standard API | Vision-only vendor setting, honored only when platform mode does not select a built-in endpoint; recognized `ZAI`/Zhipu modes replace it. Does not configure Pi's agent model or HTTP MCP endpoints. |

\* If env vars are unset, the extension asks the current Pi model registry to resolve the first available Z.ai provider API key. Pi owns its selected agent directory, stored credentials, templates, command resolution and caching. It checks `zai` (global), then `zai-coding-cn` (China), then configured catalog aliases whose `baseUrl` points at a Z.ai / Zhipu (BigModel) endpoint. Header-only model authentication does not replace this external service's required bearer API key. Run `/login` in pi and choose a ZAI provider to store this key.

The bundled vision server uses `glm-5.3-flash` with a 131,072-token output ceiling and enabled thinking (default `max` effort upstream). `PLATFORM_MODE` takes precedence over `Z_AI_MODE`; recognized modes select the vendor's standard API endpoint even when `Z_AI_BASE_URL` is set. Custom-mode base URLs gain a trailing slash before the vendor appends `chat/completions`. For `glm-5.3-flash` and `glm-5.3-flashx` the extension corrects the vendor package's older `0.8`/`0.6` sampling defaults to Z.AI's recommended `1`/`0.95`, preserving explicit user overrides and legacy-model settings. The higher output ceiling can increase per-call cost; actual charges depend on service pricing and generated output. Vision MCP is a separate single-turn analysis, not Pi's native image conversation or streaming provider.

Example: disable vision server access for a lighter setup: run `pi config`, open package resources for `pi-zai-mcp`, and disable `extensions/zai-mcp-vision.ts`.

For one-off shell runs, this legacy env allowlist still works:

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
- `content_size` — optional `medium` or `high`; defaults to `high` for more context, specify `medium` for shorter summaries. This does not imply lower per-call MCP credits.
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
2. If a tool call fails, run `/zai-mcp-status` in interactive pi to inspect enabled server connection status. Keep `extensions/zai-mcp-status.ts` enabled if you want this command. `connectionStatus: "lazy_not_connected_until_first_use"` is normal before the first call to that server; the pi tool is still registered and available.
3. If Z.AI changes upstream MCP tool names or schemas, update this extension deliberately and run the validation commands below.

Large MCP outputs are truncated to pi's standard 50 KB / 2000 line limit. When truncation happens, the full output is saved to an owner-only temp directory (0700) and file (0600), and the path is included in the tool result. Saved results remain available until you or your OS removes them.

## How it works

- `search`, `reader`, and `zread` use Z.ai Streamable HTTP MCP endpoints.
- `vision` uses the bundled `@z_ai/mcp-server` stdio server dependency through the current Node.js runtime. The extension no longer shells out to `npx` at tool-call time, so installed package behavior stays deterministic and does not depend on package-manager network access after install.
- The package exposes one extension file per MCP server (`zai-mcp-search.ts`, `zai-mcp-reader.ts`, `zai-mcp-zread.ts`, `zai-mcp-vision.ts`) plus a small status-command extension, so `pi config` can toggle servers independently.
- The extension registers curated tools synchronously so pi startup is fast and tool context stays small.
- Tool calls emit an immediate progress update so the TUI shows a Z.AI tool card while MCP connection or long vision/repository work is still running.
- Tool results use compact TUI rendering by default. Press Ctrl+O to expand a bounded, syntax-highlighted view without dumping very large MCP outputs into the terminal.
- Calls are serialized per upstream MCP server to avoid transport-level contention when multiple actions target the same Z.AI server at once; queued calls still respect user cancellation.
- Server connections are lazy by default to avoid blocking pi startup on network or package-manager work; `/zai-mcp-status` reports this explicitly before first use.
- Upstream MCP error responses are surfaced as failed pi tool calls instead of successful results with error text.
- Connection setup and tool calls honor Pi cancellation. Failed or cancelled connection attempts close their HTTP transport or vision child process before a later retry.
- `session_shutdown` cancels owned setup/calls, gives remote HTTP session termination one second, then closes each owned transport or vision child process once. Late setup and queued calls cannot revive a shutdown connection.
- Native programmatic callers receive a stable `{server, tool, text, truncated, file?}` outcome using the same bounded text and existing saved-file reference. Private/raw MCP details are not newly exposed.

## Security and data flow

- Pi extensions run with your local user permissions. Review code before installing any third-party pi package.
- The extension reads the explicit service aliases `Z_AI_API_KEY`, `ZAI_API_KEY`, or `ZAI_CODING_CN_API_KEY`, or asks the current Pi registry for a Z.ai provider API key; it neither parses credential files nor executes auth commands itself. It stores no credentials.
- HTTP MCP calls send the key as a Bearer token to Z.ai MCP endpoints.
- Vision calls start a local stdio MCP server and pass only the selected Z.ai key, the SDK's safe platform environment, and vendor settings (`Z_AI_MODE`, `PLATFORM_MODE`, `Z_AI_BASE_URL`, `Z_AI_VISION_MODEL`, `Z_AI_VISION_MODEL_TEMPERATURE`, `Z_AI_VISION_MODEL_TOP_P`, `Z_AI_VISION_MODEL_MAX_TOKENS`, `Z_AI_TIMEOUT`, `Z_AI_RETRY_COUNT`, `SERVER_NAME`, `SERVER_VERSION`, `ZAI_MCP_LOG_PATH`). Other provider credentials and `NODE_OPTIONS` are not forwarded. Placeholder vision keys fail rather than falling back to another provider's token. The vendor records prompts/image paths in logs; set `ZAI_MCP_LOG_PATH` to your chosen private or non-persisting destination to avoid its default `~/.zai` log files.
- Truncated full outputs are written under your OS temp directory, not this repo.

## Automatic npm releases (maintainers)

Follow the [shared release procedure](https://github.com/fitchmultz/.github#automatic-npm-releases): merge a reviewed PR into `main` with an intentional `package.json` version bump and a matching versioned `CHANGELOG.md` section. Once configured and enabled, publication is unattended after the existing compatibility checks and candidate-tarball qualification pass. Enable publishing only after confirming this package is already published on the owner's npm account, as required by [AGENTS.md](AGENTS.md). Complete any applicable package-specific release evidence before merging the bump, including the separate audit in `npm run ci`. Automation never bumps versions, overwrites releases, or republishes an existing version; existing manual publisher instructions remain valid.

Failed/unpublished candidates can retry daily at 12:17 UTC or via manual dispatch of `npm release` on `main`, without another bump. Set repository variable `NPM_RELEASE_ENABLED` to anything other than `true` to stop new release plans; cancel pending runs separately when needed. Workflow validation is not evidence of a completed real OIDC publication.

## Verify this repo

Dated host qualification and live-service results are recorded in [Pi 1.0 qualification](PI_1_0_QUALIFICATION.md); they do not certify a new host or guarantee future service availability. For current qualification, use the shared qualifier with `--host official --target latest` and separately with the packed latest fork revision, selecting each consistent host graph before `npm run check:compat`. Plain `npm ci --ignore-scripts` installs only the locked development snapshot. The contract runs types, existing argument/transport smokes, native loading of all five resources, missing-auth rejection, loopback MCP search and private large-output checks, connected-session termination on reload, shutdown cleanup, and dry-run packing. It also starts the real bundled vision child with intercepted fetch and denied network to verify credential scoping and placeholder rejection. Use an empty HOME/agent profile. The compatibility gate deliberately excludes `npm audit` and never connects to Z.ai; audit and live service checks remain separate. This does not certify Z.ai availability or every advertised Node/platform target.

```bash
npm install
npm run lint
npm run ci
npm run check:compat
npm publish --dry-run
```

For install-path checks, use a temporary project so local `.pi/settings.json` changes do not affect another repo:

```bash
tmpdir="$(mktemp -d)"
cd "$tmpdir"
pi install -l /path/to/pi-zai-mcp
```

## Code quality

`oxlint.config.ts` uses type-aware linting and TypeScript diagnostics, with correctness, suspicious and performance categories blocking. It bans unsafe TypeScript, floating/misused promises, dishonest assertions, unfinished-work comments and inline lint suppressions. CI runs the same zero-warning policy; `lint` is no longer an alias for typechecking.

Production ceilings are complexity 10, depth 3, four parameters, 40 statements/function, 80 lines/function and 500 lines/file (excluding blank lines/comments). Existing fixture owners are bounded separately at 15/4/4/70/150/600; the native Pi execute adapter allows its SDK-required five parameters. No generated or declaration sources currently need exceptions.

`strict-void-return`, props-aware parameter mutation protection and readonly input checks remain blocking. Native/SDK/platform readonly allowances identify their declarations, not names alone. `no-await-in-loop` is global, with documented exceptions only for ordered authentication and shared environment/session vision scenarios. `require-await`, underscore naming and consistent-function-scoping are intentionally disabled; nullable-object conditions and shorthand void arrows are allowed.

Vitest assertion rules are configured with the actual assertion helpers, but Oxlint 1.87 does not recognize `node:test` blocks for `expect-expect`; `no-conditional-expect` recognizes imported Vitest `expect`, not this repo's Node `assert.*`. They are not claimed as native assertion guards. The runner remains `node:test`. Pedantic/style/restriction categories are not enabled wholesale.

```bash
npm run lint:fix    # Apply safe fixes; repair remaining findings
npm run lint:agent  # Blocking checks with agent-oriented diagnostics
```

## Current limits

- Requires a Z.ai API key, compatible Coding Plan entitlement and network access for real tool calls. Zread can reject public repositories that are not indexed upstream.
- The pi-facing API is curated. If upstream MCP schemas or tool names change, update this extension and docs intentionally.
- Verification includes strict Oxlint, TypeScript, focused contract smokes, native loopback HTTP and real offline vision-child execution, npm audit, packing, and independent official/fork host qualification. Offline checks do not certify service availability, subscription entitlement, live pricing, or every real network/cancellation phase.

## Project map

```text
extensions/zai-mcp-*.ts  # per-server pi package entrypoints plus status command
extensions/zai-mcp.ts    # legacy all-in-one entrypoint for direct local loading
src/index.ts             # shared MCP schemas, connections and execution
src/auth.ts              # native service-key precedence and ordered provider resolution
src/register-tool.ts     # typed native Pi tool adapter
src/tools.ts             # argument projection and bounded result rendering
src/output.ts            # private saved outputs and bounded MCP text
src/runtime-state.ts     # shared state for split entrypoints loaded as separate modules
src/servers.ts           # canonical MCP server definitions and legacy env allowlist
oxlint.config.ts         # strict type-aware lint policy
package.json             # npm + pi package manifest
CHANGELOG.md             # release notes
```
