# Tool and configuration reference

[Back to the README](../README.md)

## Other install options

Try the package for one session without adding it to your settings:

```bash
export Z_AI_API_KEY="your_z_ai_api_key"
pi -e npm:pi-zai-mcp
```

Or install from this repository:

```bash
pi install https://github.com/fitchmultz/pi-zai-mcp
```

For a local clone, see [development setup](development.md#local-setup).

## Configure

| Variable                                                 | Required | Default                    | Purpose                                                                                                                                                                                              |
| -------------------------------------------------------- | -------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Z_AI_API_KEY` / `ZAI_API_KEY` / `ZAI_CODING_CN_API_KEY` | Yes*     | none                       | Z.ai API key used for HTTP MCP Bearer auth and the vision stdio server. Env vars take precedence over pi's stored provider key.                                                                      |
| `Z_AI_MCP_SERVERS`                                       | No       | `all`                      | Optional env-var allowlist for direct/legacy loading. Prefer `pi config` for normal package installs; each server is now a separate extension resource.                                              |
| `Z_AI_MCP_TIMEOUT_MS`                                    | No       | `300000`                   | Connection/request timeout in milliseconds. Tool progress resets the request timer; this is not a strict total wall-clock or queue-wait deadline. Explicit overrides remain supported.               |
| `Z_AI_MODE`                                              | No       | credential platform        | Vision override: `ZAI` for global Z.AI, `ZHIPU` for China/BigModel. Explicit `PLATFORM_MODE` takes precedence.                                                                                       |
| `Z_AI_VISION_MODEL`                                      | No       | `glm-5.3-flash`            | Optional user override of the bundled vision server's model.                                                                                                                                         |
| `Z_AI_VISION_MODEL_MAX_TOKENS`                           | No       | `131072`                   | Optional user override of the bundled vision server's maximum output tokens.                                                                                                                         |
| `Z_AI_VISION_MODEL_TEMPERATURE`                          | No       | `1` for Flash/FlashX       | Vision sampling override; other models retain vendor defaults.                                                                                                                                       |
| `Z_AI_VISION_MODEL_TOP_P`                                | No       | `0.95` for Flash/FlashX    | Vision nucleus-sampling override; other models retain vendor defaults.                                                                                                                               |
| `Z_AI_BASE_URL`                                          | No       | vendor global standard API | Vision-only vendor setting, honored only when platform mode does not select a built-in endpoint; recognized `ZAI`/Zhipu modes replace it. Does not configure Pi's agent model or HTTP MCP endpoints. |

\* If env vars are unset, the extension asks the current Pi model registry to resolve the first available Z.ai provider API key. Pi owns its selected agent directory, stored credentials, templates, command resolution and caching. It checks `zai` (global), then `zai-coding-cn` (China), then configured catalog aliases whose `baseUrl` points at a Z.ai / Zhipu (BigModel) endpoint. Credential origin also selects the service platform: `Z_AI_API_KEY`/`ZAI_API_KEY` and native `zai` use global Z.AI; `ZAI_CODING_CN_API_KEY`, native `zai-coding-cn` and BigModel endpoint aliases use China. Ambiguous generic environment keys default to global—use the China alias for a China key. Global HTTP endpoints are `https://api.z.ai/api/mcp/{web_search_prime,web_reader,zread}/mcp`; [China endpoints](https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server) use `https://open.bigmodel.cn/api/mcp/{web_search_prime,web_reader,zread}/mcp`. The default vision mode follows the selected key; explicit vision platform/mode/custom settings remain authoritative and do not change HTTP MCP routing. Header-only model authentication does not replace this external service's required bearer API key. Run `/login` in pi and choose a ZAI provider to store this key.

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
- `image_source` — required for single-image actions except `ui_diff_check` and `analyze_video`. Local images support JPG/JPEG/PNG up to 5 MiB; HTTP/HTTPS URLs are passed through to the model service.
- `expected_image_source` and `actual_image_source` — required for `ui_diff_check`.
- `video_source` — required for `analyze_video`; local MP4/MOV/M4V up to 8 MiB.
- `output_type` — required for `ui_to_artifact`; `code`, `prompt`, `spec`, or `description`.
- `programming_language` — optional for OCR/code screenshots.
- `context` — optional for error diagnosis.
- `diagram_type` — optional for technical diagrams.
- `analysis_focus` — optional for data visualizations.

All four vision source fields accept a Pi-style leading `@`. Local relative paths resolve per call against `ctx.cwd`, not the parent process's working directory or the directory of the first vision connection. Absolute paths and HTTP/HTTPS URLs are preserved. Remote URLs are delegated to the service; local size checks do not certify a remote resource's size or availability.

## How it works

- `search`, `reader`, and `zread` use Z.ai Streamable HTTP MCP endpoints.
- `vision` uses the bundled `@z_ai/mcp-server` stdio server dependency through the current Node.js runtime. The extension no longer shells out to `npx` at tool-call time, so installed package behavior stays deterministic and does not depend on package-manager network access after install.
- The package exposes one extension file per MCP server (`zai-mcp-search.ts`, `zai-mcp-reader.ts`, `zai-mcp-zread.ts`, `zai-mcp-vision.ts`) plus a small status-command extension, so `pi config` can toggle servers independently.
- The extension registers curated tools synchronously so pi startup is fast and tool context stays small.
- Tool calls emit an immediate progress update so the TUI shows a Z.AI tool card while MCP connection or long vision/repository work is still running.
- Tool results use compact TUI rendering by default. Press Ctrl+O to expand a bounded, syntax-highlighted view without dumping very large MCP outputs into the terminal.
- Calls are serialized per upstream MCP server; queued calls respect cancellation. Cancelled or timed-out in-flight requests discard their owned transport. Vision waits for its child to exit before releasing the queue, including interrupted initialization, because the vendor ignores MCP cancellation. HTTP cancellation aborts local I/O without waiting for DELETE; its remote session can remain until server expiry. Remote execution/billing cancellation is not guaranteed.
- Server connections are lazy by default to avoid blocking pi startup on network or package-manager work; `/zai-mcp-status` reports this explicitly before first use.
- Upstream MCP errors and thrown transport errors remain failed calls. Both successes and oversized failures use bounded text and private saved full outputs. Small errors retain their original identity.
- Closed clients and expired HTTP session IDs are invalidated. The next explicit call resolves credentials and initializes a fresh connection; this extension never automatically replays a tool call. Ordinary upstream `isError` results keep a healthy connection. Status shows the latest bounded call/connection error and clears it after a successful call.
- `session_shutdown` cancels owned setup/calls, gives remote HTTP session termination one second, then closes each owned transport or vision child process once. Late setup and queued calls cannot revive a shutdown connection.
- Native programmatic callers receive a stable `{server, tool, text, truncated, file?}` outcome using the same bounded text and existing saved-file reference. Private/raw MCP details are not newly exposed.

## Security and data flow

- Pi extensions run with your local user permissions. Review code before installing any third-party pi package.
- The extension reads the explicit service aliases `Z_AI_API_KEY`, `ZAI_API_KEY`, or `ZAI_CODING_CN_API_KEY`, or asks the current Pi registry for a Z.ai provider API key; it neither parses credential files nor executes auth commands itself. It stores no credentials.
- HTTP MCP calls send the key as a Bearer token to Z.ai MCP endpoints.
- Vision calls start a local stdio MCP server and pass only the selected Z.ai key, the SDK's safe platform environment, and vendor settings (`Z_AI_MODE`, `PLATFORM_MODE`, `Z_AI_BASE_URL`, `Z_AI_VISION_MODEL`, `Z_AI_VISION_MODEL_TEMPERATURE`, `Z_AI_VISION_MODEL_TOP_P`, `Z_AI_VISION_MODEL_MAX_TOKENS`, `Z_AI_TIMEOUT`, `Z_AI_RETRY_COUNT`, `SERVER_NAME`, `SERVER_VERSION`, `ZAI_MCP_LOG_PATH`). Other provider credentials and `NODE_OPTIONS` are not forwarded. Placeholder vision keys fail rather than falling back to another provider's token. The vendor records prompts/image paths in logs; set `ZAI_MCP_LOG_PATH` to your chosen private or non-persisting destination to avoid its default `~/.zai` log files.
- Truncated full outputs are written under your OS temp directory in owner-only directories (0700) and files (0600).

### Bundled vision boundaries

`@z_ai/mcp-server@0.1.5` enables thinking but sends no explicit reasoning effort, so the service default (`max`) applies. It calls the standard Chat Completions endpoint with MCP identification headers rather than Pi's coding-model endpoint. Its handlers ignore MCP cancellation, and its tools internally retry errors up to twice. `Z_AI_RETRY_COUNT` is passed through and parsed, but does not control those hardcoded retries in this vendor release. The extension's no-replay guarantee does not remove vendor-internal retries; disposal contains local outstanding work, not remote billing.

The vendor logs prompts and paths to its own files. Ignoring stderr avoids backpressure and sensitive terminal output; it does not suppress file logs. Model, token, sampling, timeout, mode, custom URL and log-path controls remain available. Do not infer native agent reasoning/history/streaming behavior from this single-turn analysis client.

## Current limits

- Requires a Z.ai API key, compatible Coding Plan entitlement and network access for real tool calls. Zread can reject public repositories that are not indexed upstream.
- The pi-facing API is curated. If upstream MCP schemas or tool names change, update this extension and docs intentionally.
- Verification includes strict Oxlint, TypeScript, focused contract smokes, native loopback HTTP and real offline vision-child execution, npm audit, packing, and independent official/fork host qualification. Offline checks do not certify service availability, subscription entitlement, live pricing, or every real network/cancellation phase.

## Z.AI MCP coverage review (2026-10-12)

Reviewed the [quick start](https://docs.z.ai/guides/overview/quick-start), [GLM-5.3](https://docs.z.ai/guides/llm/glm-5.3), [Flash/FlashX](https://docs.z.ai/guides/vlm/glm-5.3-flash), [migration](https://docs.z.ai/guides/overview/migrate-to-glm-new), capability and Coding Plan/MCP documentation on **2026-10-12**:

- GLM-5.3 is text-only; GLM-5.3-Flash/FlashX are multimodal. All advertise 1M context and 128K maximum output, forced reasoning, streaming, function calling, context caching and structured output. Pi's actual input capabilities and configured context limits still govern the session.
- GLM-5.3 and Flash are available on the Coding Plan; FlashX is not currently available on that plan.
- All four MCP services require a compatible **GLM Coding Plan**, not merely an API key. At the review date, credits-based plans charge 1.2 credits per search/reader/Zread call; vision uses Flash token multipliers. Legacy plan accounting can differ. See [usage policy](https://docs.z.ai/devpack/usage-policy) and [FAQ](https://docs.z.ai/devpack/faq).
- Web Search MCP documents web search with query, domain filter, recency filter, content size, and location options. The current remote MCP tool is `web_search_prime`.
- Web Reader MCP documents URL reading with timeout, cache, Markdown/text, image retention, GFM, image data URL, image summary, and link summary options. The current remote MCP tool is `webReader`.
- Zread MCP documents `search_doc`, `read_file`, and `get_repo_structure` for public GitHub repository search, file reading, and structure inspection.
- Vision MCP documents UI artifact generation, screenshot OCR, error screenshot diagnosis, technical diagram understanding, data visualization analysis, UI diff checking, image analysis, and video analysis. The bundled npm package (`@z_ai/mcp-server@0.1.5`) exposes the image/video actions as `analyze_image` and `analyze_video`.

The pi-facing API is intentionally smaller than the upstream MCP tool list. Upstream MCP names are implementation details; agents see four stable tools with clear arguments. Vendor prose still uses `webSearchPrime`, `image_analysis` and `video_analysis`; the exercised global search and installed vision contracts use `web_search_prime`, `analyze_image` and `analyze_video`. Do not rename from stale prose alone. China remote names follow the corresponding documented services; offline routing checks do not prove live China entitlement or schema parity.

Z.AI also documents Slide/Poster, Translation, and Video Effect Template agents as API agents, not MCP servers. They are not registered as MCP tools by this package unless Z.AI publishes MCP endpoints for them.
