import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@mariozechner/pi-coding-agent";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Type } from "typebox";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const EXTENSION_NAME = "pi-zai-mcp";
const DEFAULT_TIMEOUT_MS = 120_000;

type ServerKind = "http" | "stdio";

type ServerConfig = {
  id: string;
  label: string;
  kind: ServerKind;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
};

type ManagedServer = ServerConfig & {
  client?: Client;
  transport?: StreamableHTTPClientTransport | StdioClientTransport;
  connectPromise?: Promise<Client>;
  lastError?: string;
};

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

const GENERIC_CALL_SCHEMA = Type.Object({
  server: Type.String({
    description: "Z.ai MCP server id: search, reader, zread, or vision.",
  }),
  tool: Type.String({ description: "Exact MCP tool name to call." }),
  arguments: Type.Optional(
    Type.Record(Type.String(), Type.Any(), {
      description: "Arguments object passed through to the MCP tool.",
    }),
  ),
});

const LIST_TOOLS_SCHEMA = Type.Object({
  server: Type.Optional(
    Type.String({
      description: "Optional Z.ai MCP server id to inspect: search, reader, zread, or vision.",
    }),
  ),
});

function getApiKey(): string | undefined {
  return process.env.Z_AI_API_KEY || process.env.ZAI_API_KEY;
}

function enabledServerIds(): Set<string> | undefined {
  const raw = process.env.Z_AI_MCP_SERVERS;
  if (!raw || raw.trim().length === 0 || raw.trim().toLowerCase() === "all") return undefined;
  return new Set(
    raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

function createServers(): ManagedServer[] {
  const apiKey = getApiKey();
  const enabled = enabledServerIds();

  const all: ManagedServer[] = [
    {
      id: "search",
      label: "Z.ai Web Search",
      kind: "http",
      url: "https://api.z.ai/api/mcp/web_search_prime/mcp",
    },
    {
      id: "reader",
      label: "Z.ai Web Reader",
      kind: "http",
      url: "https://api.z.ai/api/mcp/web_reader/mcp",
    },
    {
      id: "zread",
      label: "Z.ai Zread Repository Reader",
      kind: "http",
      url: "https://api.z.ai/api/mcp/zread/mcp",
    },
    {
      id: "vision",
      label: "Z.ai Vision",
      kind: "stdio",
      command: "npx",
      args: ["-y", "@z_ai/mcp-server@latest"],
      env: {
        ...process.env,
        ...(apiKey ? { Z_AI_API_KEY: apiKey } : {}),
        Z_AI_MODE: process.env.Z_AI_MODE || "ZAI",
      } as Record<string, string>,
    },
  ];

  return enabled ? all.filter((server) => enabled.has(server.id)) : all;
}

function piToolName(serverId: string, mcpToolName: string): string {
  const safeToolName = mcpToolName.replace(/[^a-zA-Z0-9_]/g, "_");
  return `z_ai_${serverId}_${safeToolName}`;
}

function normalizeInputSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return { type: "object", properties: {}, additionalProperties: true };
  }

  const objectSchema = schema as Record<string, unknown>;
  if (objectSchema.type === "object") return objectSchema;

  return {
    type: "object",
    properties: {
      value: objectSchema,
    },
    required: ["value"],
  };
}

