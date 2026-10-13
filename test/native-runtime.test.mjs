import assert from "node:assert/strict";
import { access, chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { watch } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryCredentialStore, validateToolArguments } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  initTheme,
} from "@earendil-works/pi-coding-agent";
import {
  CallToolRequestSchema,
  InitializeRequestSchema,
  JSONRPCRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getActiveServers } from "../src/runtime-state.ts";
import { isRecord } from "../src/tools.ts";

/** @typedef {Readonly<{root: string; agentDir: string; childHome: string; logPath: string}>} Fixture */
/** @typedef {import("node:test").TestContext} TestContext */
/** @typedef {import("@earendil-works/pi-coding-agent").AgentSession} NativeSession */
/** @typedef {import("node:http").IncomingMessage} FixtureRequest */
/** @typedef {import("node:http").ServerResponse} FixtureResponse */
/** @typedef {Readonly<{calls: readonly Readonly<{auth?: string; path?: string; sessionId?: string; params: Readonly<{name: string; arguments?: Readonly<Record<string, unknown>>}>}>[]; urls: readonly string[]; initializations: () => number; terminations: () => number}>} HttpFixture */

/** @param {Readonly<{content: readonly Readonly<{type: string; text?: string}>[]}>} result */
function textContent(result) {
  const first = result.content[0];
  assert.ok(first !== undefined && first.type === "text" && typeof first.text === "string");
  return first.text;
}

/** @param {TestContext} t */
async function createFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "zai-mcp-native-"));
  const agentDir = join(root, "agent");
  const childHome = join(root, "child-home");
  const logPath = join(root, "selected-private.log");
  await Promise.all([mkdir(agentDir), mkdir(childHome), writeFile(logPath, "", { mode: 0o600 })]);
  const oldEnv = { ...process.env };
  Object.assign(process.env, {
    PI_CODING_AGENT_DIR: agentDir,
    PI_OFFLINE: "1",
    HOME: childHome,
    ZAI_MCP_LOG_PATH: logPath,
    ANTHROPIC_AUTH_TOKEN: "synthetic-unrelated-secret",
    OPENAI_API_KEY: "synthetic-other-secret",
    NODE_OPTIONS: "--no-warnings",
    Z_AI_VISION_MODEL_MAX_TOKENS: "42",
    Z_AI_BASE_URL: "https://api.z.ai/api/coding/paas/v4",
  });
  for (const key of [
    "Z_AI_API_KEY",
    "ZAI_API_KEY",
    "ZAI_CODING_CN_API_KEY",
    "Z_AI_VISION_MODEL",
    "Z_AI_VISION_MODEL_TEMPERATURE",
    "Z_AI_VISION_MODEL_TOP_P",
    "PLATFORM_MODE",
    "Z_AI_MODE",
    "Z_AI_MCP_TIMEOUT_MS",
    "SERVER_NAME",
  ]) {
    delete process.env[key];
  }
  t.after(async () => {
    for (const key of Object.keys(process.env)) {
      if (!(key in oldEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, oldEnv);
    await rm(root, { recursive: true, force: true });
  });
  return { root, agentDir, childHome, logPath };
}

/** @param {TestContext} t */
async function searchFixture(t) {
  /** @type {{auth?: string; path?: string; sessionId?: string; params: import("@modelcontextprotocol/sdk/types.js").CallToolRequest["params"]}[]} */
  const calls = [];
  /** @type {string[]} */
  const urls = [];
  let initializations = 0;
  let terminations = 0;
  /** @param {FixtureRequest} req @param {FixtureResponse} res */
  async function handle(req, res) {
    if (req.method === "DELETE") {
      terminations++;
      res.writeHead(200).end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    /** @type {Buffer[]} */
    const chunks = [];
    for await (const chunk of req) {
      assert.ok(Buffer.isBuffer(chunk));
      chunks.push(chunk);
    }
    const rawMessage = /** @type {unknown} */ (JSON.parse(Buffer.concat(chunks).toString()));
    assert.ok(isRecord(rawMessage));
    if (rawMessage.id === undefined) {
      res.writeHead(202).end();
      return;
    }
    const message = JSONRPCRequestSchema.parse(rawMessage);
    let result;
    if (message.method === "initialize") {
      initializations++;
      const initialize = InitializeRequestSchema.parse(message);
      result = {
        protocolVersion: initialize.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "fixture", version: "1" },
      };
    } else {
      const call = CallToolRequestSchema.parse(message);
      calls.push({
        auth: req.headers.authorization,
        path: req.url,
        sessionId: String(req.headers["mcp-session-id"]),
        params: call.params,
      });
      const query = call.params.arguments?.search_query;
      if (query === "expired-session") {
        res.writeHead(404).end("Owned expired MCP session");
        return;
      }
      if (query === "http-error" || query === "large-http-error") {
        res
          .writeHead(500)
          .end(query === "http-error" ? "Owned HTTP failure" : "private HTTP error".repeat(6000));
        return;
      }
      result = {
        isError: query === "fixture-error" || query === "large-error",
        content: [{ type: "text", text: "Local search result" }],
      };
      if (query === "fixture-error") {
        result.content = [{ type: "text", text: "Owned service failure" }];
      } else if (query === "large-output") {
        result.content = Array.from({ length: 160_000 }, () => ({
          type: "text",
          text: "private search result",
        }));
      } else if (query === "large-error") {
        result.content = [{ type: "text", text: "private MCP error".repeat(6000) }];
      }
    }
    res.writeHead(200, {
      "content-type": "application/json",
      "mcp-session-id": `fixture-session-${initializations}`,
    });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
  }
  const fixture = createServer((req, res) => {
    handle(req, res).catch(
      /** @param {unknown} error */ (error) => {
        res.writeHead(500).end(error instanceof Error ? error.message : "Invalid fixture request");
      },
    );
  });
  await new Promise((resolve) => {
    fixture.listen(0, "127.0.0.1", () => {
      resolve(undefined);
    });
  });
  const address = fixture.address();
  assert.ok(address !== null && typeof address !== "string");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, options) => {
    let url;
    if (typeof input === "string") {
      url = input;
    } else if ("url" in input) {
      url = input.url;
    } else {
      url = input.toString();
    }
    const target = new URL(url);
    assert.ok(target.hostname === "api.z.ai" || target.hostname === "open.bigmodel.cn");
    assert.match(target.pathname, /^\/api\/mcp\/(?:web_search_prime|web_reader|zread)\/mcp$/);
    urls.push(url);
    return originalFetch(`http://127.0.0.1:${address.port}${target.pathname}`, options);
  };
  t.after(async () => {
    globalThis.fetch = originalFetch;
    fixture.closeAllConnections();
    await new Promise((resolve) => {
      fixture.close(resolve);
    });
  });
  return { calls, urls, initializations: () => initializations, terminations: () => terminations };
}

