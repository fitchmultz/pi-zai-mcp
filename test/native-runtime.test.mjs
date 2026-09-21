import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { InMemoryCredentialStore, validateToolArguments } from "@earendil-works/pi-ai";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { getActiveServers } from "../src/runtime-state.ts";

test("five native resources share lazy status and release servers on shutdown/reload", { timeout: 30_000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "zai-mcp-native-"));
  const agentDir = join(root, "agent");
  await mkdir(agentDir);
  const oldEnv = { ...process.env };
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env.PI_OFFLINE = "1";
  for (const key of ["Z_AI_API_KEY", "ZAI_API_KEY", "ZAI_CODING_CN_API_KEY"]) delete process.env[key];
  const fetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("No external MCP service is allowed in this contract"); };
  t.after(async () => {
    globalThis.fetch = fetch;
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env, oldEnv);
    await rm(root, { recursive: true, force: true });
  });
  const settingsManager = SettingsManager.inMemory();
  const loader = new DefaultResourceLoader({ cwd: root, agentDir, settingsManager,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    additionalExtensionPaths: [fileURLToPath(new URL("../", import.meta.url))] });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  assert.equal(loader.getExtensions().extensions.length, 5);
  const modelRuntime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null,
    modelsStorePath: join(agentDir, "models-store.json"), allowModelNetwork: false });
  const { session } = await createAgentSession({ cwd: root, agentDir, modelRuntime, resourceLoader: loader,
    settingsManager, sessionManager: SessionManager.inMemory(root), noTools: "builtin" });
  const notifications = [];
  const errors = [];
  try {
    await session.bindExtensions({ mode: "rpc", onError: (error) => errors.push(error),
      uiContext: { ...session.extensionRunner.createContext().ui, notify: (text) => notifications.push(text) } });
    assert.deepEqual(session.getActiveToolNames().sort(), ["z_ai_reader", "z_ai_search", "z_ai_vision", "z_ai_zread"]);
    await session.prompt("/zai-mcp-status");
    const status = JSON.parse(notifications.at(-1));
    assert.deepEqual(status.map((server) => server.id), ["search", "reader", "zread", "vision"]);
    assert.ok(status.every((server) => server.connected === false && server.connectionStatus === "lazy_not_connected_until_first_use"));
    const search = session.extensionRunner.getToolDefinition("z_ai_search");
    const args = validateToolArguments(search, { type: "toolCall", id: "search-1", name: search.name, arguments: { query: "native contract" } });
    await assert.rejects(() => search.execute("search-1", args, undefined, undefined, session.extensionRunner.createContext()), /Missing Z.ai API key/);
    assert.ok(getActiveServers().every((server) => !server.client && !server.transport));
    await session.reload();
    assert.equal(getActiveServers().length, 4, "reload must release old registrations, not duplicate them");
    assert.deepEqual(errors, []);
  } finally {
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
  }
  assert.deepEqual(getActiveServers(), [], "native shutdown removes every split resource's state");
});
