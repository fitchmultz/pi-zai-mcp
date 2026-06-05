# Changelog

All notable changes to this project are documented here.

## Unreleased

## 0.1.6 - 2026-06-05

### Changed
- Replaced generic MCP list/call tools and per-upstream-tool wrappers with four curated pi tools: `z_ai_search`, `z_ai_reader`, `z_ai_zread`, and `z_ai_vision`.
- Moved upstream MCP tool names behind stable pi-facing actions and arguments to reduce tool context bloat and agent confusion.
- Refreshed README coverage and tool-reference docs against the 2026-06-05 Z.AI GLM-5.1, agent, MCP, and coding-agent best-practice docs.
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