/** @param {Fixture} fixture */
async function loadNativeSession(fixture) {
  initTheme("dark", false);
  const { root, agentDir } = fixture;
  const settingsManager = SettingsManager.inMemory();
  const loader = new DefaultResourceLoader({
    cwd: root,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    additionalExtensionPaths: [fileURLToPath(new URL("../", import.meta.url))],
  });
  await loader.reload();
  assert.deepStrictEqual(loader.getExtensions().errors, []);
  assert.strictEqual(loader.getExtensions().extensions.length, 5);
  /** @type {readonly (readonly [string, string])[]} */
  const resources = [
    ["search", "z_ai_search"],
    ["reader", "z_ai_reader"],
    ["zread", "z_ai_zread"],
    ["vision", "z_ai_vision"],
  ];
  for (const [resource, tool] of resources) {
    const path = fileURLToPath(new URL(`../extensions/zai-mcp-${resource}.ts`, import.meta.url));
    const extension = loader.getExtensions().extensions.find((entry) => entry.path === path);
    assert.ok(extension !== undefined, `native loader must load the ${resource} resource`);
    assert.deepStrictEqual(
      [...extension.tools.keys()],
      [tool],
      `${resource} resource must own only its service tool`,
    );
  }
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    modelsStorePath: join(agentDir, "models-store.json"),
    allowModelNetwork: false,
  });
  const { session } = await createAgentSession({
    cwd: root,
    agentDir,
    modelRuntime,
    resourceLoader: loader,
    settingsManager,
    sessionManager: SessionManager.inMemory(root),
    noTools: "builtin",
  });
  return session;
}

