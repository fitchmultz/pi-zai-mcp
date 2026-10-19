import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXTENSION_NAME = "pi-zai-mcp";
const VISION_MCP_PACKAGE = "@z_ai/mcp-server";
const VISION_MCP_BIN = "zai-mcp-server";
const GLM_VISION_DEFAULT_MODELS: ReadonlySet<string> = new Set(["glm-5.3-flash", "glm-5.3-flashx"]);
const GLOBAL_VISION_MODES = new Set(["Z_AI", "ZAI", "Z"]);
const CHINA_VISION_MODES = new Set(["ZHIPU_AI", "ZHIPUAI", "ZHIPU", "BIGMODEL"]);
const require = createRequire(import.meta.url);

export type ServerId = "search" | "reader" | "zread" | "vision";
export type ZaiPlatform = "ZAI" | "ZHIPU";
type ServerKind = "http" | "stdio";

export function visionCompletionsUrl(
  env: Readonly<Record<string, string>>,
  platform: ZaiPlatform,
): string {
  let mode: string = platform;
  if (env.Z_AI_MODE !== undefined && env.Z_AI_MODE !== "") {
    mode = env.Z_AI_MODE;
  }
  if (env.PLATFORM_MODE !== undefined && env.PLATFORM_MODE !== "") {
    mode = env.PLATFORM_MODE;
  }
  let baseUrl = env.Z_AI_BASE_URL;
  if (baseUrl === undefined || baseUrl === "") {
    baseUrl = "https://open.bigmodel.cn/api/paas/v4/";
  }
  if (GLOBAL_VISION_MODES.has(mode)) {
    baseUrl = "https://api.z.ai/api/paas/v4/";
  } else if (CHINA_VISION_MODES.has(mode)) {
    baseUrl = "https://open.bigmodel.cn/api/paas/v4/";
  }
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

export const ALL_SERVER_IDS = [
  "search",
  "reader",
  "zread",
  "vision",
] as const satisfies readonly ServerId[];

type ServerConfig = Readonly<{
  id: ServerId;
  label: string;
  kind: ServerKind;
  command?: string;
  args?: string[];
  env?: Readonly<Record<string, string>>;
}>;

export type Connection = Readonly<{
  client: Client;
  transport: StreamableHTTPClientTransport | StdioClientTransport;
  close: () => Promise<void>;
}>;

export type ManagedServer = ServerConfig & {
  connection?: Connection;
  connectionStatus?: "connecting" | "connected" | "disconnected" | "failed";
  connectPromise?: Promise<Client>;
  disconnectPromise?: Promise<void>;
  callQueue?: Promise<void>;
  lastError?: string;
  closed?: boolean;
  controller?: AbortController;
  closePromise?: Promise<void>;
};

function enabledServerIds(): Set<ServerId> | undefined {
  const raw = process.env.Z_AI_MCP_SERVERS;
  if (raw === undefined || raw.trim().length === 0 || raw.trim().toLowerCase() === "all") {
    return undefined;
  }

  const enabled = new Set<ServerId>();
  const unknown: string[] = [];

  for (const value of raw.split(",")) {
    const id = value.trim().toLowerCase();
    if (id.length === 0) {
      continue;
    }
    const knownId = ALL_SERVER_IDS.find((candidate) => candidate === id);
    if (knownId !== undefined) {
      enabled.add(knownId);
    } else {
      unknown.push(id);
    }
  }

  if (unknown.length > 0) {
    console.warn(
      `[${EXTENSION_NAME}] ignoring unknown Z_AI_MCP_SERVERS value(s): ${unknown.join(", ")}`,
    );
  }

  return enabled;
}

function visionEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  // The SDK supplies safe platform variables; only forward vendor-owned settings.
  for (const key of [
    "Z_AI_MODE",
    "PLATFORM_MODE",
    "Z_AI_BASE_URL",
    "Z_AI_VISION_MODEL",
    "Z_AI_VISION_MODEL_TEMPERATURE",
    "Z_AI_VISION_MODEL_TOP_P",
    "Z_AI_VISION_MODEL_MAX_TOKENS",
    "Z_AI_TIMEOUT",
    "Z_AI_RETRY_COUNT",
    "SERVER_NAME",
    "SERVER_VERSION",
    "ZAI_MCP_LOG_PATH",
  ]) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  if (env.Z_AI_BASE_URL !== undefined && env.Z_AI_BASE_URL.length > 0) {
    env.Z_AI_BASE_URL = `${env.Z_AI_BASE_URL.replace(/\/+$/, "")}/`;
  }
  const model = env.Z_AI_VISION_MODEL ?? "";
  return {
    ...env,
    ...visionModelSettings(model, process.env.Z_AI_VISION_REASONING_EFFORT),
  };
}

function visionModelSettings(model: string, effort: string | undefined): Record<string, string> {
  if (model !== "" && !GLM_VISION_DEFAULT_MODELS.has(model)) {
    return {};
  }
  if (effort !== undefined && effort !== "low" && effort !== "high" && effort !== "max") {
    throw new Error("Z_AI_VISION_REASONING_EFFORT must be one of: low, high, max.");
  }
  return {
    Z_AI_VISION_MODEL_TEMPERATURE: process.env.Z_AI_VISION_MODEL_TEMPERATURE ?? "1",
    Z_AI_VISION_MODEL_TOP_P: process.env.Z_AI_VISION_MODEL_TOP_P ?? "0.95",
    ...(effort === undefined ? {} : { Z_AI_VISION_REASONING_EFFORT: effort }),
  };
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

  if (typeof binPath !== "string" || binPath.length === 0) {
    throw new Error(`${VISION_MCP_PACKAGE} does not declare the ${VISION_MCP_BIN} binary.`);
  }

  return {
    command: process.execPath,
    args: [
      "--import",
      fileURLToPath(new URL("./vision-fetch.mjs", import.meta.url)),
      resolve(packageRoot, binPath),
    ],
  };
}

const SERVER_FACTORIES = {
  search: () => ({
    id: "search",
    label: "Z.ai Web Search",
    kind: "http",
  }),
  reader: () => ({
    id: "reader",
    label: "Z.ai Web Reader",
    kind: "http",
  }),
  zread: () => ({
    id: "zread",
    label: "Z.ai Zread Repository Reader",
    kind: "http",
  }),
  vision: () => {
    const visionCommand = resolveVisionServerCommand();
    return {
      id: "vision",
      label: "Z.ai Vision",
      kind: "stdio",
      command: visionCommand.command,
      args: visionCommand.args,
      env: visionEnvironment(),
    };
  },
} satisfies Record<ServerId, () => ManagedServer>;

export function httpServerUrl(id: ServerId, platform: ZaiPlatform): string {
  if (id === "vision") {
    throw new Error("Vision uses a local stdio server, not HTTP MCP.");
  }
  const paths = { search: "web_search_prime", reader: "web_reader", zread: "zread" };
  const host = platform === "ZHIPU" ? "open.bigmodel.cn" : "api.z.ai";
  return `https://${host}/api/mcp/${paths[id]}/mcp`;
}

export function createServers(serverIds: readonly ServerId[] = ALL_SERVER_IDS): ManagedServer[] {
  return serverIds.map((id) => SERVER_FACTORIES[id]());
}

export function legacyServerIds(): readonly ServerId[] {
  const enabled = enabledServerIds();
  return enabled !== undefined ? ALL_SERVER_IDS.filter((id) => enabled.has(id)) : ALL_SERVER_IDS;
}
