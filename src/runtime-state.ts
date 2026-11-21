import type { ZaiExtensionAPI } from "./register-tool.ts";
import type { ManagedServer } from "./servers.ts";

// Split resources load as separate module instances, so they share one Pi session's servers
// here, keyed by that session's sessionManager. Membership follows session_start/session_shutdown.
type SessionRegistry = {
  sessions: WeakMap<object, Set<ManagedServer>>;
  warnedSessions: WeakSet<object>;
};

const STATE_KEY = Symbol.for("pi-zai-mcp.session-state");

function hasSessionRegistry(host: object): host is { [STATE_KEY]: SessionRegistry } {
  return STATE_KEY in host;
}

function sessionRegistry(): SessionRegistry {
  const host: object = globalThis;
  if (hasSessionRegistry(host)) {
    return host[STATE_KEY];
  }
  const state: SessionRegistry = {
    sessions: new WeakMap<object, Set<ManagedServer>>(),
    warnedSessions: new WeakSet<object>(),
  };
  Object.defineProperty(host, STATE_KEY, { value: state });
  return state;
}

export function addActiveServers(session: object, servers: readonly ManagedServer[]): () => void {
  const state = sessionRegistry();
  const active = state.sessions.get(session) ?? new Set<ManagedServer>();
  for (const server of servers) {
    active.add(server);
  }
  if (active.size > 0) {
    state.sessions.set(session, active);
  }
  return () => {
    for (const server of servers) {
      active.delete(server);
    }
    if (state.sessions.get(session) === active && active.size === 0) {
      state.sessions.delete(session);
    }
  };
}

export function getActiveServers(session: object): ManagedServer[] {
  return [...(sessionRegistry().sessions.get(session) ?? [])];
}

export function warnOnceIfMissingApiKey(
  session: object,
  hasApiKeySource: () => boolean,
  warn: () => void,
): void {
  const state = sessionRegistry();
  if (state.warnedSessions.has(session) || hasApiKeySource()) {
    return;
  }
  state.warnedSessions.add(session);
  warn();
}

export function registerStatusCommand(
  pi: Readonly<Pick<ZaiExtensionAPI, "registerCommand">>,
  getStatusJson: (session: object) => string,
): void {
  pi.registerCommand("zai-mcp-status", {
    description: "Show configured Z.ai MCP servers and connection status",
    handler: async (_args, ctx) => {
      const status = getStatusJson(ctx.sessionManager);
      if (ctx.hasUI) {
        ctx.ui.notify(status, "info");
      } else {
        const stream = ctx.mode === "print" ? process.stdout : process.stderr;
        stream.write(`${status}\n`);
      }
    },
  });
}