/** @param {NativeSession} session @param {readonly string[]} notifications @param {HttpFixture} fixture */
async function verifySearch(session, notifications, fixture) {
  assert.deepStrictEqual(session.getActiveToolNames().toSorted(), [
    "z_ai_reader",
    "z_ai_search",
    "z_ai_vision",
    "z_ai_zread",
  ]);
  await session.prompt("/zai-mcp-status");
  const statusJson = notifications.at(-1);
  assert.ok(statusJson !== undefined);
  const status = /** @type {unknown} */ (JSON.parse(statusJson));
  assert.ok(Array.isArray(status));
  assert.deepStrictEqual(
    status.map(
      /** @param {unknown} entry */ (entry) => {
        assert.ok(isRecord(entry));
        return entry.id;
      },
    ),
    ["search", "reader", "zread", "vision"],
  );
  assert.ok(
    status.every(
      /** @param {unknown} entry */ (entry) =>
        isRecord(entry) &&
        entry.connected === false &&
        entry.connectionStatus === "lazy_not_connected_until_first_use",
    ),
  );
  const search = session.extensionRunner.getToolDefinition("z_ai_search");
  assert.ok(search !== undefined);
  const args = /** @type {unknown} */ (
    validateToolArguments(search, {
      type: "toolCall",
      id: "search-1",
      name: search.name,
      arguments: { query: "native contract" },
    })
  );
  await assert.rejects(
    () =>
      search.execute(
        "search-1",
        args,
        undefined,
        undefined,
        session.extensionRunner.createToolContext("fixture-call", undefined),
      ),
    /Missing Z.ai API key/,
  );
  assert.ok(getActiveServers().every((entry) => entry.connection === undefined));
  process.env.Z_AI_API_KEY = "local-fixture-key";
  const result = await search.execute(
    "search-2",
    args,
    undefined,
    undefined,
    session.extensionRunner.createToolContext("fixture-call", undefined),
  );
  assert.strictEqual(textContent(result), "Local search result");
  assert.deepStrictEqual(
    result.structuredContent,
    { server: "search", tool: "web_search_prime", text: "Local search result", truncated: false },
    "native callers receive the bounded curated result, not private MCP details",
  );
  assert.deepStrictEqual(
    fixture.calls.map((call) => ({
      auth: call.auth,
      name: call.params.name,
      arguments: call.params.arguments,
    })),
    [
      {
        auth: "Bearer local-fixture-key",
        name: "web_search_prime",
        arguments: { search_query: "native contract", content_size: "high" },
      },
    ],
  );
  const connected = getActiveServers().find((entry) => entry.id === "search");
  assert.ok(connected !== undefined && connected.connection !== undefined);
  await assert.rejects(
    () =>
      search.execute(
        "search-error",
        { query: "fixture-error" },
        undefined,
        undefined,
        session.extensionRunner.createToolContext("fixture-call", undefined),
      ),
    /Owned service failure/,
  );
  assert.ok(search.renderResult !== undefined);
  const renderContext = {
    args: { query: "fixture-error" },
    toolCallId: "search-error",
    state: undefined,
    lastComponent: undefined,
    cwd: process.cwd(),
    executionStarted: true,
    argsComplete: true,
    expanded: false,
    isPartial: false,
    showImages: false,
    isError: true,
    durationMs: undefined,
    outputPad: 1,
    invalidate: () => {
      /* Static render assertion does not mount a component. */
    },
  };
  const failure = search.renderResult(
    { content: [{ type: "text", text: "Owned service failure" }], details: undefined },
    { expanded: false, isPartial: false },
    session.extensionRunner.createContext().ui.theme,
    renderContext,
  );
  assert.match(failure.render(80).join("\n"), /failed/);
  assert.strictEqual(fixture.calls.length, 2, "a failed MCP result is not automatically replayed");
  return connected;
}

