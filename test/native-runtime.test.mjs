import assert from "node:assert/strict";
import { access, chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
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
/** @typedef {Readonly<{calls: readonly Readonly<{auth?: string; params: Readonly<{name: string; arguments?: Readonly<Record<string, unknown>>}>}>[]; terminations: () => number}>} HttpFixture */

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
    Z_AI_MODE: "ZAI",
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
  /** @type {{auth: string | undefined; params: import("@modelcontextprotocol/sdk/types.js").CallToolRequest["params"]}[]} */
  const calls = [];
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
      const initialize = InitializeRequestSchema.parse(message);
      result = {
        protocolVersion: initialize.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "fixture", version: "1" },
      };
    } else {
      const call = CallToolRequestSchema.parse(message);
      calls.push({ auth: req.headers.authorization, params: call.params });
      const query = call.params.arguments?.search_query;
      result = {
        isError: query === "fixture-error",
        content: [{ type: "text", text: "Local search result" }],
      };
      if (query === "fixture-error") {
        result.content = [{ type: "text", text: "Owned service failure" }];
      } else if (query === "large-output") {
        result.content = Array.from({ length: 160_000 }, () => ({
          type: "text",
          text: "private search result",
        }));
      }
    }
    res.writeHead(200, { "content-type": "application/json", "mcp-session-id": "fixture-session" });
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
    assert.strictEqual(
      url,
      "https://api.z.ai/api/mcp/web_search_prime/mcp",
      "only search may reach the fixture",
    );
    return originalFetch(`http://127.0.0.1:${address.port}/mcp`, options);
  };
  t.after(async () => {
    globalThis.fetch = originalFetch;
    fixture.closeAllConnections();
    await new Promise((resolve) => {
      fixture.close(resolve);
    });
  });
  return { calls, terminations: () => terminations };
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
  assert.ok(
    getActiveServers().every(
      (entry) => entry.client === undefined && entry.transport === undefined,
    ),
  );
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
  assert.ok(
    connected !== undefined && connected.client !== undefined && connected.transport !== undefined,
  );
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
  const failure = search.renderResult(
    { content: [{ type: "text", text: "Owned service failure" }], details: undefined },
    { expanded: false, isPartial: false },
    session.extensionRunner.createContext().ui.theme,
    {
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
    },
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
      name: "explicit GLM-5.3 FlashX",
      env: { Z_AI_VISION_MODEL: "glm-5.3-flashx" },
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
    Object.assign(process.env, scenario.env, { Z_AI_API_KEY: "synthetic-zai-credential" });
    if (index > 0) {
      await session.reload();
    }
    const vision = prepareVisionFixture(session);
    const result = await vision.execute(
      "vision-valid",
      {
        action: "analyze_image",
        image_source: image,
        prompt: "Report the intercepted offline request",
      },
      undefined,
      undefined,
      session.extensionRunner.createToolContext("fixture-call", undefined),
    );
    const receipt = /** @type {unknown} */ (JSON.parse(textContent(result)));
    assert.ok(isRecord(receipt));
    assert.strictEqual(receipt.authorization, "Bearer synthetic-zai-credential");
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

/** @param {NativeSession} session @param {import("../src/servers.ts").ManagedServer} connected @param {() => number} terminations */
async function verifyReload(session, connected, terminations) {
  await session.reload();
  assert.strictEqual(terminations(), 1, "reload terminates the connected MCP session");
  assert.ok(
    connected.client === undefined && connected.transport === undefined,
    "reload releases the old transport",
  );
  assert.strictEqual(
    getActiveServers().length,
    4,
    "reload releases old registrations, not duplicates",
  );
}

await test(
  "five native resources share lazy status and release servers on shutdown/reload",
  { timeout: 30_000 },
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
      const connected = await verifySearch(session, notifications, http);
      await t.test(
        "native large output is private even under shared temp and umask 022",
        { skip: process.platform === "win32" },
        () => verifyPrivateOutput(session),
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
        "real vision child isolates credentials and honors model sampling and endpoint precedence",
        () => verifyVisionConfiguration(session, fixture, image),
      );
      await verifyReload(session, connected, http.terminations);
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
