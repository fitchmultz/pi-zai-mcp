## Learned User Preferences

- Only run `npm publish` when `pi-zai-mcp` is already published on the fitchmultz npm account; otherwise commit and push without publishing.
- When updating pi compatibility, treat the tested version as a suggested floor in README/package metadata, not as a hard peer or engines pin.

## Learned Workspace Facts

- Published unofficial pi extension exposing four curated Z.AI MCP tools: `z_ai_search`, `z_ai_reader`, `z_ai_zread`, and `z_ai_vision`.
- Pi compatibility guidance lives in README/package metadata. `src/index.ts` owns MCP orchestration; focused tool, output and runtime modules share behavior across split package resources. `extensions/zai-mcp.ts` is the legacy all-in-one entrypoint.

## Host qualification

- Qualify latest stable official Pi and latest maintained fork main independently; resolve version/commit once per workflow run and retain exact SDK/CLI evidence. Locked development dependencies are reproducible snapshots, not validation targets. Use the shared qualifier to select each complete host graph; historical support floors do not waive fork qualification.

## Test ownership

`test/native-runtime.test.mjs` owns packaged split-resource loading, tool execution, shared status, and reload/shutdown. Keep smoke coverage for distinct legacy settings, prompt metadata, argument shaping, auth and cancellation races; do not duplicate the package inventory or assert function arity instead of executing the tool. Mocked connection cancellation is one shared-owner case, not proof of real HTTP/stdio protocol phases.

## Code quality and verification

- Use the repository's npm scripts, lockfile, runtime, workspace structure and existing verification commands. Oxlint owns code quality; Oxfmt owns supported-file formatting; TypeScript and tests remain independent gates.
- All Oxlint errors and warnings are blocking. Fix genuine findings in the current work; preserve strict Oxlint, Oxfmt, TypeScript and test coverage.
- Determine language coverage from effective project options, membership and per-file checking directives. This repository intentionally checks all maintained JavaScript (`checkJs: true`); preserve that stronger coverage and the scope regression when files or configurations change. If an unchecked boundary is introduced intentionally, retain non-type-aware lint, formatting and tests, disable only metadata-identified type-dependent rules for its exact scope, and verify compiler reporting separately. Unchecked JavaScript is never an ignored-file category.
- Preserve accurate API contracts and runtime behavior. Use validation, narrowing and sound type relationships, never unsafe assertions or compiler suppressions. Keep exported contracts explicit; prefer contextual inference where it is clearer.
- Preserve required async ordering, cancellation, deletion guards, error identity and lifecycle ownership. Choose concurrency from dependencies and resource limits, not from lint heuristics.
- Follow the semantic exceptions documented in README and `oxlint.config.ts`: declaration-qualified native handles, exact mutation/arity/undefined boundaries, and ordered modules. No generic Map/ReadonlyMap/Record/Readonly exemptions. Inferred parameters are deliberately outside readonly-parameter enforcement; do not remove meaningful annotations merely to evade it.
- Only documented `oxlint-disable-next-line` exceptions for required sequencing, proven fail-closed test assertions, reproduced plain generic-callback readonly defects, necessary live post-await guards, or intentional control-character validation are authorized. Name the exact approved rule and provide a specific adjacent reason. The policy checker validates structure/scope; tests and review validate semantics. Blanket disables, inline rule downgrades, unsafe-type/floating-promise suppressions, `@ts-ignore` and `@ts-nocheck` remain forbidden. Described `@ts-expect-error` belongs only in dedicated `*.test-d.ts` negative type tests.
- Keep each exception narrowly scoped, explained and verifiable. The comment-aware directive checker and configuration regression suite enforce this policy; unused-disable reporting remains enabled.
- Keep cohesive lifecycle tests and their verified test-only helpers together. Tests retain complexity 15, depth 4 and six-parameter limits, but file/function/statement-size limits are disabled. Production remains under its complete limits; refactor along real responsibilities rather than forwarding layers or mechanical file splitting.
- Review autofix changes. After editing code, run `npm run format`, `npm run lint:fix`, then `npm run format` and check convergence. Before completion, run `npm run check` (policy/regressions, strict lint, formatting, canonical checked-JS/TS typecheck, smoke, native tests and source-package build validation), plus `npm run ci` for the production audit. `npm run check:compat` uses the same acceptance gate on each qualified host.
- Report configuration-only diagnostic reductions separately from source-quality fixes and observable runtime bugs. Report commands actually executed, results, language/project coverage, verification limits and remaining issues accurately. Never claim a check passed unless it ran successfully.
