# Changelog

All notable changes to this project are documented here.

## Unreleased

### Changed
- refreshed the tested Pi development lock and compatibility guidance to 0.80.7

## 0.1.17 - 2026-07-11

### Fixed
- raced Pi cancellation against the full MCP connection lifecycle and close failed/cancelled transports, preventing leaked HTTP connections or vision child processes before retry
- bounded remote HTTP session termination during shutdown and always close transports so reload/exit cannot hang on the DELETE request
- matched the Pi 0.80.6 five-argument tool execute contract explicitly across all four curated tools

### Changed
- updated the tested Pi development baseline and compatibility guidance to 0.80.6
- refreshed local Pi/type dependencies and added smoke assertions for execute order and prompt-routing metadata across all declared tool entrypoints

## 0.1.16 - 2026-07-02

### Fixed
- resolved the auth.json key fallback through all Z.ai providers instead of only the built-in `zai` provider; the extension now also recognizes the built-in `zai-coding-cn` (China) provider, the `ZAI_CODING_CN_API_KEY` env var, and custom `models.json` providers whose `baseUrl` points at a Z.ai / Zhipu (BigModel) endpoint

### Validation
- ran `npm run ci`
- added focused smoke coverage for `zai-coding-cn`, `ZAI_CODING_CN_API_KEY`, and custom `models.json` Z.ai provider key fallback

## 0.1.15 - 2026-06-27

### Changed
- split the package manifest into per-server extension entrypoints (`zai-mcp-search`, `zai-mcp-reader`, `zai-mcp-zread`, `zai-mcp-vision`) plus a status-command entrypoint so `pi config` can toggle MCP servers independently

### Validation
- ran `npm run ci`
- ran focused Pi split-entrypoint status smokes

## 0.1.14 - 2026-06-26

### Changed
- defaulted `z_ai_search.content_size` to `high` while preserving explicit `medium` for lower quota use

### Validation
- ran `npm run ci`

## 0.1.13 - 2026-06-25

### Added
- added a best-effort fallback to pi's stored `zai` provider key in `auth.json` when `Z_AI_API_KEY` and `ZAI_API_KEY` are unset, while preserving env-var precedence

### Fixed
- resolved the API-key fallback through pi's actual agent directory (`getAgentDir()` / `PI_CODING_AGENT_DIR`) instead of assuming `<config>/agent/auth.json`

### Validation
- ran `npm run ci`
- ran `npm run release:dry-run`
- ran isolated pi package-load smokes with `PI_CODING_AGENT_DIR` and `pi install -l --approve /Users/mitchfultz/Projects/AI/pi-zai-mcp`

## 0.1.12 - 2026-06-24

### Fixed
- stopped storing raw MCP responses in pi tool result details after truncating model-visible output, preventing large web/reader/vision payloads from bloating session JSONL
- refreshed production dependency locks so the MCP SDK resolves to a patched `hono` release and `npm audit --omit=dev` is clean
- hardened `/zai-mcp-status` output so protocol modes do not write direct status JSON to stdout
- normalized Pi-style leading `@` on Z.AI vision path arguments before forwarding them to MCP

### Changed
- updated the README compatibility baseline to pi `0.80.2`
- added a lightweight smoke script and `npm run ci` validation entrypoint for tool registration, server filtering, status-mode output, missing-key failure, truncation metadata, and vision path normalization

### Validation
- ran `npm run release:dry-run`
- ran an isolated Pi RPC package-load and `/zai-mcp-status` smoke with pi `0.80.2`
- ran a real `z_ai_search` smoke and confirmed raw MCP responses are not stored in tool result details

## 0.1.11 - 2026-06-23

### Changed
- updated the local pi development baseline to `@earendil-works/*` `0.80.1` and refreshed the npm lockfile
- refreshed the README compatibility note
- moved the `StringEnum` import to `@earendil-works/pi-ai/compat`, matching the Pi 0.80 source typechecking migration guidance

### Validation
- Pending in this release train.

## 0.1.10 - 2026-06-22

### Changed
- updated the local pi development baseline to `@earendil-works/*` `0.79.10` and refreshed the npm lockfile
- refreshed the README compatibility note and removed the obsolete `.pi-fleet-tested-version` marker

### Validation
- ran `npm run typecheck` and an isolated Pi package-load smoke under pi `0.79.10`

## 0.1.9 - 2026-06-17

### Fixed
- Corrected the README compatibility note to the current tested pi baseline `0.79.1` (tracked in `.pi-fleet-tested-version`) instead of the stale `0.78.1`.

### Validation
- doc-only release; ran `npm run typecheck` and confirmed the README baseline matches `.pi-fleet-tested-version`.

## 0.1.8 - 2026-06-17

### Changed
- Refactored tool registration: collapsed the four per-tool `register*Tool` functions into one data-driven `registerCuratedTool` registrar backed by a `REGISTRARS` map keyed by server id, so adding a server is one map entry instead of a new function plus registration branches.
- Replaced the `zreadArgs` and `visionArgs` if-ladders with declarative action-argument tables and a single `buildArgs` helper.
- Removed the no-op `zreadToolName`/`visionToolName` pass-through wrappers; the action string is used directly as the upstream MCP tool name.

