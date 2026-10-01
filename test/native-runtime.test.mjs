import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
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
  const calls = [];
  let terminations = 0;
  const server = createServer(async (req, res) => {
    if (req.method === "DELETE") {
      terminations++;
      res.writeHead(200).end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const message = JSON.parse(Buffer.concat(chunks).toString());
    if (message.id === undefined) {
      res.writeHead(202).end();
      return;
    }
    const result = message.method === "initialize"
      ? { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1" } }
      : message.params.arguments.search_query === "fixture-error"
        ? { isError: true, content: [{ type: "text", text: "Owned service failure" }] }
        : { content: [{ type: "text", text: "Local search result" }] };
    if (message.method === "tools/call") calls.push({ auth: req.headers.authorization, params: message.params });
    res.writeHead(200, { "content-type": "application/json", "mcp-session-id": "fixture-session" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  globalThis.fetch = (input, options) => {
    const url = new URL(typeof input === "string" ? input : input.url ?? input);
    assert.equal(url.href, "https://api.z.ai/api/mcp/web_search_prime/mcp", "only search may reach the fixture");
    return fetch(`http://127.0.0.1:${server.address().port}/mcp`, options);
  };
  t.after(async () => {
    globalThis.fetch = fetch;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
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
    process.env.Z_AI_API_KEY = "local-fixture-key";
    const result = await search.execute("search-2", args, undefined, undefined, session.extensionRunner.createContext());
    assert.equal(result.content[0].text, "Local search result");
    assert.deepEqual(result.structuredContent, {
      server: "search", tool: "web_search_prime", text: "Local search result", truncated: false,
    }, "native callers receive the bounded curated result, not private MCP details");
    assert.deepEqual(calls.map(({ auth, params }) => ({ auth, name: params.name, arguments: params.arguments })), [{
      auth: "Bearer local-fixture-key", name: "web_search_prime",
      arguments: { search_query: "native contract", content_size: "high" },
    }]);
    const connected = getActiveServers().find((server) => server.id === "search");
    assert.ok(connected.client && connected.transport);
    await assert.rejects(() => search.execute("search-error", { query: "fixture-error" }, undefined, undefined, session.extensionRunner.createContext()), /Owned service failure/);
    const failure = search.renderResult({ content: [{ type: "text", text: "Owned service failure" }] },
      { expanded: false, isPartial: false }, { fg: (_color, text) => text }, { isError: true });
    assert.match(failure.render(80).join("\n"), /failed/);
    assert.equal(calls.length, 2, "a failed MCP result is not automatically replayed");
    await session.reload();
    assert.equal(terminations, 1, "reload terminates the connected MCP session");
    assert.ok(!connected.client && !connected.transport, "reload releases the old transport");
    assert.equal(getActiveServers().length, 4, "reload must release old registrations, not duplicate them");
    assert.deepEqual(errors, []);
  } finally {
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
  }
  assert.deepEqual(getActiveServers(), [], "native shutdown removes every split resource's state");
});
