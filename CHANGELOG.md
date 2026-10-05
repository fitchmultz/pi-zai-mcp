# Changelog

All notable changes to this project are documented here.

## 0.2.3 - 2026-10-05

- Complete strict Oxlint and Oxfmt integration with reproducible locked tooling, editor settings, comment-aware suppression enforcement and a canonical acceptance/CI gate.
- Enable independent strict checked-JavaScript/TypeScript return-path analysis; preserve explicit native and exported contracts with declaration-qualified allowances.
- Keep cohesive tests exempt from size/statement limits while retaining branching/parameter limits. Permit only explained, reproduced callback/lifecycle/validator exceptions; keep unsafe types, floating promises and nearby checks blocking.
- Add real-CLI configuration regressions with precise diagnostics and fail-closed child handling, deterministic paused lifecycle guards, control-validator inputs and preserved checker limitations.
- Preserve all-checked JavaScript coverage with effective-scope and language-boundary regressions; verify semantic lint and compiler diagnostics independently.
- Reject multiline disable-comment rule smuggling and compiler-recognized suppression suffixes in the comment-aware policy gate.
- Separate cohesive curated schemas/metadata from MCP lifecycle ownership, restore native runtime equality assertions and remove redundant callback annotations without changing service behavior.
- Keep npm-owned lockfile formatting, native asynchronous ordering/cancellation, environment isolation, argument-presence semantics and all four curated tools intact.

## 0.2.2 - 2026-10-05

- Align GLM-5.3-Flash/FlashX vision sampling with Z.AI's recommended temperature 1 / top-p 0.95 while preserving explicit overrides and other-model defaults.
- Normalize custom-mode vision base URLs before the bundled client appends its request path, and raise the MCP deadline to 300 seconds to match the vendor's default vision deadline.
- Refresh GLM-5.3/Flash model, reasoning, endpoint, entitlement and usage guidance. Keep native agent configuration in Pi rather than adding a second model client.
- Strengthen evidence-oriented tool guidance: full-page reading, source citations, untrusted retrieved content and saved-output recovery. Correct the unsupported claim that shorter search summaries lower per-call MCP credits.
- Add strict type-aware Oxlint and zero-warning gates with unsafe TypeScript bans, readonly input contracts, scoped production/fixture complexity ceilings and blocking lint/TypeScript suppression guards. Repair all findings and apply the owner's final rule refinements, retaining strict void/mutation safety and narrow sequential/native interoperability allowances.
- Replace artificial auth recursion and promise-reduced vision scenarios with ordered loops; use native platform declarations instead of duplicated handle types. Document the Vitest rules' actual limits with the retained `node:test` runner.
- Keep large MCP responses safe from JavaScript spread-argument limits; verify complete private saved output with 160,000 text blocks.
- Refresh the coherent Pi 1.0.3 development snapshot and remove obsolete vulnerable development dependencies. Independently qualify latest official Pi and maintained fork, and exercise all four live MCP services with public fixtures.

## 0.2.1 - 2026-10-02

- Upgrade the bundled vision server to `@z_ai/mcp-server@0.1.5`, adopting its upstream `glm-5.3-flash` model and 131,072-token output limit (previously `glm-4.6v` and 32,768). No old-model override or lower cap is imposed.
- Disclose the higher potential output cost ceiling. Offline startup/tool and intercepted-child checks pass; live model availability, pricing and paid calls remain unverified.
- Scope the vision subprocess environment to the selected Z.ai credential, safe platform variables and explicit vendor options, including the user's `ZAI_MCP_LOG_PATH` logging destination. Unrelated provider credentials and Node preload hooks no longer reach the child; placeholder keys cannot borrow another provider's token.
- Save full truncated outputs in unique private directories (0700) with exclusive owner-only files (0600), including on shared-temp platforms with umask 022.
- Verify both boundaries through native tool execution, a loopback MCP fixture and an offline real vision child. No paid service request is made.
- Refresh the locked MCP SDK to 1.31.0 and Hono node-server to 2.1.3, retaining the Node>=22.19 floor and optional wildcard host peers.

## 0.2.0 - 2026-10-01

- Modernize the development cohort and suggested support floor to Pi 1.0.0, retaining optional wildcard host peers and all four curated paid MCP workflows.
- Use the root `StringEnum` export and current host registry authentication. Preserve explicit service-key alias precedence, built-in/global/China provider ordering and configured Z.AI catalog aliases; remove duplicate credential-file parsing and synchronous auth-command execution.
- Expose bounded existing curated outcomes through native `outputSchema`/`structuredContent`, without raw/private MCP result expansion.
- Cancel owned connections/calls and make teardown idempotent; late setup and queued work cannot publish clients after shutdown/replacement.
- Use native renderer error state so failed calls are labeled failed rather than done; preserve bounded failure text.
- Refresh existing production transitive dependency patches required by the normal `npm audit --omit=dev` gate; keep the bundled vision server and transport APIs unchanged.

## 0.1.21 - 2026-08-21

### Fixed

- replaced the `socket-firewall.workos.dev` proxy URLs that leaked into `package-lock.json` (dependency updates made behind a corporate proxy) with `registry.npmjs.org` URLs; integrity hashes are unchanged, so installs from any network work again
- note: the 0.1.20 npm publish silently failed for this reason, so npm jumped from 0.1.19 directly to 0.1.21

## 0.1.20 - 2026-08-09

### Security

- resolved all `npm audit` production findings: bumped `@modelcontextprotocol/sdk` to 1.30.0 with patched transitive `fast-uri`, `ip-address`, and `hono`, and forced `@hono/node-server` >= 2.0.12 tree-wide via npm `overrides`; `@z_ai/mcp-server` stays 0.1.4 (newest) instead of the downgrade `npm audit fix --force` proposed
- verified the upgraded tree against real behavior: stdio spawn of the bundled `zai-mcp-server`, a full MCP initialize handshake, and `tools/list` returning the complete vision toolset

## 0.1.19 - 2026-07-16

### Changed

- refreshed the tested Pi development lock and compatibility guidance to 0.80.9; the MCP tools do not use the removed SDK model/auth options

## 0.1.18 - 2026-07-14

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
