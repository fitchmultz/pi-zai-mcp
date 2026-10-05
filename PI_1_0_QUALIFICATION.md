# Pi 1.0 qualification

## Current contract

Pi 1.0.0 remains the suggested support floor, not a hard runtime pin. The five declared resources remain four curated Z.AI tools plus the status command. Connections are lazy and paid calls still require the existing user-intent and credential checks. Pi's native MCP feature is not a replacement for these curated tools or their bounded output and cancellation behavior.

Service credentials use the explicit Z.AI environment variables first, then the native model registry's provider authentication for `zai`, `zai-coding-cn`, or catalog aliases with Z.AI endpoints. Pi owns credential-command expansion and caching; the extension does not read `auth.json`, execute shell templates, or retain a session context. The missing-key startup warning checks credential availability without resolving a command. Model headers alone do not supply a bearer key for this separate service.

Native `outputSchema`/`structuredContent` contain only the existing bounded server/tool/text outcome, truncation flag and optional saved-file reference, not raw upstream MCP data. Shutdown aborts owned setup and requests, closes once, rejects queued calls and prevents late setup from publishing a client. Failures render as failures, never success, and are not automatically replayed.

## GLM-5.3 quality and strict lint qualification — 2026-10-05

The 0.2.2 source was qualified independently through the shared qualifier at automation `3b7a5f72d9c2d67d6fb53ef7bd308b005c385af3`, freezing these latest targets once for this run:

| Target                | Exact identity                                         | SDK / bundled CLI SHA-256                                                                                                               |
| --------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Official Pi 1.0.3     | npm gitHead `d78dc83d633229d12f8b79631384c4c2717c399f` | `5482298b995db935f7b96f5d6056fa1c36ac6fc80456be594ef65b83c62b0d30` / `e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774` |
| Maintained fork 1.0.3 | main `b6a8488fa2a6757ece93a38d3982afa0d92bbbb5`        | `b1f7803e797740d70d30d6b56a4f6845da1f233ac354ffa38f1810a6902941c6` / `548f0205847f5fc9c1982f227d783c3db27dbacccc73805e3f961ab47f41fe85` |

Both used physical Node 24.21.0, npm 11.19.0, eight coherent Pi runtime companions at 1.0.3 and host TypeBox 1.3.27. The fork's complete native public-package receipt contains 13 archives, including `pi-durable`; selected graphs are not inferred from the extension's development lock. Isolated development contracts, fresh Git/npm consumers, native SDK loading and actual bundled CLI registration passed on both targets. All four native tests passed with zero skips. Packed executable source was byte-compared with the frozen worktree.

Oxlint 1.87.0 and oxlint-tsgolint 7.0.2003 implement the requested safety policy with type-aware linting, TypeScript diagnostics and warning denial. The initial 78-rule policy was qualified, then updated with the owner's final refinements: disable `require-await`, underscore naming and consistent-function-scoping; allow nullable-object conditions and shorthand void arrows; configure Vitest assertion helpers; distinguish production/fixture complexity ceilings; retain strict void-return, props-aware mutation, global await-loop protection and declaration-qualified readonly allowances.

Final lint has zero diagnostics across 18 files/246 effective rules. All separate TypeScript checks, smokes, native contracts, packing and audits passed. Original negative controls demonstrated unsafe `any`, floating promises, mutation/readonly violations, same-name exception precision, TypeScript TS2322, targeted/block lint and TypeScript suppression rejection, and warning-only exit failure. A further 31 installed-binary controls validate the final options, assertion helper recognition, native-rule limits, complexity scopes, readonly declaration matching and retained safety rules. No lint debt is deferred.

Production ceilings remain 10/3/4/40/80/500; existing fixture owners use bounded 15/4/4/70/150/600. The native execute callback retains its five-parameter allowance; no generated/declaration files exist. Await-loop exceptions are confined to ordered native authentication and shared native vision scenarios. Real native handle declarations replace handwritten platform facades; useful project-owned readonly collections and consumed SDK method contracts remain. Ordered loops replace recursive authentication and promise-reduced scenarios without changing auth priority or vision behavior.

