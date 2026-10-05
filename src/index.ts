import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { SEARCH_TOOL, READER_TOOL, ZREAD_TOOL, VISION_TOOL } from "./curated-tools.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  createRegistrar,
  type CuratedDetails,
  type CuratedRequest,
  type Registry,
  type ZaiExtensionAPI,
} from "./register-tool.ts";
import { isRecord, searchArgs, stringValue, visionArgs } from "./tools.ts";
import { summarizeMcpResult, truncateForTool } from "./output.ts";
import { createRequire } from "node:module";
import {
  addActiveServers,
  getActiveServers,
  registerStatusCommand,
  resetGlobalStateForTests,
  warnOnceIfMissingApiKey,
} from "./runtime-state.ts";
import {
  ALL_SERVER_IDS,
  createServers,
  legacyServerIds,
  type ManagedServer,
  type ServerId,
} from "./servers.ts";
import { getApiKey, hasApiKeySource } from "./auth.ts";

const EXTENSION_NAME = "pi-zai-mcp";
const require = createRequire(import.meta.url);
const packageJson: unknown = require("../package.json");
if (!isRecord(packageJson) || typeof packageJson.version !== "string") {
  throw new Error("Missing pi-zai-mcp package version.");
}
const EXTENSION_VERSION = packageJson.version;
const DEFAULT_TIMEOUT_MS = positiveIntegerFromEnv("Z_AI_MCP_TIMEOUT_MS", 300_000);
const SHUTDOWN_TIMEOUT_MS = 1_000;

function positiveIntegerFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.length === 0) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 2_147_483_647 ? parsed : fallback;
}

function isMcpErrorResult(result: unknown): boolean {
  return isRecord(result) && result.isError === true;
}

type Connection = {
  client: Client;
  transport: StreamableHTTPClientTransport | StdioClientTransport;
};

async function connectWith(
  owner: ManagedServer,
  signal: AbortSignal | undefined,
  createConnection: () => Connection | Promise<Connection>,
): Promise<Client> {
  if (owner.closed === true) {
    throw new Error("Z.AI MCP connection owner has shut down.");
  }
  if (owner.client !== undefined) {
    return owner.client;
  }
  if (owner.connectPromise !== undefined) {
    return owner.connectPromise;
  }
  owner.controller ??= new AbortController();
  const combinedSignal =
    signal !== undefined
      ? AbortSignal.any([signal, owner.controller.signal])
      : owner.controller.signal;
  const attempt = (async () => {
    let connection: Connection | undefined;
    let published = false;
    try {
      connection = await createConnection();
      throwIfAborted(
        combinedSignal,
        "Tool call was cancelled while preparing Z.AI MCP authentication.",
      );
      owner.transport = connection.transport;
      published = true;
      await withAbort(
        connection.client.connect(connection.transport, {
          signal: combinedSignal,
          timeout: DEFAULT_TIMEOUT_MS,
        }),
        combinedSignal,
        "Tool call was cancelled while connecting to Z.AI MCP.",
      );
      throwIfAborted(combinedSignal, "Tool call was cancelled while connecting to Z.AI MCP.");
      if (owner.closed === true) {
        throw new Error("Z.AI MCP connection owner has shut down.");
      }
      owner.client = connection.client;
      owner.lastError = undefined;
      return connection.client;
    } catch (error) {
      if (connection !== undefined && (!published || owner.closed !== true)) {
        await connection.transport.close().catch(() => null);
      }
      if (connection === undefined || owner.transport === connection.transport) {
        owner.client = undefined;
        owner.transport = undefined;
      }
      owner.lastError = error instanceof Error ? error.message : stringValue(error);
      throw error;
    }
  })();
  owner.connectPromise = attempt;
  try {
    return await attempt;
  } catch (error) {
    if (owner.connectPromise === attempt) {
      owner.connectPromise = undefined;
    }
    throw error;
  }
}

