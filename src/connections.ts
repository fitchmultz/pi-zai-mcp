import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { createRequire } from "node:module";
import { getServiceAuth } from "./auth.ts";
import { httpServerUrl, type ManagedServer, type Connection } from "./servers.ts";
import type { CuratedRequest, Registry } from "./register-tool.ts";
import { isRecord } from "./tools.ts";

const require = createRequire(import.meta.url);
const packageJson: unknown = require("../package.json");
if (!isRecord(packageJson) || typeof packageJson.version !== "string") {
  throw new Error("Missing pi-zai-mcp package version.");
}
const EXTENSION_VERSION = packageJson.version;
const DEFAULT_TIMEOUT_MS = positiveIntegerFromEnv("Z_AI_MCP_TIMEOUT_MS", 300_000);
const SHUTDOWN_TIMEOUT_MS = 1_000;
const REQUEST_TIMEOUT_CODE: number = ErrorCode.RequestTimeout;

function positiveIntegerFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.length === 0) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 2_147_483_647 ? parsed : fallback;
}

function ownConnection(connection: Readonly<Pick<Connection, "client" | "transport">>): Connection {
  const { client, transport } = connection;
  const ended = new Promise<void>((resolve) => {
    client.onclose = resolve;
  });
  let closing: Promise<void> | undefined;
  return {
    ...connection,
    close: () => {
      closing ??= (async () => {
        // SDK initialize failure may already clear pid while its child is still closing.
        const spawned = transport instanceof StdioClientTransport && client.transport === transport;
        await transport.close().catch(() => null);
        if (spawned) {
          await ended;
        }
      })();
      return closing;
    },
  };
}

function invalidate(owner: ManagedServer, connection: Connection): void {
  if (owner.connection === connection) {
    owner.connection = undefined;
    owner.connectionStatus = "disconnected";
  }
}

async function disconnect(owner: ManagedServer, connection: Connection): Promise<void> {
  invalidate(owner, connection);
  const closing = connection.close();
  owner.disconnectPromise = closing;
  try {
    await closing;
  } finally {
    if (owner.disconnectPromise === closing) {
      owner.disconnectPromise = undefined;
    }
  }
}

export async function connectWith(
  owner: ManagedServer,
  signal: AbortSignal | undefined,
  createConnection: () =>
    | Readonly<Pick<Connection, "client" | "transport">>
    | Promise<Readonly<Pick<Connection, "client" | "transport">>>,
): Promise<Client> {
  if (owner.closed === true) {
    throw new Error("Z.AI MCP connection owner has shut down.");
  }
  if (owner.connectPromise !== undefined) {
    return owner.connectPromise;
  }
  if (owner.connection !== undefined) {
    return owner.connection.client;
  }
  owner.controller ??= new AbortController();
  const combinedSignal =
    signal !== undefined
      ? AbortSignal.any([signal, owner.controller.signal])
      : owner.controller.signal;
  owner.connectionStatus = "connecting";
  const attempt = (async () => {
    let connection: Connection | undefined;
    try {
      await owner.disconnectPromise;
      throwIfAborted(
        combinedSignal,
        "Tool call was cancelled while preparing Z.AI MCP authentication.",
      );
      connection = ownConnection(await createConnection());
      throwIfAborted(
        combinedSignal,
        "Tool call was cancelled while preparing Z.AI MCP authentication.",
      );
      owner.connection = connection;
      const current = connection;
      const ended = connection.client.onclose;
      connection.client.onclose = () => {
        ended?.();
        if (owner.connection === current && owner.closed !== true) {
          owner.lastError = "Z.AI MCP connection closed.";
        }
        invalidate(owner, current);
      };
      await withAbort(
        connection.client.connect(connection.transport, {
          signal: combinedSignal,
          timeout: DEFAULT_TIMEOUT_MS,
        }),
        combinedSignal,
        "Tool call was cancelled while connecting to Z.AI MCP.",
      );
      throwIfAborted(combinedSignal, "Tool call was cancelled while connecting to Z.AI MCP.");
      if (owner.closed === true || owner.connection !== connection) {
        throw new Error("Z.AI MCP connection closed while connecting.");
      }
      owner.connectionStatus = "connected";
      return connection.client;
    } catch (error) {
      if (connection !== undefined) {
        await disconnect(owner, connection);
      }
      owner.connectionStatus = owner.closed === true ? "disconnected" : "failed";
      throw error;
    }
  })();
  owner.connectPromise = attempt;
  try {
    return await attempt;
  } finally {
    if (owner.connectPromise === attempt) {
      owner.connectPromise = undefined;
    }
  }
}

