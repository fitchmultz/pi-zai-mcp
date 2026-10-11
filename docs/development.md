# Development and maintenance

[Back to the README](../README.md)

## Local setup

```bash
git clone https://github.com/fitchmultz/pi-zai-mcp.git
cd pi-zai-mcp
npm install
export Z_AI_API_KEY="your_z_ai_api_key"
pi -e .
```

## Host compatibility

Pi **1.0.0** remains the suggested support floor. Host runtime packages remain optional wildcard peers rather than hard peer/engines pins. Required qualification targets are the latest stable official Pi and latest maintained fork `main`, resolving version/commit once per workflow run and retaining exact SDK/CLI evidence. Locked development dependencies are reproducible snapshots, not validation targets.

## Verify this repo

Dated host qualification and live-service results are recorded in [Pi 1.0 qualification](../PI_1_0_QUALIFICATION.md); they do not certify a new host or guarantee future service availability. For current qualification, use the shared qualifier with `--host official --target latest` and separately with the packed latest fork revision, selecting each consistent host graph before `npm run check:compat`. Plain `npm ci --ignore-scripts` installs only the locked development snapshot. The contract runs types, existing argument/transport smokes, native loading of all five resources, missing-auth rejection, loopback MCP search and private large-output checks, connected-session termination on reload, shutdown cleanup, and dry-run packing. It also starts the real bundled vision child with intercepted fetch and denied network to verify credential scoping and placeholder rejection. Use an empty HOME/agent profile. The compatibility gate deliberately excludes `npm audit` and never connects to Z.ai; audit and live service checks remain separate. This does not certify Z.ai availability or every advertised Node/platform target.

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

`oxlint.config.ts` enforces type-aware code quality and compiler diagnostics across maintained source, extensions, scripts and tests, with correctness, suspicious and performance categories blocking. `tsconfig.json` independently enables `strict`, `noImplicitReturns`, `noUncheckedIndexedAccess`, `allowJs` and real `checkJs` across those four maintained directories, alongside the root TypeScript lint configuration. JavaScript receives sound JSDoc contracts and contextual inference rather than unchecked casts.

**Language scope:** all maintained TypeScript and JavaScript modules receive non-type-aware lint, type-aware lint, compiler diagnostics, formatting and applicable tests. There are no unchecked maintained JavaScript files or lint-only semantic opt-ins. This intentionally preserves coverage stronger than the unchecked-JavaScript baseline. The scope regression reconciles effective compiler membership/checking with actual lint coverage; new files must retain that coverage. Root Oxlint options own type-aware lint and compiler reporting independently, without redundant CLI switches.

An intentional future unchecked-JavaScript boundary must remain linted, formatted and tested. Its exact file scope needs an override disabling only installed rules marked `type_aware` in Oxlint metadata, after test/framework overrides; compiler reporting must be verified separately. `checkJs: false` alone does not disable semantic lint, `allowJs` alone does not enable compiler checking, and `--tsconfig` controls import resolution rather than selecting the type-aware engine's project. The regression fixtures independently exercise unchecked, inherited checked and `@ts-check` scopes plus TypeScript consumers of unchecked JavaScript without changing this repository's all-checked policy.

Production ceilings are complexity 10, depth 3, four parameters, 40 statements/function, 80 lines/function and 500 lines/file (excluding blank lines/comments). Tests, smoke, the offline fixture and `test/quality-fixtures.mjs` retain complexity 15, depth 4 and six-parameter limits; statement count, function size and file size limits are disabled so cohesive lifecycle setup/execution/teardown stays together. Hand-maintained declarations retain applicable type/API checks with structural metrics disabled. Only dedicated `*.test-d.ts` tests allow described `@ts-expect-error` (minimum ten characters); compiler suppressions remain forbidden elsewhere. There are currently no generated source artifacts or byte-sensitive external fixture files to exclude.

