import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
  Object.assign(process.env, {
    ANTHROPIC_AUTH_TOKEN: "synthetic-unrelated-secret",
    OPENAI_API_KEY: "synthetic-other-secret",
    NODE_OPTIONS: "--no-warnings",
    Z_AI_VISION_MODEL: "synthetic-configured-model",
    Z_AI_VISION_MODEL_MAX_TOKENS: "42",
  });
  for (const key of ["Z_AI_API_KEY", "ZAI_API_KEY", "ZAI_CODING_CN_API_KEY"]) delete process.env[key];
  const fetch = globalThis.fetch;
  const calls = [];
  const fullOutput = "private search result\n".repeat(3_000);
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
        : { content: [{ type: "text", text: message.params.arguments.search_query === "large-output" ? fullOutput : "Local search result" }] };
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
  for (const [resource, tool] of [
    ["search", "z_ai_search"], ["reader", "z_ai_reader"],
    ["zread", "z_ai_zread"], ["vision", "z_ai_vision"],
  ]) {
    const path = fileURLToPath(new URL(`../extensions/zai-mcp-${resource}.ts`, import.meta.url));
    const extension = loader.getExtensions().extensions.find((extension) => extension.path === path);
    assert.ok(extension, `native loader must load the ${resource} resource`);
    assert.deepEqual([...extension.tools.keys()], [tool], `${resource} resource must own only its service tool`);
  }
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
    await t.test("native large output is private even under shared temp and umask 022",
      { skip: process.platform === "win32" }, async () => {
        const sharedTemp = await mkdtemp("/tmp/zai-mcp-shared-");
        await chmod(sharedTemp, 0o777);
        const previousTemp = process.env.TMPDIR;
        const previousUmask = process.umask(0o022);
        process.env.TMPDIR = sharedTemp;
        try {
          const large = await search.execute("search-large", { query: "large-output" }, undefined, undefined, session.extensionRunner.createContext());
          const file = large.structuredContent.file;
          assert.equal(large.structuredContent.truncated, true);
          assert.equal(await readFile(file, "utf8"), fullOutput, "full wire output remains retrievable");
          assert.match(large.content[0].text, /Full output saved to:/);
          assert.equal((await stat(sharedTemp)).mode & 0o777, 0o777);
          assert.equal((await stat(dirname(file))).mode & 0o777, 0o700, "saved output directory must be private");
          assert.equal((await stat(file)).mode & 0o777, 0o600, "saved output file must be private");
        } finally {
          process.umask(previousUmask);
          if (previousTemp === undefined) delete process.env.TMPDIR;
          else process.env.TMPDIR = previousTemp;
          await rm(sharedTemp, { recursive: true, force: true });
        }
      });
    const image = join(root, "image.png");
    await writeFile(image, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aONsAAAAASUVORK5CYII=", "base64"));
    const preload = fileURLToPath(new URL("./fixtures/vision-offline.mjs", import.meta.url));
    await t.test("real vision child uses only the selected service credential and preserves vendor options", async () => {
      process.env.Z_AI_API_KEY = "synthetic-zai-credential";
      getActiveServers().find((server) => server.id === "vision").args.unshift("--import", preload);
      const vision = session.extensionRunner.getToolDefinition("z_ai_vision");
      const result = await vision.execute("vision-valid", { action: "analyze_image", image_source: image, prompt: "Report the intercepted offline request" },
        undefined, undefined, session.extensionRunner.createContext());
      const receipt = JSON.parse(result.content[0].text);
      assert.equal(receipt.authorization, "Bearer synthetic-zai-credential");
      assert.deepEqual(receipt.unrelatedEnvironment, [], "unrelated credentials and Node hooks must not reach the child");
      assert.equal(receipt.model, "synthetic-configured-model");
      assert.equal(receipt.maxTokens, 42);
    });
    await session.reload();
    assert.equal(terminations, 1, "reload terminates the connected MCP session");
    assert.ok(!connected.client && !connected.transport, "reload releases the old transport");
    assert.equal(getActiveServers().length, 4, "reload must release old registrations, not duplicate them");
    await t.test("placeholder vision credential cannot fall back to another provider", async () => {
      process.env.Z_AI_API_KEY = "your_api_key";
      getActiveServers().find((server) => server.id === "vision").args.unshift("--import", preload);
      const vision = session.extensionRunner.getToolDefinition("z_ai_vision");
      await assert.rejects(() => vision.execute("vision-placeholder", { action: "analyze_image", image_source: image, prompt: "Must not use another provider credential" },
        undefined, undefined, session.extensionRunner.createContext()), /Connection closed|Z_AI_API_KEY/);
    });
    assert.deepEqual(errors, []);
  } finally {
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
  }
  assert.deepEqual(getActiveServers(), [], "native shutdown removes every split resource's state");
});
