# pi-zai-mcp

Add Z.AI web search, page reading, public GitHub research, and image/video analysis to your Pi session. Ask Pi to check current documentation or explain a screenshot, and it can use these four tools while you keep working.

![Pi sends research requests to Z.AI HTTP MCP services and visual requests through a bundled local vision server, then receives text results.](.github/readme/tool-flow.png)

_Four tools connect on demand; Pi keeps control of your coding model and conversation._

## Start here

You need [Pi](https://pi.dev), Node.js **22.19 or newer**, and a Z.AI API key with a compatible **GLM Coding Plan**. This is an unofficial community package maintained by Mitch Fultz.

```bash
pi install npm:pi-zai-mcp
export Z_AI_API_KEY="your_z_ai_api_key"
pi
```

Inside Pi, run `/zai-mcp-status` to see the enabled services, then try:

> Use z_ai_search to find the latest Node.js release notes, then use z_ai_reader to summarize the official page and cite its URL.

Services connect on their first tool call. `lazy_not_connected_until_first_use` in the status output is expected before then; startup makes no paid tool calls. Real calls need network access and consume your plan's usage allowance—check [Z.AI's usage policy](https://docs.z.ai/devpack/usage-policy) for current pricing.

Already signed into Z.AI through Pi's `/login`? You can use that stored key instead of setting an environment variable. The extension also accepts `ZAI_API_KEY` and `ZAI_CODING_CN_API_KEY`; environment variables take precedence. Pi **1.0.0** is the suggested support floor.

For all arguments and settings, see the [tool and configuration reference](docs/reference.md).

## What you can ask it to do

| Tool          | Useful for                                                             | Example request                                               |
| ------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| `z_ai_search` | Current web information, with domain and recency filters               | “Find recent announcements from docs.z.ai.”                   |
| `z_ai_reader` | Full pages as Markdown or text                                         | “Read this documentation URL and summarize the setup steps.”  |
| `z_ai_zread`  | Search, files, and directory structure in public GitHub repos          | “Use Zread to explain how vitejs/vite handles configuration.” |
| `z_ai_vision` | Screenshots, OCR, diagrams, charts, UI comparisons, images, and videos | “Use vision to explain the error in /path/to/screenshot.png.” |

Vision needs a local file path or remote URL. For a UI comparison, supply both reference and actual screenshots. Video analysis supports MP4, MOV, and M4V files up to 8 MB. Zread may reject repositories that Z.AI has not indexed.

Pi shows progress while a call runs and a compact result when it finishes. Press **Ctrl+O** to expand the tool output. Large results are limited to 50 KB or 2,000 lines, with the full text saved in a private temporary file whose path appears in the result. Saved files remain until you or your OS removes them.

## Choose your tools

Run `pi config`, open the resources for `pi-zai-mcp`, and enable or disable each server independently:

- `extensions/zai-mcp-search.ts`
- `extensions/zai-mcp-reader.ts`
- `extensions/zai-mcp-zread.ts`
- `extensions/zai-mcp-vision.ts`

Keep `extensions/zai-mcp-status.ts` enabled for `/zai-mcp-status`. Disabling vision leaves the three research tools available.

If a call fails, run `/zai-mcp-status` and check `lastError`, your API key, plan entitlement, and network connection. The [reference](docs/reference.md#configure) covers timeouts, vision settings, and the legacy server allowlist.

## Other ways to install

Try the package for one session without adding it to your settings:

```bash
export Z_AI_API_KEY="your_z_ai_api_key"
pi -e npm:pi-zai-mcp
```

Or install from this repository:

```bash
pi install https://github.com/fitchmultz/pi-zai-mcp
```

For a local clone, see [development setup](docs/development.md#local-setup).

## Privacy and cost

Pi extensions run with your local user permissions, so review third-party code before installing. These tools send requests to Z.AI; vision analysis sends the visual input through a bundled local server to Z.AI's API.

The extension stores no credentials and forwards only the selected Z.AI key and allowed settings to the vision child. The bundled vision server logs prompts and image paths under `~/.zai` by default. Set `ZAI_MCP_LOG_PATH` to a private or non-persisting destination if you need different logging behavior. Treat retrieved pages and repository text as untrusted content.

Vision defaults to `glm-5.3-flash` with a 131,072-token output ceiling. Generated output can increase per-call cost; you can set `Z_AI_VISION_MODEL_MAX_TOKENS` to a smaller ceiling. See [security and data flow](docs/reference.md#security-and-data-flow) and the [configuration reference](docs/reference.md#configure) for details.

## Learn more

- [Tool and configuration reference](docs/reference.md): every argument, environment setting, transport, and service limitation.
- [Using GLM models with Pi](docs/glm-setup.md): coding-model setup, reasoning, endpoints, and sampling guidance. Your Pi model is configured separately from these MCP tools.
- [Development and maintenance](docs/development.md): local setup, verification, code-quality policy, project map, and releases.
- [Changelog](CHANGELOG.md) and [dated Pi qualification results](PI_1_0_QUALIFICATION.md).
- [Report a problem](https://github.com/fitchmultz/pi-zai-mcp/issues).

## License

[MIT](LICENSE) — Mitch Fultz.
