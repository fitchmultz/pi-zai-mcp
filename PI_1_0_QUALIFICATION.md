# Pi 1.0 qualification

## Current contract

Pi 1.0.0 is the supported floor. The five declared resources remain four curated Z.AI tools plus the status command. Connections are lazy and paid calls still require the existing user-intent and credential checks. Pi's native MCP feature is not a replacement for these curated tools or their bounded output and cancellation behavior.

Service credentials use the explicit Z.AI environment variables first, then the native model registry's provider authentication for `zai`, `zai-coding-cn`, or catalog aliases with Z.AI endpoints. Pi owns credential-command expansion and caching; the extension does not read `auth.json`, execute shell templates, or retain a session context. The missing-key startup warning checks credential availability without resolving a command. Model headers alone do not supply a bearer key for this separate service.

Native `outputSchema`/`structuredContent` contain only the existing bounded server/tool/text outcome, truncation flag and optional saved-file reference, not raw upstream MCP data. Shutdown aborts owned setup and requests, closes once, rejects queued calls and prevents late setup from publishing a client. Failures render as failures, never success, and are not automatically replayed.

## Evidence — 2026-10-01

- Base: `c7547ea244d5446525829c1878139af3bf494929`.
- Official Pi source: `a13d35a742c6ef8462812a28fbe1d8c8b7431c32` (v1.0.0). SDK SHA256 `5482298b995db935f7b96f5d6056fa1c36ac6fc80456be594ef65b83c62b0d30`; bundled CLI SHA256 `e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774`.
- Physical Node 24.21.0, eight Pi companion packages at 1.0.0, TypeBox 1.3.27. Checks use isolated HOME/agent profiles and explicit selected `PI_PACKAGE_DIR`; inherited live-fork overrides are discarded.
- `npm run ci`: typecheck, smoke, production dependency audit (zero vulnerabilities) and package dry-run passed. Existing compatible transitive dependency patches repair the initial production audit failures; production dependency ranges are unchanged.
- `npm run check:compat`: typecheck, smoke and the native SDK lifecycle fixture passed (one suite, zero skipped/failed). Native loopback MCP initialization, bounded structured outcomes, failure/no replay, reload/shutdown, auth resolution/cache and teardown-during-setup are exercised without paid calls.
- Source and extracted package: ordinary ESM import, actual bundled CLI registration, absolute official SDK registration/schema/reload/shutdown checks. Observers assert the selected SDK/CLI hashes and complete cohort, not only a version label.
- Installed bundled vision server: actual stdio initialize and tool listing expose all eight curated actions. The child has network denied and an opaque fixture credential; no vision tool is invoked.
- Fullscreen and regular actual CLI fixtures inspected at 48/100/160 columns, after resizing, collapsed and expanded. Unicode, bounded long output and a tool failure remain readable; the failure shows `failed` and the original failure text. Fixture HTTP/faux-model responses are owned and offline.

Local logs: `/tmp/zai-mcp-pi100-{ci,check,vision,esm,source-probe,packed-probe}.log`. Source/packed identity proofs: `/tmp/pi100-native-services/zai-mcp-{source,packed}-proof/identity.json`. UI captures: `/tmp/pi100-native-services/zai-mcp-{fullscreen,regular}-{48,100,160,expanded}.txt`, with host identity observations alongside them. Owned UI processes are stopped after inspection.

## Delivery boundaries

Recommended unused version: **0.2.0**, through the existing owned npm and GitHub release channels after parent review. No publication, tag or merge is part of this implementation. The older 0.87 cohort-only PR is not overwritten or cherry-picked.

The live fork, managed packages, settings and authentication are untouched. A future minimal 1.0 fork has no immutable qualified candidate yet; official checks do not certify that fork. No paid/provider request, live credential flow, user app mutation, live activation/reload/restart or manually triggered remote CI was attempted. Node 22.19 remains the existing manifest minimum, not a new runtime qualification claim; this evidence is on Node 24.21.0. The official pinned development cohort's audit advisory is not counted as a production dependency finding.