Readonly parameters retain explicit exported contracts, but `ignoreInferredTypes: true` deliberately allows natural contextual callbacks and is not a deep-immutability guarantee. Native allowances identify declarations in TypeScript libraries, Node (`@types/node`), Undici (`undici-types`) and Pi, not names alone. They cover request/response/options, URL, abort, stream and HTTP/test handles; Pi's `AgentSession`/`ModelRegistry` remain SDK contracts. The concrete local `src/servers.ts` `ManagedServer` allowance represents mutable lifecycle ownership, not arbitrary application data. Generic `Map`, `ReadonlyMap`, `Record` and `Readonly` are never exempted. Oxlint 1.87.0 / oxlint-tsgolint 7.0.2003 falsely flags a primitive `ReadonlyMap<string, string>` parameter; `Readonly<ReadonlyMap<string, string>>` is the narrowly documented workaround. **Known checker ceiling:** wrapping mutable maps or mutable nested values in `Readonly` can also escape detection; the workaround is only justified for genuinely readonly primitive maps, not mutable inputs.

Semantic exceptions in the config are:

| Boundary                       | Rule / allowance                                                | Reason and verification                                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/auth.ts`                  | `no-await-in-loop` module override                              | Native authentication can execute commands/refresh; the first key wins without resolving later providers. Smoke covers provider precedence and command caching.                |
| `test/native-runtime.test.mjs` | `no-await-in-loop` module override                              | Ordered vision scenarios share environment and reload/child disposal. The native runtime test executes each scenario.                                                          |
| `src/index.ts`                 | Props mutation only for `owner`, with qualified `ManagedServer` | Lifecycle state owns cancellation, queues and teardown; smoke races plus native reload/shutdown verify it.                                                                     |
| `scripts/smoke.mjs`            | Props mutation only for `stream`, with Node `WriteStream`       | stdout/stderr capture temporarily owns `write` and restores it in `finally`. Its readonly override retains the complete shared allowance list. Smoke checks print/JSON output. |
| `src/register-tool.ts`         | Five parameters                                                 | Native Pi tool execute ABI; native-runtime executes it with five arguments.                                                                                                    |
| Smoke and native-runtime tests | `no-useless-undefined: {checkArguments: false}`                 | Native optional positions and negative-test inputs require explicit absence. Arrow-body checking stays enabled.                                                                |
| Tests and fixtures             | `no-unnecessary-condition: {checkTypePredicates: false}`        | Preserve real Node runtime equality assertions without predicate-free aliases. Ordinary unnecessary conditions remain checked.                                                 |

Floating-promise safety has empty safe-call/safe-promise lists: native promises, `test()` and subtests must still be awaited/returned/handled. `strict-void-return`, props-aware mutation and unsafe-type protection remain blocking. `require-await`, `consistent-return`, underscore naming, function-scoping preferences, and local array-sort/reverse bans are intentionally disabled. TypeScript owns return-path analysis. Nullable-object presence checks, genuine void shorthand callbacks, error rethrow identity and terminal discarded promise results are permitted deliberately.

The small `oxc-parser` comment-aware policy check allows only single-line `oxlint-disable-next-line` comments with one exact approved rule and a specific adjacent explanation: `no-await-in-loop` for required sequencing, `vitest/no-conditional-expect` in verified test scope for fail-closed assertions, `typescript/prefer-readonly-parameter-types` for a reproduced plain generic-callback result defect, `typescript/no-unnecessary-condition` for a necessary live post-await guard, and `no-control-regex` for intentional escaped control-character validation. Add a site only when its diagnostic is reproduced; the checker validates structure and scope, while tests and code review verify the reason. Current production callback contracts and cancellation guards need no new suppression. Multiline disable comments cannot hide additional rules. Blanket disables, inline downgrades, unsafe-type/floating-promise suppressions and production compiler suppressions (including compiler-recognized suffix forms) remain rejected. Strings and documentation examples are not directives. Preference-only bans on comments, TODOs or `continue` are not part of the baseline.

Vitest assertion rules register real helpers, but Oxlint 1.87 does not recognize `node:test` blocks for `expect-expect`; `no-conditional-expect` recognizes Vitest `expect`, not Node `assert.*`. These are not claimed as native assertion guards. The runner remains `node:test`.

Oxfmt 0.72.0 owns supported maintained files using `.oxfmtrc.json`: 100 columns, two spaces, semicolons, double quotes, trailing commas, LF and final newlines. Import/package/Tailwind sorting and JSDoc rewriting are explicitly disabled. `.oxfmtignore` preserves npm's lockfile serialization; format commands load it together with `.gitignore`. VS Code recommends the official `oxc.oxc-vscode` extension and uses the repository config for code, Markdown, YAML and JSONC on save; plain JSON remains a CLI formatting responsibility so editors do not rewrite the npm-owned lockfile. Other editors can use the project's `oxfmt --lsp` ([editor setup](https://oxc.rs/docs/guide/usage/formatter/editors)).

```bash
npm run format       # Format supported maintained files; preserve the npm lockfile
npm run lint:fix     # Apply safe fixes; repair remaining findings
npm run format       # Formatting and lint fixes must converge
npm run format:check
npm run lint:agent   # Blocking checks with agent-oriented diagnostics
npm run typecheck   # Independent strict checked-JS/TS gate
npm run lint:policy # Comment-aware suppression policy
npm run test:quality # Real installed-CLI configuration/behavior regressions
npm run check       # All quality, type, smoke, native-test and package-build gates
npm run ci          # The same acceptance workflow plus production audit
```

The regression suite runs the real installed Oxlint, compiler and policy CLIs against individual temporary projects extending the canonical TypeScript configuration. It checks expected rule IDs and primary locations, verifies compiler diagnostics separately from lint diagnostics, rejects unexpected parser/configuration/process errors, preserves checker-defect reproductions and tests paused lifecycle guards and actual control-validator inputs. Native `node:test` registrations/subtests are awaited; a package-qualified `test` safe-call exception would also exempt subtests, so none is added. Fixtures are source strings materialized outside normal compilation, not ignored maintained code.

The quality rollout's diagnostic reductions come from explicit native/semantic allowances and corrected test limits; source-quality changes add checked-JavaScript contracts, clearer callback returns and a cohesive metadata/lifecycle separation. They do not claim new service-runtime bug fixes. Previously verified 0.2.2 output/privacy and vision fixes are described separately in the changelog.

This is a source-only Pi package: the native loader consumes TypeScript directly. `npm run build` validates the publishable source package with `npm pack --dry-run`; there is no compiled bundle or generated-code pipeline. Independent host qualification packs and executes the actual artifact. The existing compatibility workflow also runs a read-only `quality` job invoking the same `npm run check`; formatting and policy checks are not optional side workflows.

## Automatic npm releases (maintainers)

Follow the [shared release procedure](https://github.com/fitchmultz/.github#automatic-npm-releases): merge a reviewed PR into `main` with an intentional `package.json` version bump and a matching versioned `CHANGELOG.md` section. Once configured and enabled, publication is unattended after the existing compatibility checks and candidate-tarball qualification pass. Enable publishing only after confirming this package is already published on the owner's npm account, as required by [AGENTS.md](../AGENTS.md). Complete any applicable package-specific release evidence before merging the bump, including the separate audit in `npm run ci`. Automation never bumps versions, overwrites releases, or republishes an existing version; existing manual publisher instructions remain valid.

Failed/unpublished candidates can retry daily at 12:17 UTC or via manual dispatch of `npm release` on `main`, without another bump. Set repository variable `NPM_RELEASE_ENABLED` to anything other than `true` to stop new release plans; cancel pending runs separately when needed. Workflow validation is not evidence of a completed real OIDC publication.

## Project map

```text
extensions/zai-mcp-*.ts  # per-server pi package entrypoints plus status command
extensions/zai-mcp.ts    # legacy all-in-one entrypoint for direct local loading
src/index.ts             # shared MCP connections, lifecycle and execution
src/curated-tools.ts     # curated runtime schemas, metadata and call rendering
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
