import type { Registry } from "./register-tool.ts";
import type { ZaiPlatform } from "./servers.ts";

export type ServiceAuth = Readonly<{ key: string; platform: ZaiPlatform }>;

const ENV_KEYS = [
  ["Z_AI_API_KEY", "ZAI"],
  ["ZAI_API_KEY", "ZAI"],
  ["ZAI_CODING_CN_API_KEY", "ZHIPU"],
] as const;

function platformForUrl(value: string): ZaiPlatform | undefined {
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (host === "z.ai" || host.endsWith(".z.ai")) {
      return "ZAI";
    }
    if (host === "bigmodel.cn" || host.endsWith(".bigmodel.cn")) {
      return "ZHIPU";
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function zaiProviderCandidates(registry: Registry): ReadonlyMap<string, ZaiPlatform> {
  const candidates = new Map<string, ZaiPlatform>([
    ["zai", "ZAI"],
    ["zai-coding-cn", "ZHIPU"],
  ]);
  for (const model of registry.getAll()) {
    const platform = platformForUrl(model.baseUrl);
    if (platform !== undefined && !candidates.has(model.provider)) {
      candidates.set(model.provider, platform);
    }
  }
  return candidates;
}

function serviceAuth(): ServiceAuth | undefined {
  for (const [name, platform] of ENV_KEYS) {
    const key = process.env[name];
    if (key !== undefined && key.length > 0) {
      return { key, platform };
    }
  }
  return undefined;
}

export function hasApiKeySource(registry: Registry): boolean {
  return (
    serviceAuth() !== undefined ||
    [...zaiProviderCandidates(registry).keys()].some(
      (id) => registry.getProviderAuthStatus(id).configured,
    )
  );
}

export async function getServiceAuth(registry: Registry): Promise<ServiceAuth | undefined> {
  const explicit = serviceAuth();
  if (explicit !== undefined) {
    return explicit;
  }
  // Native auth owns templates, commands and refresh; the first key wins.
  for (const [id, platform] of zaiProviderCandidates(registry)) {
    const key = (await registry.getProviderAuth(id))?.auth.apiKey;
    if (key !== undefined && key.length > 0) {
      return { key, platform };
    }
  }
  return undefined;
}