/** @param {NativeSession} session */
async function verifyPrivateOutput(session) {
  const search = session.extensionRunner.getToolDefinition("z_ai_search");
  assert.ok(search !== undefined);
  const sharedTemp = await mkdtemp("/tmp/zai-mcp-shared-");
  await chmod(sharedTemp, 0o777);
  const previousTemp = process.env.TMPDIR;
  const previousUmask = process.umask(0o022);
  process.env.TMPDIR = sharedTemp;
  try {
    const large = await search.execute(
      "search-large",
      { query: "large-output" },
      undefined,
      undefined,
      session.extensionRunner.createToolContext("fixture-call", undefined),
    );
    assert.ok(isRecord(large.structuredContent));
    const file = large.structuredContent.file;
    assert.ok(typeof file === "string");
    assert.strictEqual(large.structuredContent.truncated, true);
    const fullOutput = "private search result" + "\n\nprivate search result".repeat(159_999);
    assert.strictEqual(
      await readFile(file, "utf8"),
      fullOutput,
      "all 160000 wire blocks remain retrievable in original order",
    );
    assert.match(textContent(large), /Full output saved to:/);
    assert.strictEqual((await stat(sharedTemp)).mode & 0o777, 0o777);
    assert.strictEqual(
      (await stat(dirname(file))).mode & 0o777,
      0o700,
      "saved output directory must be private",
    );
    assert.strictEqual((await stat(file)).mode & 0o777, 0o600, "saved output file must be private");
  } finally {
    process.umask(previousUmask);
    if (previousTemp === undefined) {
      delete process.env.TMPDIR;
    } else {
      process.env.TMPDIR = previousTemp;
    }
    await rm(sharedTemp, { recursive: true, force: true });
  }
}

/** @param {NativeSession} session */
function prepareVisionFixture(session) {
  const owner = getActiveServers().find((entry) => entry.id === "vision");
  assert.ok(owner !== undefined && owner.args !== undefined);
  owner.args.unshift(
    "--import",
    fileURLToPath(new URL("./fixtures/vision-offline.mjs", import.meta.url)),
  );
  const vision = session.extensionRunner.getToolDefinition("z_ai_vision");
  assert.ok(vision !== undefined);
  return vision;
}

/** @param {NativeSession} session @param {string} name @param {Readonly<Record<string, string>>} args @param {AbortSignal} [signal] @param {(result: Readonly<{content: readonly Readonly<{type: string; text?: string}>[]}>) => void} [onUpdate] */
function invoke(session, name, args, signal, onUpdate) {
  const tool = session.extensionRunner.getToolDefinition(name);
  assert.ok(tool !== undefined);
  const params = /** @type {unknown} */ (
    validateToolArguments(tool, {
      type: "toolCall",
      id: "native-regression",
      name,
      arguments: args,
    })
  );
  return tool.execute(
    "native-regression",
    params,
    signal,
    onUpdate,
    session.extensionRunner.createToolContext("fixture-call", undefined),
  );
}

/** @param {NativeSession} session @param {readonly string[]} notifications @param {string} [id] */
async function readServerStatus(session, notifications, id = "search") {
  await session.prompt("/zai-mcp-status");
  const json = notifications.at(-1);
  assert.ok(json !== undefined);
  const entries = /** @type {unknown} */ (JSON.parse(json));
  assert.ok(Array.isArray(entries));
  const entry = /** @type {unknown} */ (
    entries.find(/** @param {unknown} value */ (value) => isRecord(value) && value.id === id)
  );
  assert.ok(isRecord(entry));
  return entry;
}

/** @param {NativeSession} session @param {readonly string[]} notifications @param {HttpFixture} http */
async function verifyConnectionRecovery(session, notifications, http) {
  const failed = await readServerStatus(session, notifications);
  assert.ok(typeof failed.lastError === "string");
  assert.match(failed.lastError, /Owned service failure/);
  assert.strictEqual(
    failed.connected,
    true,
    "an MCP tool failure does not invalidate a healthy connection",
  );
  await invoke(session, "z_ai_search", { query: "after-service-error" });
  assert.strictEqual((await readServerStatus(session, notifications)).lastError, undefined);
  const owner = getActiveServers().find((entry) => entry.id === "search");
  assert.ok(owner?.connection !== undefined);
  await owner.connection.client.close();
  const closed = await readServerStatus(session, notifications);
  assert.strictEqual(closed.connected, false);
  assert.strictEqual(closed.connectionStatus, "disconnected");
  const before = http.initializations();
  await invoke(session, "z_ai_search", { query: "after-close" });
  assert.strictEqual(http.initializations(), before + 1);
  assert.strictEqual((await readServerStatus(session, notifications)).connected, true);
  const previousSession = http.calls.at(-1)?.sessionId;
  const previousCalls = http.calls.length;
  await assert.rejects(
    () => invoke(session, "z_ai_search", { query: "expired-session" }),
    /404|expired/,
  );
  assert.strictEqual(http.calls.length, previousCalls + 1, "expired calls are not replayed");
  const expired = await readServerStatus(session, notifications);
  assert.strictEqual(expired.connectionStatus, "disconnected");
  assert.strictEqual(expired.connected, false);
  await invoke(session, "z_ai_search", { query: "after-expiry" });
  assert.strictEqual(
    http.initializations(),
    before + 2,
    "the next explicit call initializes without the expired ID",
  );
  assert.notStrictEqual(http.calls.at(-1)?.sessionId, previousSession);
  assert.strictEqual((await readServerStatus(session, notifications)).lastError, undefined);
}

