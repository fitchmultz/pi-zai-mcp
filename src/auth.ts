import type { Registry } from "./register-tool.ts";

const ZAI_PROVIDER_IDS = ["zai", "zai-coding-cn"] as const;
const ZAI_HOSTS = ["z.ai", "bigmodel.cn"] as const;

function isZaiBaseUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return ZAI_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

function zaiProviderCandidates(registry: Registry): string[] {
  return [...new Set([...ZAI_PROVIDER_IDS, ...registry.getAll().filter((model: Readonly<{ baseUrl: string }>) => isZaiBaseUrl(model.baseUrl)).map((model: Readonly<{ provider: string }>) => model.provider)])];
}

function serviceKey(): string | undefined {
  return [process.env.Z_AI_API_KEY, process.env.ZAI_API_KEY, process.env.ZAI_CODING_CN_API_KEY].find((key) => key !== undefined && key.length > 0);
}

export function hasApiKeySource(registry: Registry): boolean {
  return serviceKey() !== undefined || zaiProviderCandidates(registry).some(id => registry.getProviderAuthStatus(id).configured);
}

export async function getApiKey(registry: Registry): Promise<string | undefined> {
  const explicit = serviceKey();
  if (explicit !== undefined) { return explicit; }
  // Native provider auth owns templates, commands, environment and refresh.
  // Resolve in priority order: later providers must not run after finding a key.
  for (const id of zaiProviderCandidates(registry)) {
    const key = (await registry.getProviderAuth(id))?.auth.apiKey;
    if (key !== undefined && key.length > 0) { return key; }
  }
  return undefined;
}
