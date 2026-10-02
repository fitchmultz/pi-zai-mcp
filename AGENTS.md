## Learned User Preferences

- Only run `npm publish` when `pi-zai-mcp` is already published on the fitchmultz npm account; otherwise commit and push without publishing.
- When updating pi compatibility, treat the tested version as a suggested floor in README/package metadata, not as a hard peer or engines pin.

## Learned Workspace Facts

- Published unofficial pi extension exposing four curated Z.AI MCP tools: `z_ai_search`, `z_ai_reader`, `z_ai_zread`, and `z_ai_vision`.
- Pi compatibility guidance lives in README/package metadata; implementation is centralized in `src/index.ts` with pi entry at `extensions/zai-mcp.ts`.

## Test ownership

`test/native-runtime.test.mjs` owns packaged split-resource loading, tool execution, shared status, and reload/shutdown. Keep smoke coverage for distinct legacy settings, prompt metadata, argument shaping, auth and cancellation races; do not duplicate the package inventory or assert function arity instead of executing the tool. Mocked connection cancellation is one shared-owner case, not proof of real HTTP/stdio protocol phases.