/** @param {NativeSession} session */
async function verifyFailureOutput(session) {
  const owner = getActiveServers().find((entry) => entry.id === "search");
  assert.ok(owner?.connection !== undefined);
  /** @type {Readonly<Error>[]} */
  const sdkErrors = [];
  Object.assign(owner.connection.client, {
    onerror: /** @param {Readonly<Error>} error */ (error) => {
      sdkErrors.push(error);
    },
  });
  await assert.rejects(
    () => invoke(session, "z_ai_search", { query: "http-error" }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.strictEqual(
        error,
        sdkErrors.at(-1),
        "small SDK failures retain their original identity",
      );
      return true;
    },
  );
  for (const scenario of [
    { query: "large-error", full: "private MCP error".repeat(6000) },
    { query: "large-http-error", full: "private HTTP error".repeat(6000) },
  ]) {
    /** @type {Error | undefined} */
    let failure;
    const rejected = assert.rejects(
      () => invoke(session, "z_ai_search", { query: scenario.query }),
      (error) => {
        assert.ok(error instanceof Error);
        failure = error;
        return true;
      },
    );
    const recovered = invoke(session, "z_ai_search", { query: "after-large-failure" });
    await Promise.all([rejected, recovered]);
    assert.strictEqual(owner.lastError, undefined, "the later queued success owns status");
    assert.ok(failure !== undefined);
    assert.ok(
      Buffer.byteLength(failure.message) < 52_000,
      "upstream failures cannot flood model context",
    );
    const file = /Full output saved to: ([^\]]+)\]/.exec(failure.message)?.[1];
    assert.ok(file !== undefined, "oversized failures retain a full-output recovery path");
    assert.ok(
      (await readFile(file, "utf8")).endsWith(scenario.full),
      "private saved failure preserves every original body byte",
    );
    if (process.platform !== "win32") {
      assert.strictEqual((await stat(dirname(file))).mode & 0o777, 0o700);
      assert.strictEqual((await stat(file)).mode & 0o777, 0o600);
    }
    await rm(dirname(file), { recursive: true, force: true });
  }
}

/** @param {NativeSession} session @param {HttpFixture} http */
async function verifyChinaHttp(session, http) {
  delete process.env.Z_AI_API_KEY;
  process.env.ZAI_CODING_CN_API_KEY = "synthetic-cn-credential";
  await session.reload();
  const start = http.urls.length;
  await invoke(session, "z_ai_search", { query: "CN fixture" });
  await invoke(session, "z_ai_reader", { url: "https://public.example.invalid/fixture" });
  await invoke(session, "z_ai_zread", {
    action: "read_file",
    repo_name: "public/fixture",
    file_path: "README.md",
  });
  assert.deepStrictEqual([...new Set(http.urls.slice(start))].toSorted(), [
    "https://open.bigmodel.cn/api/mcp/web_reader/mcp",
    "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
    "https://open.bigmodel.cn/api/mcp/zread/mcp",
  ]);
  assert.ok(http.calls.slice(-3).every((call) => call.auth === "Bearer synthetic-cn-credential"));
  delete process.env.ZAI_CODING_CN_API_KEY;
  process.env.Z_AI_API_KEY = "synthetic-zai-credential";
  await session.reload();
}