### Fixed
- Synced the MCP client `version` metadata with `package.json` (previously a hardcoded `0.1.6` that drifted behind the published version) by reading it through the existing `createRequire`.

### Validation
- ran `npm run typecheck` and a full Z.AI capability smoke: `z_ai_search`, `z_ai_reader`, all three `z_ai_zread` actions, and all eight `z_ai_vision` actions through the refactored registration and argument tables under pi `0.79.4`.

## 0.1.7 - 2026-06-15

### Changed
- updated the local pi development baseline to `@earendil-works/*` `0.79.4` and refreshed the npm lockfile

### Validation
- ran `npm run typecheck`, fake-pi load/registration smoke, and a bounded Z.AI search smoke under pi `0.79.4`

## 0.1.6 - 2026-06-05

### Changed
- Replaced generic MCP list/call tools and per-upstream-tool wrappers with four curated pi tools: `z_ai_search`, `z_ai_reader`, `z_ai_zread`, and `z_ai_vision`.
- Moved upstream MCP tool names behind stable pi-facing actions and arguments to reduce tool context bloat and agent confusion.
- Refreshed README coverage and tool-reference docs against the 2026-06-05 Z.AI GLM-5.2, agent, MCP, and coding-agent best-practice docs.
- Clarified `/zai-mcp-status` output so lazy, not-yet-opened server connections are not mistaken for unavailable tools.
- Added compact custom TUI renderers with Ctrl+O expansion, bounded output previews, and JSON syntax highlighting for Z.AI tool results.
- Increased the default MCP timeout to 180 seconds because vision and repository-search actions can exceed 30 seconds in normal use.
- Added immediate progress updates and per-server MCP call serialization so long calls show a useful TUI card early and concurrent calls do not contend for the same upstream transport.
- Switched tool enum schemas to pi's Google-compatible `StringEnum` helper and added the matching `@earendil-works/pi-ai` peer/dev dependency alignment.
- Changed upstream MCP `isError` responses to fail pi tool calls, made queued calls cancellation-aware, and guarded `/zai-mcp-status` output for non-UI modes.
- Tightened collapsed tool-call summaries so long URLs stay compact in the TUI.

## 0.1.5 - 2026-06-04

### Changed
- Updated the local pi package baseline to `@earendil-works/pi-coding-agent` `0.78.1` and regenerated the npm lockfile while keeping pi runtime peers as optional wildcards.
- Reviewed the pi `0.78.1` changelog, extension docs, package docs, and current extension examples; no hard pi version requirement was added.
- Tightened Z.ai server-id tool schemas to enum schemas that are friendlier to provider tool-calling implementations.
- Removed the runtime `npx` fallback for the bundled vision MCP server and now launches the installed `@z_ai/mcp-server` entrypoint with the current Node.js runtime.
- Dropped the unused direct `@earendil-works/pi-ai` package peer/dev dependency because this extension imports only `@earendil-works/pi-coding-agent` and `typebox` from pi runtime packages.

## 0.1.4 - 2026-05-28

### Changed
- Updated the local pi package baseline to `@earendil-works/*` `0.77.0` and regenerated the npm lockfile.
- Kept pi runtime packages as optional wildcard peers and removed the Node.js engine upper bound so future pi releases are not blocked at install time.
- Reviewed the pi `0.77.0` changelog; no extension API migrations were required.

## 0.1.3 - 2026-05-27

### Changed
- Updated the local pi package baseline to `@earendil-works/*` `0.76.0` and regenerated the npm lockfile.
- Reviewed the pi `0.76.0` changelog; no extension API migrations were required.

## 0.1.2 - 2026-05-23

### Changed
- Updated the local pi package baseline to `@earendil-works/*` `0.75.5` and regenerated the npm lockfile.
- Reviewed the pi `0.75.5` changelog and package guidance; peer dependencies remain aligned with pi package best practices.

## 0.1.1 - 2026-05-18

### Changed
- Updated the local pi package baseline to `@earendil-works/*` `0.75.3`, including the Node.js `>=22.19.0` runtime floor and refreshed npm lockfile.
- Ignored local `.cueloop/` runtime state.

## 0.1.0 - 2026-05-11

### Added
- Initial public release of `pi-zai-mcp`.
- Pi package extension entrypoint for Z.ai MCP tools.
- Generic MCP tool discovery and call tools for search, reader, zread, and vision servers.
- Dynamic wrapper registration for discovered Z.ai MCP tools.
- Output truncation to pi's standard 50 KB / 2000 line limits with full output saved to a temp file.
- Release metadata, MIT license, and npm/GitHub install documentation.

### Changed
- Package layout now uses a conventional `extensions/` entrypoint for public pi package installs.
- Z.ai MCP discovery no longer runs by default during extension startup; call `z_ai_mcp_list_tools` or set `Z_AI_MCP_AUTO_DISCOVER=1` to discover wrappers.

### Security
- Vision MCP server execution is pinned to `@z_ai/mcp-server@0.1.4` when the local dependency is unavailable.