Installed controls prove `vitest/expect-expect` ignores `node:test` imports and `t.test`, while `vitest/no-conditional-expect` recognizes imported Vitest `expect` even inside native callbacks but ignores Node `assert.*`. Both are configured as requested, with no false native assertion-coverage claim, runner substitution or custom assertion guard. Both frozen hosts were requalified after these refinements: native 4/4 with zero skips, fresh Git/npm consumers, actual SDK/CLI and packed executable-byte parity all passed.

The native large-output owner first reproduced a spread-argument `RangeError` with 160,000 valid MCP text blocks, then passed after loop-based aggregation. It checks complete saved bytes and private 0700/0600 modes. Offline real-child vision cases cover default Flash, FlashX, unrelated/custom-prefix models, explicit sampling/custom URLs, empty-URL vendor fallback and credential isolation.

Separate authenticated checks used only public documentation/repositories and a generated red/blue PNG:

- Native GLM-5.3 and Flash each completed a streamed two-round tool cycle at enabled/max reasoning, temperature 1/top-p 0.95, with parsed arguments and exact preserved reasoning replay. The intentional local GLM-5.3 400,000-token context cap remained intact.
- Native Flash image input on the activated b6 fork returned red-left/blue-right and matched the enabled/max/sampling payload.
- All four real MCP tools succeeded through the native validated tool boundary: search, full-page reader, Zread `vitejs/vite/package.json`, and bundled vision image analysis. Zread initially rejected this small extension repository as not found; the indexed public Vite fixture succeeded. Public repository access is therefore subject to upstream indexing, not guaranteed for every GitHub repository.

These observations prove exercised request/response behavior and account access at the time, not comparative coding quality, billing, universal availability, or every HTTP/stdio cancellation phase. No private project content, credentials or reasoning text was included in receipts. Historical sections below retain their original scope.

Final amended evidence: `/tmp/zai-quality-amended-{official,fork}-qualification/qualification.json` and `probes/`; `/tmp/zai-quality/final-amendments/{receipt.md,controls-results.json,frozen-inputs.json}`. Initial-policy evidence: `/tmp/zai-quality-final-{official,fork}-qualification/qualification.json` and `probes/`; `/tmp/zai-quality-hosts-final/fork-package/receipt.json`; `/tmp/zai-quality/{qualified-source-hashes,live-model-receipt,live-native-image-receipt,live-mcp-receipt}.json`; `/tmp/zai-updated-*.txt`. Later evidence-only documentation changes do not alter the qualified executable source.

## Vision dependency defaults — 2026-10-02

Merged dependency update #11 (`35040ae9894727ace0606f1e38aa02e7cd0705f8`) installs `@z_ai/mcp-server@0.1.5`. The owner selected its upstream defaults: `glm-5.3-flash` and 131,072 maximum output tokens, replacing `glm-4.6v` and 32,768. The extension imposes no model override or lower cap; explicit user vendor settings remain supported.

Actual vendor source/configuration and offline stdio initialization/tool listing were inspected. Full official Pi 1.0.0 and immutable fork877 compatibility checks pass on the current dependency tree, including intercepted real-child credential/logging and native private-output controls. No live availability, pricing or paid-call proof is claimed; the larger output ceiling can increase per-call cost. Evidence: `/tmp/pi100-extension-cleanup/services-evidence/current-reconciliation/current-union-pi-zai-mcp-14/` and `services-evidence/vendor/`.

## Safety maintenance qualification — 2026-10-02

The vision child now receives only the selected service credential, SDK-safe platform environment and explicit vendor options. Large saved outputs use unique private directories (0700) and exclusive files (0600).