/** @param {NativeSession} session @param {Fixture} fixture @param {string} image */
async function verifyVisionConfiguration(session, fixture, image) {
  const { logPath, childHome } = fixture;
  /** @type {readonly Readonly<{name: string; env: Readonly<Record<string, string>>; model: string; temperature: number; topP: number; url: string}>[]} */
  const cases = [
    {
      name: "default GLM-5.3 Flash",
      env: {},
      model: "glm-5.3-flash",
      temperature: 1,
      topP: 0.95,
      url: "https://api.z.ai/api/paas/v4/chat/completions",
    },
    {
      name: "China credentials select BigModel vision",
      env: { Z_AI_API_KEY: "", ZAI_CODING_CN_API_KEY: "synthetic-cn-credential" },
      model: "glm-5.3-flash",
      temperature: 1,
      topP: 0.95,
      url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    },
    {
      name: "explicit vision mode overrides the credential default",
      env: { Z_AI_API_KEY: "", ZAI_CODING_CN_API_KEY: "synthetic-cn-credential", Z_AI_MODE: "ZAI" },
      model: "glm-5.3-flash",
      temperature: 1,
      topP: 0.95,
      url: "https://api.z.ai/api/paas/v4/chat/completions",
    },
    {
      name: "explicit GLM-5.3 FlashX",
      env: { Z_AI_VISION_MODEL: "glm-5.3-flashx", Z_AI_MODE: "" },
      model: "glm-5.3-flashx",
      temperature: 1,
      topP: 0.95,
      url: "https://api.z.ai/api/paas/v4/chat/completions",
    },
    {
      name: "custom GLM-5.3 prefix retains vendor defaults",
      env: { Z_AI_VISION_MODEL: "glm-5.3-custom" },
      model: "glm-5.3-custom",
      temperature: 0.8,
      topP: 0.6,
      url: "https://api.z.ai/api/paas/v4/chat/completions",
    },
    {
      name: "other model defaults",
      env: { Z_AI_VISION_MODEL: "synthetic-configured-model" },
      model: "synthetic-configured-model",
      temperature: 0.8,
      topP: 0.6,
      url: "https://api.z.ai/api/paas/v4/chat/completions",
    },
    {
      name: "explicit overrides and custom endpoint",
      env: {
        Z_AI_VISION_MODEL: "glm-5.3-flash",
        Z_AI_VISION_MODEL_TEMPERATURE: "0.7",
        Z_AI_VISION_MODEL_TOP_P: "0.9",
        PLATFORM_MODE: "CUSTOM",
        Z_AI_BASE_URL: "https://vision.example.test/v4///",
      },
      model: "glm-5.3-flash",
      temperature: 0.7,
      topP: 0.9,
      url: "https://vision.example.test/v4/chat/completions",
    },
    {
      name: "empty custom endpoint retains vendor fallback",
      env: { Z_AI_BASE_URL: "" },
      model: "glm-5.3-flash",
      temperature: 0.7,
      topP: 0.9,
      url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    },
  ];
  for (const [index, scenario] of cases.entries()) {
    Object.assign(process.env, { Z_AI_API_KEY: "synthetic-zai-credential" }, scenario.env);
    if (index > 0) {
      await session.reload();
    }
    const vision = prepareVisionFixture(session);
    const result = await vision.execute(
      "vision-valid",
      {
        action: "analyze_image",
        image_source: `@${basename(image)}`,
        prompt: "Report the intercepted offline request",
      },
      undefined,
      undefined,
      session.extensionRunner.createToolContext("fixture-call", undefined),
    );
    const receipt = /** @type {unknown} */ (JSON.parse(textContent(result)));
    assert.ok(isRecord(receipt));
    assert.strictEqual(
      receipt.authorization,
      `Bearer ${scenario.env.ZAI_CODING_CN_API_KEY ?? "synthetic-zai-credential"}`,
    );
    assert.deepStrictEqual(
      receipt.unrelatedEnvironment,
      [],
      "unrelated credentials and Node hooks must not reach the child",
    );
    assert.strictEqual(receipt.model, scenario.model, scenario.name);
    assert.strictEqual(receipt.temperature, scenario.temperature, scenario.name);
    assert.strictEqual(receipt.topP, scenario.topP, scenario.name);
    assert.strictEqual(receipt.url, scenario.url, scenario.name);
    assert.strictEqual(receipt.maxTokens, 42);
    assert.deepStrictEqual(receipt.sources, [
      `data:image/png;base64,${(await readFile(image)).toString("base64")}`,
    ]);
    assert.strictEqual(
      receipt.logPath,
      logPath,
      "the vendor retains the selected private log destination",
    );
  }
  assert.match(await readFile(logPath, "utf8"), /Report the intercepted offline request/);
  await assert.rejects(
    () => access(join(childHome, ".zai")),
    { code: "ENOENT" },
    "no default-home log directory is created",
  );
}

