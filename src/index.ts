import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { SEARCH_TOOL, READER_TOOL, ZREAD_TOOL, VISION_TOOL } from "./curated-tools.ts";
import {
  createRegistrar,
  type CuratedDetails,
  type CuratedRequest,
  type ZaiExtensionAPI,
} from "./register-tool.ts";
import { isRecord, searchArgs, visionArgs } from "./tools.ts";
import { boundError, summarizeMcpResult, truncateForTool } from "./output.ts";
import { callMcpTool, closeServers, connectWith, runExclusive } from "./connections.ts";
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
import { getServiceAuth, hasApiKeySource } from "./auth.ts";

const EXTENSION_NAME = "pi-zai-mcp";

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
  return runExclusive(owner, signal, async () => {
    try {
      const result = await callMcpTool(
        { server: owner, toolName, args: cleanArgs(args), registry, signal },
        update,
      );
      const text = summarizeMcpResult(result);
      if (isRecord(result) && result.isError === true) {
        throw new Error(`Z.AI MCP ${owner.id}/${toolName} failed:\n${text}`);
      }
      const truncated = await truncateForTool(text);
      owner.lastError = undefined;
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
    } catch (error) {
      const bounded = await boundError(error);
      owner.lastError = bounded.message;
      throw bounded;
    }
  });
}

const REGISTRARS = {
  search: createRegistrar(SEARCH_TOOL, executeCuratedTool),
  reader: createRegistrar(READER_TOOL, executeCuratedTool),
  zread: createRegistrar(ZREAD_TOOL, executeCuratedTool),
  vision: createRegistrar(VISION_TOOL, executeCuratedTool),
} satisfies Record<ServerId, (pi: ZaiExtensionAPI, server: ManagedServer) => void>;

function serverStatus(servers: readonly ManagedServer[]) {
  return servers.map((owner) => ({
    id: owner.id,
    label: owner.label,
    kind: owner.kind,
    toolRegistered: true,
    connected: owner.connectionStatus === "connected" && owner.connection !== undefined,
    connectionStatus: owner.connectionStatus ?? "lazy_not_connected_until_first_use",
    lastError: owner.lastError,
  }));
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
      () => {
        const message = `[${EXTENSION_NAME}] No Z.ai API key found. Set Z_AI_API_KEY/ZAI_API_KEY/ZAI_CODING_CN_API_KEY or use Pi /login for a Z.AI provider. Z.ai MCP tools will fail until configured.`;
        if (ctx.hasUI) {
          ctx.ui.notify(message, "warning");
        } else {
          console.warn(message);
        }
      },
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
  getServiceAuth,
  hasApiKeySource,
  resetGlobalStateForTests,
  searchArgs,
  truncateForTool,
  visionArgs,
};

export default function zaiMcpExtension(pi: ZaiExtensionAPI): void {
  createZaiMcpExtension(pi);
}
