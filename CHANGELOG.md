# Changelog

All notable changes to this project are documented here.

## Unreleased

### Changed
- Updated the local pi package baseline to `@earendil-works/*` `0.78.0` and regenerated the npm lockfile.
- Aligned Node.js engine range to `>=22 <25` and pinned `packageManager` to `npm@11.0.0`.
- Reviewed the pi `0.78.0` changelog; no extension API migrations were required.

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