/** @param {NativeSession} session @param {Fixture} fixture @param {string} image */
async function verifyVisionSourceFields(session, fixture, image) {
  const videoBytes = Buffer.from("synthetic offline media bytes");
  await writeFile(join(fixture.root, "clip.mp4"), videoBytes);
  const imageUrl = `data:image/png;base64,${(await readFile(image)).toString("base64")}`;
  /** @type {readonly Readonly<{args: Readonly<Record<string, string>>; sources: readonly string[]}>[]} */
  const cases = [
    {
      args: {
        action: "ui_diff_check",
        expected_image_source: "@image.png",
        actual_image_source: "@./image.png",
        prompt: "Compare offline inputs",
      },
      sources: [imageUrl, imageUrl],
    },
    {
      args: {
        action: "analyze_video",
        video_source: "@clip.mp4",
        prompt: "Inspect offline media path",
      },
      sources: [`data:video/mp4;base64,${videoBytes.toString("base64")}`],
    },
    {
      args: {
        action: "analyze_image",
        image_source: "HTTPS://public.example.invalid/fixture.png",
        prompt: "Preserve the remote URL",
      },
      sources: ["HTTPS://public.example.invalid/fixture.png"],
    },
  ];
  for (const scenario of cases) {
    const result = await invoke(session, "z_ai_vision", scenario.args);
    const receipt = /** @type {unknown} */ (JSON.parse(textContent(result)));
    assert.ok(isRecord(receipt));
    assert.deepStrictEqual(receipt.sources, scenario.sources);
  }
}

/** @param {string} file @param {string} marker */
function waitForMarker(file, marker) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      observer.close();
      reject(new Error(`Offline fixture did not reach ${marker}`));
    }, 5000);
    const check = () => {
      readFile(file, "utf8")
        .then((text) => {
          if (text.includes(marker)) {
            clearTimeout(timer);
            observer.close();
            resolve(undefined);
          }
        })
        .catch(
          /** @param {unknown} error */ (error) => {
            clearTimeout(timer);
            observer.close();
            reject(
              error instanceof Error ? error : new Error("Unable to read offline fixture marker"),
            );
          },
        );
    };
    const observer = watch(file, check);
    check();
  });
}

/** @param {NativeSession} session @param {Fixture} fixture @param {string} image */
async function verifyVisionCancellation(session, fixture, image) {
  for (const { phase, mode } of [
    { phase: "call", mode: "cancel" },
    { phase: "call", mode: "timeout" },
    { phase: "initialize", mode: "cancel" },
    { phase: "initialize", mode: "timeout" },
  ]) {
    process.env.Z_AI_MCP_TIMEOUT_MS = "3000";
    process.env.SERVER_NAME = `fixture-hold-${phase}-${mode}`;
    await session.reload();
    prepareVisionFixture(session);
    const controller = new AbortController();
    const marker = `hold-offline-fetch-${mode}`;
    const pending = invoke(
      session,
      "z_ai_vision",
      {
        action: "analyze_image",
        image_source: image,
        prompt: marker,
      },
      controller.signal,
    );
    const rejected = assert.rejects(pending, /cancelled|timed out/i);
    await waitForMarker(
      fixture.logPath,
      phase === "initialize"
        ? `OFFLINE_INITIALIZE_STARTED ${process.env.SERVER_NAME}`
        : `OFFLINE_FETCH_STARTED ${marker}`,
    );
    const owner = getActiveServers().find((entry) => entry.id === "vision");
    assert.ok(owner?.connection?.transport instanceof StdioClientTransport);
    const pid = owner.connection.transport.pid;
    assert.ok(pid !== null);
    const next = invoke(
      session,
      "z_ai_vision",
      {
        action: "analyze_image",
        image_source: image,
        prompt: "Next explicit request",
      },
      undefined,
      (update) => {
        if (textContent(update).startsWith("Calling ")) {
          assert.throws(
            () => process.kill(pid, 0),
            { code: "ESRCH" },
            "old child exits before the next queued request starts",
          );
        }
      },
    );
    if (mode === "cancel") {
      controller.abort();
    }
    const [, result] = await Promise.all([rejected, next]);
    const receipt = /** @type {unknown} */ (JSON.parse(textContent(result)));
    assert.ok(isRecord(receipt));
    assert.notStrictEqual(
      receipt.pid,
      pid,
      "the next request uses a fresh child, without replaying the failed call",
    );
    assert.strictEqual(
      owner.lastError,
      undefined,
      "the successful explicit request clears the last error",
    );
  }
  delete process.env.Z_AI_MCP_TIMEOUT_MS;
  delete process.env.SERVER_NAME;
  await session.reload();
}

