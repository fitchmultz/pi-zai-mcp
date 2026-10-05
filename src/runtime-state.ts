import type { ZaiExtensionAPI } from "./register-tool.ts";
import type { ManagedServer } from "./servers.ts";

type GlobalState = {
  activeServers: Set<ManagedServer>;
  warnedMissingApiKey: boolean;
};

const STATE_KEY = Symbol.for("pi-zai-mcp.state");

function hasGlobalState(host: object): host is { [STATE_KEY]: GlobalState } {
  return STATE_KEY in host;
}

function globalState(): GlobalState {
  const host: object = globalThis;
  if (hasGlobalState(host)) {
    return host[STATE_KEY];
  }
  const state: GlobalState = {
    activeServers: new Set<ManagedServer>(),
    warnedMissingApiKey: false,
  };
  Object.defineProperty(host, STATE_KEY, { value: state });
  return state;
}

export function addActiveServers(servers: readonly ManagedServer[]): () => void {
  const state = globalState();
  for (const server of servers) {
    state.activeServers.add(server);
  }
  return () => {
    for (const server of servers) {
      state.activeServers.delete(server);
    }
  };
}

export function getActiveServers(): ManagedServer[] {
  return [...globalState().activeServers];
}

export function warnOnceIfMissingApiKey(hasApiKeySource: () => boolean, message: string): void {
  const state = globalState();
  if (state.warnedMissingApiKey || hasApiKeySource()) {
    return;
  }
  state.warnedMissingApiKey = true;
  console.warn(message);
}

export function resetGlobalStateForTests(): void {
  const state = globalState();
  state.activeServers.clear();
  state.warnedMissingApiKey = false;
}

export function registerStatusCommand(
  pi: Readonly<Pick<ZaiExtensionAPI, "registerCommand">>,
  getStatusJson: () => string,
): void {
  pi.registerCommand("zai-mcp-status", {
    description: "Show configured Z.ai MCP servers and connection status",
    handler: async (_args, ctx) => {
      const status = getStatusJson();
      if (ctx.hasUI) {
        ctx.ui.notify(status, "info");
      } else {
        const stream = ctx.mode === "print" ? process.stdout : process.stderr;
        stream.write(`${status}\n`);
      }
    },
  });
}
