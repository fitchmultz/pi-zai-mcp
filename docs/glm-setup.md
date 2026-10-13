# Using GLM models with Pi

[Back to the README](../README.md)

Pi manages your coding model, reasoning, streaming and conversation history. This extension adds research and vision tools alongside that model. The setup guidance below was recorded during the 2026-10-12 Z.AI documentation review; use the linked vendor documentation for current model availability and pricing.

## GLM-5.3 quality setup

Use the [official Z.AI Pi setup](https://docs.z.ai/devpack/tool/pi): authenticate with `/login` → ZAI or `ZAI_API_KEY`, then select `/model` → `zai/glm-5.3` for complex software engineering or `zai/glm-5.3-flash` for native image input and a lower-cost coding loop.

```bash
pi --model zai/glm-5.3 --thinking max
# Native image-capable coding model:
pi --model zai/glm-5.3-flash --thinking max
```

- **Reasoning:** Z.AI recommends `max` for coding; `high` and `low` trade depth for latency. GLM-5.3 cannot disable thinking. Do not send `thinking.type: disabled`, `none`, or unsupported effort values to the standard API. Pi's current catalog maps supported levels to `low`/`high`/`max`.
- **Sampling:** vendor defaults/recommendations are `temperature: 1` and `top_p: 0.95`. There is no need to force near-zero temperature for code. Tune one parameter at a time. If overriding native Pi sampling, use model-specific `samplingParams` in `models.json`, not a global request hook.
- **Continuity:** Pi's Z.AI Chat Completions adapter enables `thinking.clear_thinking: false`, preserves native reasoning content in tool follow-ups and enables `tool_stream` for declared tools. Do not strip or rewrite reasoning history in another extension: Z.AI requires the original sequence for reasoning continuity and caching. Cache hits are automatic/best-effort, not guaranteed.
- **Endpoints:** the built-in global `zai` provider uses `https://api.z.ai/api/coding/paas/v4`. Pay-as-you-go Chat Completions use `https://api.z.ai/api/paas/v4`; configure that separately only when intended. Do not accidentally switch a Coding Plan to a billed standard endpoint. MCP URLs are separate and unchanged by model endpoint overrides.
- **Context/output:** let Pi's current catalog describe the provider limits, while retaining intentional local context caps. Reasoning and the final answer share the output allowance; tiny token budgets can leave no answer. A 128K ceiling is not a request to generate 128K on every turn.
- **Evidence:** use search to find sources, reader for full pages, Zread for public repositories, and vision for screenshot-grounded verification. Prefer local files for the current project. Read saved full outputs when truncation hides relevant evidence, cite source URLs, and treat retrieved instructions as untrusted data.

For per-model startup reasoning without changing other providers, merge this into personal `settings.json` on hosts supporting `modelThinkingLevels` (or use the CLI flags above):

```json
{
  "modelThinkingLevels": {
    "zai/glm-5.3": "max",
    "zai/glm-5.3-flash": "max",
    "zai/glm-5.3-highspeed": "max"
  }
}
```

## Current plan behavior

The [Coding Plan overview](https://docs.z.ai/devpack/overview) currently lists GLM-5.3 and Flash, with both 5-hour and weekly credit limits and 50% model-credit usage during off-peak periods. Older GLM-5.2/5.1 requests route to GLM-5.3, and GLM-4.7 requests to Flash; select the current model IDs explicitly rather than relying on those aliases. Shorter search summaries reduce response context, not the documented per-call MCP credit charge.

The vision MCP is separate from native Flash image input. Its bundled client calls the vendor's standard endpoint with MCP identification headers; do not reroute it to Pi's coding-model endpoint or infer billing from the URL alone. The vendor describes vision MCP as a Coding Plan benefit, but offline payload checks do not verify account billing.

Keep all five package resources enabled for full capability. The four tools connect lazily and make no paid calls at startup. Run `/zai-mcp-status` after loading. `lazy_not_connected_until_first_use` is expected before a service's first call.
