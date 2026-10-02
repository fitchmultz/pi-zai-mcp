import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const EXTENSION_NAME = "pi-zai-mcp";
const VISION_MCP_PACKAGE = "@z_ai/mcp-server";
const VISION_MCP_BIN = "zai-mcp-server";
const require = createRequire(import.meta.url);

export type ServerId = "search" | "reader" | "zread" | "vision";
type ServerKind = "http" | "stdio";

export const ALL_SERVER_IDS = ["search", "reader", "zread", "vision"] as const satisfies readonly ServerId[];

type ServerConfig = {
  id: ServerId;
  label: string;
  kind: ServerKind;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
};

export type ManagedServer = ServerConfig & {
  client?: Client;
  transport?: StreamableHTTPClientTransport | StdioClientTransport;
  connectPromise?: Promise<Client>;
  callQueue?: Promise<void>;
  lastError?: string;
  closed?: boolean;
  controller?: AbortController;
  closePromise?: Promise<void>;
};

function enabledServerIds(): Set<ServerId> | undefined {
  const raw = process.env.Z_AI_MCP_SERVERS;
  if (!raw || raw.trim().length === 0 || raw.trim().toLowerCase() === "all") return undefined;

  const known = new Set<ServerId>(ALL_SERVER_IDS);
  const enabled = new Set<ServerId>();
  const unknown: string[] = [];

  for (const value of raw.split(",")) {
    const id = value.trim().toLowerCase();
    if (!id) continue;
    if (known.has(id as ServerId)) {
      enabled.add(id as ServerId);
    } else {
      unknown.push(id);
    }
  }

  if (unknown.length > 0) {
    console.warn(`[${EXTENSION_NAME}] ignoring unknown Z_AI_MCP_SERVERS value(s): ${unknown.join(", ")}`);
  }

  return enabled;
}

function visionEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  // The SDK supplies safe platform variables; only forward vendor-owned settings.
  for (const key of [
    "Z_AI_MODE", "PLATFORM_MODE", "Z_AI_BASE_URL",
    "Z_AI_VISION_MODEL", "Z_AI_VISION_MODEL_TEMPERATURE",
    "Z_AI_VISION_MODEL_TOP_P", "Z_AI_VISION_MODEL_MAX_TOKENS",
    "Z_AI_TIMEOUT", "Z_AI_RETRY_COUNT", "SERVER_NAME", "SERVER_VERSION",
  ]) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

function resolveVisionServerCommand(): { command: string; args: string[] } {
  const packageJsonPath = require.resolve(`${VISION_MCP_PACKAGE}/package.json`);
  const packageRoot = dirname(packageJsonPath);
  const packageJson = require(packageJsonPath) as { bin?: string | Record<string, string> };
  const binPath = typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin?.[VISION_MCP_BIN];

  if (!binPath) throw new Error(`${VISION_MCP_PACKAGE} does not declare the ${VISION_MCP_BIN} binary.`);

  return {
    command: process.execPath,
    args: [resolve(packageRoot, binPath)],
  };
}

const SERVER_FACTORIES = {
  search: () => ({
    id: "search",
    label: "Z.ai Web Search",
    kind: "http",
    url: "https://api.z.ai/api/mcp/web_search_prime/mcp",
  }),
  reader: () => ({
    id: "reader",
    label: "Z.ai Web Reader",
    kind: "http",
    url: "https://api.z.ai/api/mcp/web_reader/mcp",
  }),
  zread: () => ({
    id: "zread",
    label: "Z.ai Zread Repository Reader",
    kind: "http",
    url: "https://api.z.ai/api/mcp/zread/mcp",
  }),
  vision: () => {
    const visionCommand = resolveVisionServerCommand();
    return {
      id: "vision",
      label: "Z.ai Vision",
      kind: "stdio",
      command: visionCommand.command,
      args: visionCommand.args,
      env: {
        ...visionEnvironment(),
        Z_AI_MODE: process.env.Z_AI_MODE || "ZAI",
      },
    };
  },
} satisfies Record<ServerId, () => ManagedServer>;

export function createServers(serverIds: readonly ServerId[] = ALL_SERVER_IDS): ManagedServer[] {
  return serverIds.map((id) => SERVER_FACTORIES[id]());
}

export function legacyServerIds(): readonly ServerId[] {
  const enabled = enabledServerIds();
  return enabled ? ALL_SERVER_IDS.filter((id) => enabled.has(id)) : ALL_SERVER_IDS;
}