At base `d01a0e70ed9a36d3b222ffe917433a883daafa66`, the new native controls failed for the intended reasons: shared-temp output directory 0755, unrelated credentials/Node hooks inherited by the real vendor child, and successful placeholder-key use. With the repair, full `check:compat` passed on official Pi 1.0.0 and the immutable maintained fork `8776b5e3511b1f00548abc6bd42a6da2bbc9ca02-eae8bb8666780a16-node24.21.0-darwin-arm64` (four native tests, zero skips). Both use physical Node 24.21.0 and coherent selected-host companions. Normal `ci` passed with zero production audit vulnerabilities.

The actual bundled vendor child analyzes a local fixture image with intercepted fetch and denied network; assertions observe its selected Bearer credential, absence of unrelated environment, configured model/token limit, actual selected log file and placeholder failure. Native loopback search verifies full saved bytes and Unix private modes under shared temp/umask 022. No live model/service request, paid call or Windows permission qualification was performed. Evidence: `/tmp/pi100-extension-cleanup/services-evidence/audits/mcp-safety/`.

## Original modernization evidence — 2026-10-01

- Base: `c7547ea244d5446525829c1878139af3bf494929`.
- Official Pi source: `a13d35a742c6ef8462812a28fbe1d8c8b7431c32` (v1.0.0). SDK SHA256 `5482298b995db935f7b96f5d6056fa1c36ac6fc80456be594ef65b83c62b0d30`; bundled CLI SHA256 `e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774`.
- Physical Node 24.21.0, eight Pi companion packages at 1.0.0, TypeBox 1.3.27. Checks use isolated HOME/agent profiles and explicit selected `PI_PACKAGE_DIR`; inherited live-fork overrides are discarded.
- `npm run ci`: typecheck, smoke, production dependency audit (zero vulnerabilities) and package dry-run passed. Existing compatible transitive dependency patches repair the initial production audit failures; production dependency ranges are unchanged.
- `npm run check:compat`: typecheck, smoke and the native SDK lifecycle fixture passed (one suite, zero skipped/failed). Native loopback MCP initialization, bounded structured outcomes, failure/no replay, reload/shutdown, auth resolution/cache and teardown-during-setup are exercised without paid calls.
- Source and extracted package: ordinary ESM import, actual bundled CLI registration, absolute official SDK registration/schema/reload/shutdown checks. Observers assert the selected SDK/CLI hashes and complete cohort, not only a version label.
- Installed bundled vision server: actual stdio initialize and tool listing expose all eight curated actions. The child has network denied and an opaque fixture credential; no vision tool is invoked.
- Fullscreen and regular actual CLI fixtures inspected at 48/100/160 columns, after resizing, collapsed and expanded. Unicode, bounded long output and a tool failure remain readable; the failure shows `failed` and the original failure text. Fixture HTTP/faux-model responses are owned and offline.

Local logs: `/tmp/zai-mcp-pi100-{ci,check,vision,esm,source-probe,packed-probe}.log`. Source/packed identity proofs: `/tmp/pi100-native-services/zai-mcp-{source,packed}-proof/identity.json`. UI captures: `/tmp/pi100-native-services/zai-mcp-{fullscreen,regular}-{48,100,160,expanded}.txt`, with host identity observations alongside them. Owned UI processes are stopped after inspection.

## Original modernization delivery boundaries — 2026-10-01

Recommended unused version: **0.2.0**, through the existing owned npm and GitHub release channels after parent review. No publication, tag or merge is part of this implementation. The older 0.87 cohort-only PR is not overwritten or cherry-picked.

The live fork, managed packages, settings and authentication are untouched. A future minimal 1.0 fork has no immutable qualified candidate yet; official checks do not certify that fork. No paid/provider request, live credential flow, user app mutation, live activation/reload/restart or manually triggered remote CI was attempted. Node 22.19 remains the existing manifest minimum, not a new runtime qualification claim; this evidence is on Node 24.21.0. The official pinned development cohort's audit advisory is not counted as a production dependency finding.