async function connect(
  owner: ManagedServer,
  registry: Registry,
  signal: AbortSignal,
): Promise<Client> {
  return connectWith(owner, signal, async () => {
    const auth = await getServiceAuth(registry);
    if (auth === undefined) {
      throw new Error(
        "Missing Z.ai API key. Set Z_AI_API_KEY/ZAI_API_KEY/ZAI_CODING_CN_API_KEY or run pi /login for the zai or zai-coding-cn provider.",
      );
    }
    const client = new Client({ name: "pi-zai-mcp", version: EXTENSION_VERSION });
    if (owner.kind === "http") {
      return {
        client,
        transport: new StreamableHTTPClientTransport(
          new URL(httpServerUrl(owner.id, auth.platform)),
          {
            requestInit: { headers: { Authorization: `Bearer ${auth.key}` } },
          },
        ),
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
        env: {
          ...owner.env,
          Z_AI_MODE:
            owner.env?.Z_AI_MODE === undefined || owner.env.Z_AI_MODE.length === 0
              ? auth.platform
              : owner.env.Z_AI_MODE,
          Z_AI_API_KEY: auth.key,
        },
        stderr: "ignore",
      }),
    };
  });
}

function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
  if (signal?.aborted === true) {
    throw new Error(message);
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
    throw new Error(message);
  }
  const cancelled = Promise.withResolvers<never>();
  const onAbort = () => {
    cancelled.reject(new Error(message));
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    return await Promise.race([promise, cancelled.promise]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export async function runExclusive<T>(
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

export async function callMcpTool(
  { server: owner, toolName, args, registry, signal }: Omit<CuratedRequest, "onUpdate">,
  onProgress?: (message: string) => void,
): ReturnType<Client["callTool"]> {
  owner.controller ??= new AbortController();
  const combinedSignal =
    signal !== undefined
      ? AbortSignal.any([signal, owner.controller.signal])
      : owner.controller.signal;
  throwIfAborted(combinedSignal, "Tool call was cancelled before it started.");
  onProgress?.(`Connecting to ${owner.label}...`);
  await connect(owner, registry, combinedSignal);
  throwIfAborted(combinedSignal, "Tool call was cancelled before it reached Z.AI MCP.");
  const connection = owner.connection;
  if (connection === undefined) {
    throw new Error("Z.AI MCP connection closed before the call started.");
  }
  onProgress?.(`Calling ${owner.label} ${toolName}...`);
  const sessionId =
    connection.transport instanceof StreamableHTTPClientTransport
      ? connection.transport.sessionId
      : undefined;
  try {
    return await connection.client.callTool({ name: toolName, arguments: args }, undefined, {
      signal: combinedSignal,
      timeout: DEFAULT_TIMEOUT_MS,
      resetTimeoutOnProgress: true,
      onprogress: (progress) => {
        if (progress.message !== undefined && progress.message.length > 0) {
          onProgress?.(progress.message);
        }
      },
    });
  } catch (error) {
    if (shouldDisconnect(error, combinedSignal, sessionId)) {
      // The vendor ignores MCP cancellation; finish disposal before releasing this server's queue.
      await disconnect(owner, connection);
    }
    throw error;
  }
}

function shouldDisconnect(
  error: unknown,
  signal: AbortSignal,
  sessionId: string | undefined,
): boolean {
  return (
    signal.aborted ||
    (error instanceof McpError && error.code === REQUEST_TIMEOUT_CODE) ||
    (sessionId !== undefined && error instanceof StreamableHTTPError && error.code === 404)
  );
}

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

export async function closeServers(
  servers: readonly ManagedServer[],
  terminateTimeoutMs = SHUTDOWN_TIMEOUT_MS,
): Promise<void> {
  await Promise.allSettled(
    servers.map(async (owner) => {
      if (owner.closePromise !== undefined) {
        return owner.closePromise;
      }
      owner.closed = true;
      owner.controller?.abort();
      const connection = owner.connection;
      const disconnecting = owner.disconnectPromise;
      owner.connection = undefined;
      owner.connectionStatus = "disconnected";
      owner.connectPromise = undefined;
      owner.callQueue = undefined;
      owner.closePromise = (async () => {
        try {
          if (connection?.transport instanceof StreamableHTTPClientTransport) {
            await settleWithin(connection.transport.terminateSession(), terminateTimeoutMs);
          }
        } finally {
          await Promise.all([connection?.close(), disconnecting]);
        }
      })();
      return owner.closePromise;
    }),
  );
}