async function connect(
  owner: ManagedServer,
  registry: Registry,
  signal?: AbortSignal,
): Promise<Client> {
  return connectWith(owner, signal, async () => {
    const apiKey = await getApiKey(registry);
    if (apiKey === undefined) {
      throw new Error(
        "Missing Z.ai API key. Set Z_AI_API_KEY/ZAI_API_KEY/ZAI_CODING_CN_API_KEY or run pi /login for the zai or zai-coding-cn provider.",
      );
    }

    const client = new Client({ name: EXTENSION_NAME, version: EXTENSION_VERSION });
    if (owner.kind === "http") {
      if (owner.url === undefined || owner.url.length === 0) {
        throw new Error(`Missing URL for ${owner.id}`);
      }
      return {
        client,
        transport: new StreamableHTTPClientTransport(new URL(owner.url), {
          requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
        }),
      };
    }

    if (owner.command === undefined || owner.command.length === 0) {
      throw new Error(`Missing command for ${owner.id}`);
    }
    return {
      client,
      transport: new StdioClientTransport({
        command: owner.command,
        args: owner.args,
        env: { ...owner.env, Z_AI_API_KEY: apiKey },
        stderr: "pipe",
      }),
    };
  });
}

function abortError(message: string): Error {
  return new Error(message);
}

function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
  if (signal?.aborted === true) {
    throw abortError(message);
  }
}