function summarizeMcpResult(result: unknown): string {
  if (!result || typeof result !== "object") return String(result);

  const maybe = result as {
    content?: Array<Record<string, unknown>>;
    structuredContent?: unknown;
    isError?: boolean;
  };

  const parts: string[] = [];
  if (maybe.isError) parts.push("[MCP tool reported an error]");

  if (Array.isArray(maybe.content)) {
    for (const item of maybe.content) {
      if (item.type === "text" && typeof item.text === "string") {
        parts.push(item.text);
      } else if (item.type === "image" && typeof item.mimeType === "string") {
        parts.push(`[Image result: ${item.mimeType}, ${typeof item.data === "string" ? item.data.length : 0} base64 chars]`);
      } else if (item.type === "resource" && item.resource && typeof item.resource === "object") {
        const resource = item.resource as Record<string, unknown>;
        if (typeof resource.text === "string") {
          parts.push(`[Resource: ${String(resource.uri ?? "unknown")}]\n${resource.text}`);
        } else {
          parts.push(`[Resource: ${String(resource.uri ?? "unknown")}]`);
        }
      } else if (item.type === "resource_link") {
        parts.push(`[Resource link: ${String(item.name ?? item.uri ?? "unknown")}] ${String(item.uri ?? "")}`);
      } else {
        parts.push(JSON.stringify(item, null, 2));
      }
    }
  }

  if (maybe.structuredContent !== undefined) {
    parts.push(`Structured content:\n${JSON.stringify(maybe.structuredContent, null, 2)}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : JSON.stringify(result, null, 2);
}

async function truncateForTool(text: string, serverId: string, toolName: string): Promise<{ text: string; truncated: boolean; file?: string }> {
  const truncation = truncateHead(text, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  if (!truncation.truncated) return { text: truncation.content, truncated: false };

  const dir = join(tmpdir(), EXTENSION_NAME);
  await mkdir(dir, { recursive: true });
  const safeName = `${Date.now()}-${serverId}-${toolName}`.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const file = join(dir, `${safeName}.txt`);
  await writeFile(file, text, "utf8");

  const notice = `\n\n[Z.ai MCP output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Full output saved to: ${file}]`;
  return { text: truncation.content + notice, truncated: true, file };
}

async function connect(server: ManagedServer): Promise<Client> {
  if (server.client) return server.client;
  if (server.connectPromise) return server.connectPromise;

  server.connectPromise = (async () => {
    const client = new Client({ name: EXTENSION_NAME, version: "0.1.0" });

    if (server.kind === "http") {
      const apiKey = getApiKey();
      if (!apiKey) throw new Error("Missing Z_AI_API_KEY (or ZAI_API_KEY) environment variable.");
      if (!server.url) throw new Error(`Missing URL for ${server.id}`);
      const transport = new StreamableHTTPClientTransport(new URL(server.url), {
        requestInit: {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      });
      server.transport = transport;
      await client.connect(transport, { timeout: DEFAULT_TIMEOUT_MS });
    } else {
      if (!getApiKey()) throw new Error("Missing Z_AI_API_KEY (or ZAI_API_KEY) environment variable.");
      if (!server.command) throw new Error(`Missing command for ${server.id}`);
      const transport = new StdioClientTransport({
        command: server.command,
        args: server.args,
        env: server.env,
        stderr: "pipe",
      });
      server.transport = transport;
      await client.connect(transport, { timeout: DEFAULT_TIMEOUT_MS });
    }

    server.client = client;
    server.lastError = undefined;
    return client;
  })();

  try {
    return await server.connectPromise;
  } catch (error) {
    server.connectPromise = undefined;
    server.lastError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

async function listServerTools(server: ManagedServer): Promise<McpTool[]> {
  const client = await connect(server);
  const tools: McpTool[] = [];
  let cursor: string | undefined;

  do {
    const response = await client.listTools(cursor ? { cursor } : undefined, { timeout: DEFAULT_TIMEOUT_MS });
    tools.push(...response.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })));
    cursor = response.nextCursor;
  } while (cursor);

  return tools;
}

async function callMcpTool(
  server: ManagedServer,
  toolName: string,
  args: Record<string, unknown> | undefined,
  signal: AbortSignal | undefined,
  onProgress?: (message: string) => void,
) {
  const client = await connect(server);
  return client.callTool(
    { name: toolName, arguments: args ?? {} },
    undefined,
    {
      signal,
      timeout: DEFAULT_TIMEOUT_MS,
      resetTimeoutOnProgress: true,
      onprogress: (progress) => {
        if (progress.message) onProgress?.(progress.message);
      },
    },
  );
}

function findServer(servers: ManagedServer[], id: string): ManagedServer {
  const server = servers.find((candidate) => candidate.id === id);
  if (!server) throw new Error(`Unknown Z.ai MCP server '${id}'. Enabled servers: ${servers.map((s) => s.id).join(", ") || "none"}`);
  return server;
}

function registerGenericTools(pi: ExtensionAPI, servers: ManagedServer[]) {
  pi.registerTool({
    name: "z_ai_mcp_list_tools",
    label: "Z.ai MCP List Tools",
    description: "List tools exposed by the configured Z.ai MCP servers.",
    promptSnippet: "List available Z.ai MCP tools from search, reader, zread, and vision servers",
    promptGuidelines: [
      "Use z_ai_mcp_list_tools to discover Z.ai MCP tool names and schemas when a specific z_ai_* wrapper is unavailable or failed to register.",
    ],
    parameters: LIST_TOOLS_SCHEMA,
    async execute(_toolCallId, params) {
      const targets = params.server ? [findServer(servers, params.server)] : servers;
      const output: Record<string, unknown> = {};

      for (const server of targets) {
        try {
          output[server.id] = await listServerTools(server);
        } catch (error) {
          output[server.id] = { error: error instanceof Error ? error.message : String(error) };
        }
      }

      const text = JSON.stringify(output, null, 2);
      const truncated = await truncateForTool(text, "all", "list_tools");
      return {
        content: [{ type: "text", text: truncated.text }],
        details: { servers: output, truncated },
      };
    },
  });

  pi.registerTool({
    name: "z_ai_mcp_call_tool",
    label: "Z.ai MCP Call Tool",
    description: "Call any configured Z.ai MCP tool by exact server id and MCP tool name. Output is truncated to 50KB/2000 lines and full output is saved to a temp file when truncated.",
    promptSnippet: "Call any Z.ai MCP server tool by server id, tool name, and arguments",
    promptGuidelines: [
      "Use z_ai_mcp_call_tool only after you know the exact Z.ai MCP server id, tool name, and argument schema, preferably from z_ai_mcp_list_tools.",
    ],
    parameters: GENERIC_CALL_SCHEMA,
    async execute(_toolCallId, params, signal, onUpdate) {
      const server = findServer(servers, params.server);
      const result = await callMcpTool(
        server,
        params.tool,
        params.arguments,
        signal,
        (message) => onUpdate?.({ content: [{ type: "text", text: message }], details: { progress: message } }),
      );
      const text = summarizeMcpResult(result);
      const truncated = await truncateForTool(text, server.id, params.tool);
      return {
        content: [{ type: "text", text: truncated.text }],
        details: { server: server.id, tool: params.tool, result, truncated },
      };
    },
  });
}

function registerDiscoveredTool(pi: ExtensionAPI, server: ManagedServer, tool: McpTool) {
  const toolName = piToolName(server.id, tool.name);
  const description = tool.description || `${server.label} MCP tool '${tool.name}'.`;

  pi.registerTool({
    name: toolName,
    label: `${server.label}: ${tool.name}`,
    description: `${description}\n\nProxies the Z.ai MCP '${tool.name}' tool on server '${server.id}'. Output is truncated to 50KB/2000 lines and full output is saved to a temp file when truncated.`,
    promptSnippet: description,
    promptGuidelines: [
      `Use ${toolName} when the user asks for ${server.label} capability handled by the Z.ai MCP tool '${tool.name}'.`,
    ],
    parameters: normalizeInputSchema(tool.inputSchema) as never,
    async execute(_toolCallId, params: Record<string, unknown>, signal, onUpdate) {
      const result = await callMcpTool(
        server,
        tool.name,
        params,
        signal,
        (message) => onUpdate?.({ content: [{ type: "text", text: message }], details: { progress: message } }),
      );
      const text = summarizeMcpResult(result);
      const truncated = await truncateForTool(text, server.id, tool.name);
      return {
        content: [{ type: "text", text: truncated.text }],
        details: { server: server.id, tool: tool.name, result, truncated },
      };
    },
  });
}

async function closeServers(servers: ManagedServer[]) {
  await Promise.allSettled(
    servers.map(async (server) => {
      if (server.transport instanceof StreamableHTTPClientTransport) {
        await server.transport.terminateSession().catch(() => undefined);
      }
      await server.transport?.close().catch(() => undefined);
      server.client = undefined;
      server.transport = undefined;
      server.connectPromise = undefined;
    }),
  );
}

function serverStatus(servers: ManagedServer[]) {
  return servers.map((server) => ({
    id: server.id,
    label: server.label,
    kind: server.kind,
    connected: Boolean(server.client),
    lastError: server.lastError,
  }));
}

export default async function zaiMcpExtension(pi: ExtensionAPI) {
  const servers = createServers();
  registerGenericTools(pi, servers);

  pi.registerCommand("zai-mcp-status", {
    description: "Show configured Z.ai MCP servers and connection status",
    handler: async (_args, ctx) => {
      const status = serverStatus(servers);
      ctx.ui.notify(JSON.stringify(status, null, 2), "info");
    },
  });

  if (!getApiKey()) {
    console.warn(`[${EXTENSION_NAME}] Z_AI_API_KEY (or ZAI_API_KEY) is not set; Z.ai MCP tools will fail until configured.`);
    return;
  }

  for (const server of servers) {
    try {
      const tools = await listServerTools(server);
      for (const tool of tools) registerDiscoveredTool(pi, server, tool);
      console.warn(`[${EXTENSION_NAME}] registered ${tools.length} tool(s) from ${server.id}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      server.lastError = message;
      console.warn(`[${EXTENSION_NAME}] failed to discover ${server.id} tools: ${message}`);
    }
  }

  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    const failed = servers.filter((server) => server.lastError);
    if (failed.length > 0 && ctx.hasUI) {
      ctx.ui.notify(
        `Z.ai MCP loaded with ${failed.length} discovery error(s). Use /zai-mcp-status or z_ai_mcp_list_tools for details.`,
        "warning",
      );
    }
  });

  pi.on("session_shutdown", async () => {
    await closeServers(servers);
  });
}