/** @param {NativeSession} session @param {import("../src/servers.ts").ManagedServer} connected @param {() => number} terminations */
async function verifyReload(session, connected, terminations) {
  await session.reload();
  assert.strictEqual(terminations(), 1, "reload terminates the connected MCP session");
  assert.ok(connected.connection === undefined, "reload releases the old transport");
  assert.strictEqual(
    getActiveServers().length,
    4,
    "reload releases old registrations, not duplicates",
  );
}

await test(
  "five native resources share lazy status and release servers on shutdown/reload",
  { timeout: 60_000 },
  async (t) => {
    const fixture = await createFixture(t);
    const http = await searchFixture(t);
    const session = await loadNativeSession(fixture);
    /** @type {string[]} */
    const notifications = [];
    /** @type {unknown[]} */
    const errors = [];
    try {
      await session.bindExtensions({
        mode: "rpc",
        onError: /** @param {unknown} error */ (error) => {
          errors.push(error);
        },
        uiContext: {
          ...session.extensionRunner.createContext().ui,
          notify: (text) => {
            notifications.push(text);
          },
        },
      });
      assert.strictEqual(
        notifications.filter((text) => text.includes("No Z.ai API key found")).length,
        1,
        "split resources emit one native UI warning",
      );
      const connected = await verifySearch(session, notifications, http);
      await t.test("closed and expired MCP sessions recover only on the next explicit call", () =>
        verifyConnectionRecovery(session, notifications, http),
      );
      await t.test(
        "native large output is private even under shared temp and umask 022",
        { skip: process.platform === "win32" },
        () => verifyPrivateOutput(session),
      );
      await t.test(
        "large MCP and SDK failures stay bounded and private; small errors retain identity",
        () => verifyFailureOutput(session),
      );
      await verifyReload(session, connected, http.terminations);
      await t.test("China credentials route all three HTTP services to BigModel", () =>
        verifyChinaHttp(session, http),
      );
      const image = join(fixture.root, "image.png");
      await writeFile(
        image,
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aONsAAAAASUVORK5CYII=",
          "base64",
        ),
      );
      await t.test(
        "real vision child discards high-volume stderr, resolves session paths and honors credential/model/endpoint precedence",
        () => verifyVisionConfiguration(session, fixture, image),
      );
      await t.test(
        "vision resolves comparison/video paths per call and preserves remote URLs",
        () => verifyVisionSourceFields(session, fixture, image),
      );
      await t.test(
        "vision initialize/call cancellation and timeout retire children before the next queued call",
        () => verifyVisionCancellation(session, fixture, image),
      );
      await t.test(
        "placeholder vision credential cannot fall back to another provider",
        async () => {
          process.env.Z_AI_API_KEY = "your_api_key";
          const vision = prepareVisionFixture(session);
          await assert.rejects(
            () =>
              vision.execute(
                "vision-placeholder",
                {
                  action: "analyze_image",
                  image_source: image,
                  prompt: "Must not use another provider credential",
                },
                undefined,
                undefined,
                session.extensionRunner.createToolContext("fixture-call", undefined),
              ),
            /Connection closed|Z_AI_API_KEY/,
          );
        },
      );
      assert.deepStrictEqual(errors, []);
    } finally {
      await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
      session.dispose();
    }
    assert.deepStrictEqual(
      getActiveServers(),
      [],
      "native shutdown removes every split resource's state",
    );
  },
);
