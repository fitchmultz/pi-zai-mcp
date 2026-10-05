import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const EXTENSION_NAME = "pi-zai-mcp";
const VISION_MCP_PACKAGE = "@z_ai/mcp-server";
const VISION_MCP_BIN = "zai-mcp-server";
const GLM_VISION_DEFAULT_MODELS: ReadonlySet<string> = new Set(["glm-5.3-flash", "glm-5.3-flashx"]);
const require = createRequire(import.meta.url);

export type ServerId = "search" | "reader" | "zread" | "vision";
type ServerKind = "http" | "stdio";

export const ALL_SERVER_IDS = ["search", "reader", "zread", "vision"] as const satisfies readonly ServerId[];

type ServerConfig = Readonly<{
  id: ServerId;
  label: string;
  kind: ServerKind;
  url?: string;
  command?: string;
  args?: string[];
  env?: Readonly<Record<string, string>>;
}>;

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
  if (raw === undefined || raw.trim().length === 0 || raw.trim().toLowerCase() === "all") {return undefined;}

  const enabled = new Set<ServerId>();
  const unknown: string[] = [];

  for (const value of raw.split(",")) {
    const id = value.trim().toLowerCase();
    if (id.length === 0) {continue;}
    const knownId = ALL_SERVER_IDS.find((candidate) => candidate === id);
    if (knownId !== undefined) {
      enabled.add(knownId);
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
    "Z_AI_TIMEOUT", "Z_AI_RETRY_COUNT", "SERVER_NAME", "SERVER_VERSION", "ZAI_MCP_LOG_PATH",
  ]) {
    const value = process.env[key];
    if (value !== undefined) {env[key] = value;}
  }
  if (env.Z_AI_BASE_URL !== undefined && env.Z_AI_BASE_URL.length > 0) {
    env.Z_AI_BASE_URL = `${env.Z_AI_BASE_URL.replace(/\/+$/, "")}/`;
  }
  const model = env.Z_AI_VISION_MODEL ?? "";
  if (model === "" || GLM_VISION_DEFAULT_MODELS.has(model)) {
    env.Z_AI_VISION_MODEL_TEMPERATURE ??= "1";
    env.Z_AI_VISION_MODEL_TOP_P ??= "0.95";
  }
  return env;
}

function resolveVisionServerCommand(): { command: string; args: string[] } {
  const packageJsonPath = require.resolve(`${VISION_MCP_PACKAGE}/package.json`);
  const packageRoot = dirname(packageJsonPath);
  const packageJson: unknown = require(packageJsonPath);
  if (packageJson === null || typeof packageJson !== "object" || !("bin" in packageJson)) {
    throw new Error(`${VISION_MCP_PACKAGE} does not declare its binary.`);
  }
  const bin = packageJson.bin;
  let binPath: unknown;
  if (typeof bin === "string") {
    binPath = bin;
  } else if (bin !== null && typeof bin === "object" && VISION_MCP_BIN in bin) {
    binPath = bin[VISION_MCP_BIN];
  }

  if (typeof binPath !== "string" || binPath.length === 0) {throw new Error(`${VISION_MCP_PACKAGE} does not declare the ${VISION_MCP_BIN} binary.`);}

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
        Z_AI_MODE: process.env.Z_AI_MODE === undefined || process.env.Z_AI_MODE.length === 0 ? "ZAI" : process.env.Z_AI_MODE,
      },
    };
  },
} satisfies Record<ServerId, () => ManagedServer>;

export function createServers(serverIds: readonly ServerId[] = ALL_SERVER_IDS): ManagedServer[] {
  return serverIds.map((id) => SERVER_FACTORIES[id]());
}

export function legacyServerIds(): readonly ServerId[] {
  const enabled = enabledServerIds();
  return enabled !== undefined ? ALL_SERVER_IDS.filter((id) => enabled.has(id)) : ALL_SERVER_IDS;
}