async function withAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  message: string,
): Promise<T> {
  if (signal === undefined) {
    return promise;
  }
  if (signal.aborted) {
    promise.catch(() => null);
    throw abortError(message);
  }
  const cancelled = Promise.withResolvers<never>();
  const onAbort = () => {
    cancelled.reject(abortError(message));
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    return await Promise.race([promise, cancelled.promise]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

async function runExclusive<T>(
  owner: ManagedServer,
  signal: AbortSignal | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = owner.callQueue ?? Promise.resolve();
  const run = previous
    .catch(() => null)
    .then(() => {
      throwIfAborted(signal, "Tool call was cancelled before it started.");
      if (owner.closed === true) {
        throw new Error("Z.AI MCP connection owner has shut down.");
      }
      return operation();
    });
  const clearQueue = () => {
    if (owner.callQueue === queueTail) {
      owner.callQueue = undefined;
    }
  };
  const queueTail = run.then(clearQueue, clearQueue);
  owner.callQueue = queueTail;

  return withAbort(
    run,
    signal,
    "Tool call was cancelled while waiting for another Z.AI MCP call to finish.",
  );
}

async function callMcpTool(
  { server: owner, toolName, args, registry, signal }: Omit<CuratedRequest, "onUpdate">,
  onProgress?: (message: string) => void,
) {
  owner.controller ??= new AbortController();
  const combinedSignal =
    signal !== undefined
      ? AbortSignal.any([signal, owner.controller.signal])
      : owner.controller.signal;
  throwIfAborted(signal, "Tool call was cancelled before it started.");
  onProgress?.(`Connecting to ${owner.label}...`);
  const client = await connect(owner, registry, combinedSignal);
  throwIfAborted(combinedSignal, "Tool call was cancelled before it reached Z.AI MCP.");
  onProgress?.(`Calling ${owner.label} ${toolName}...`);

  return client.callTool({ name: toolName, arguments: args }, undefined, {
    signal: combinedSignal,
    timeout: DEFAULT_TIMEOUT_MS,
    resetTimeoutOnProgress: true,
    onprogress: (progress) => {
      if (progress.message !== undefined && progress.message.length > 0) {
        onProgress?.(progress.message);
      }
    },
  });
}

function cleanArgs(args: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter((entry) => entry[1] !== undefined));
}

async function executeCuratedTool({
  server: owner,
  toolName,
  args,
  registry,
  signal,
  onUpdate,
}: CuratedRequest): Promise<AgentToolResult<CuratedDetails>> {
  const update = (progress: string) => {
    onUpdate?.({
      content: [{ type: "text", text: progress }],
      details: { server: owner.id, tool: toolName, progress },
    });
  };

  update(
    owner.callQueue !== undefined
      ? `Waiting for another ${owner.label} call to finish...`
      : `Starting ${owner.label} ${toolName}...`,
  );

  const result = await runExclusive(owner, signal, () =>
    callMcpTool({ server: owner, toolName, args: cleanArgs(args), registry, signal }, update),
  );
  const text = summarizeMcpResult(result);
  if (isMcpErrorResult(result)) {
    throw new Error(`Z.AI MCP ${owner.id}/${toolName} failed:\n${text}`);
  }
  const truncated = await truncateForTool(text);
  return {
    content: [{ type: "text", text: truncated.content }],
    structuredContent: {
      server: owner.id,
      tool: toolName,
      text: truncated.content,
      ...truncated.details,
    },
    details: { server: owner.id, tool: toolName, truncated: truncated.details },
  };
}

const REGISTRARS = {
  search: createRegistrar(SEARCH_TOOL, executeCuratedTool),
  reader: createRegistrar(READER_TOOL, executeCuratedTool),
  zread: createRegistrar(ZREAD_TOOL, executeCuratedTool),
  vision: createRegistrar(VISION_TOOL, executeCuratedTool),
} satisfies Record<ServerId, (pi: ZaiExtensionAPI, server: ManagedServer) => void>;

async function settleWithin(promise: Promise<unknown>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    promise.catch(() => null),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  if (timer !== undefined) {
    clearTimeout(timer);
  }
}

async function closeServers(
  servers: readonly ManagedServer[],
  terminateTimeoutMs = SHUTDOWN_TIMEOUT_MS,
) {
  await Promise.allSettled(
    servers.map(async (owner) => {
      if (owner.closePromise !== undefined) {
        return owner.closePromise;
      }
      owner.closed = true;
      owner.controller?.abort();
      const transport = owner.transport;
      owner.client = undefined;
      owner.transport = undefined;
      owner.connectPromise = undefined;
      owner.callQueue = undefined;
      owner.closePromise = (async () => {
        try {
          if (owner.kind === "http" && transport !== undefined && "terminateSession" in transport) {
            await settleWithin(transport.terminateSession(), terminateTimeoutMs);
          }
        } finally {
          await transport?.close().catch(() => null);
        }
      })();
      return owner.closePromise;
    }),
  );
}

function serverStatus(servers: readonly ManagedServer[]) {
  return servers.map((owner) => {
    const connected = Boolean(owner.client);
    return {
      id: owner.id,
      label: owner.label,
      kind: owner.kind,
      toolRegistered: true,
      connected,
      connectionStatus: connected ? "connected" : "lazy_not_connected_until_first_use",
      lastError: owner.lastError,
    };
  });
}

function registerConfiguredTools(pi: ZaiExtensionAPI, servers: readonly ManagedServer[]) {
  for (const owner of servers) {
    REGISTRARS[owner.id](pi, owner);
  }
}

function activeServerStatus() {
  const order = new Map<ServerId, number>(ALL_SERVER_IDS.map((id, index) => [id, index]));
  return serverStatus(
    getActiveServers().toSorted((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
  );
}

export function registerZaiMcpStatusCommand(pi: ZaiExtensionAPI): void {
  registerStatusCommand(pi, () => JSON.stringify(activeServerStatus(), null, 2));
}

export function registerZaiMcpServers(
  pi: ZaiExtensionAPI,
  serverIds: readonly ServerId[] = ALL_SERVER_IDS,
): void {
  const servers = createServers(serverIds);

  if (servers.length === 0) {
    console.warn(`[${EXTENSION_NAME}] no Z.AI MCP servers enabled; no tools registered.`);
  }

  const removeActiveServers = addActiveServers(servers);
  registerConfiguredTools(pi, servers);

  pi.on("session_start", (_event, ctx) => {
    warnOnceIfMissingApiKey(
      () => hasApiKeySource(ctx.modelRegistry),
      `[${EXTENSION_NAME}] No Z.ai API key found. Set Z_AI_API_KEY/ZAI_API_KEY/ZAI_CODING_CN_API_KEY or use Pi /login for a Z.AI provider. Z.ai MCP tools will fail until configured.`,
    );
    const failed = servers.filter(
      (owner) => owner.lastError !== undefined && owner.lastError.length > 0,
    );
    if (failed.length > 0 && ctx.hasUI) {
      ctx.ui.notify(
        `Z.ai MCP loaded with ${failed.length} error(s). Use /zai-mcp-status for details.`,
        "warning",
      );
    }
  });

  pi.on("session_shutdown", async () => {
    await closeServers(servers);
    removeActiveServers();
  });
}

export function createZaiMcpExtension(pi: ZaiExtensionAPI): void {
  registerZaiMcpServers(pi, legacyServerIds());
  registerZaiMcpStatusCommand(pi);
}

export const testHelpers = {
  closeServers,
  connectWith,
  getApiKey,
  hasApiKeySource,
  resetGlobalStateForTests,
  searchArgs,
  truncateForTool,
  visionArgs,
};

export default function zaiMcpExtension(pi: ZaiExtensionAPI): void {
  createZaiMcpExtension(pi);
}
