import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRuntime, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { InMemoryModelsStore } from "@earendil-works/pi-ai";
import { testHelpers, default as zaiMcpExtension } from "../src/index.ts";
import zaiMcpSearch from "../extensions/zai-mcp-search.ts";
import zaiMcpStatus from "../extensions/zai-mcp-status.ts";

// ponytail: retain native equality checks without redundant type narrowing; restore the predicates when Oxlint recognizes value assertions.
/** @type {(actual: unknown, expected: unknown, message?: string | Readonly<Error>) => void} */
const equal = assert.strictEqual;
/** @type {(actual: unknown, expected: unknown, message?: string | Readonly<Error>) => void} */
const deepEqual = assert.deepStrictEqual;

/** @typedef {import("@earendil-works/pi-coding-agent").ToolDefinition<import("typebox").TSchema, import("../src/register-tool.ts").CuratedDetails, unknown>} NativeTool */
/** @typedef {Readonly<Pick<NativeTool, "name" | "promptSnippet" | "execute">> & {readonly promptGuidelines?: readonly string[]}} SmokeTool */
/** @typedef {Readonly<Pick<import("@earendil-works/pi-coding-agent").RegisteredCommand, "handler">>} SmokeCommand */

/** @param {Readonly<{name: string}>} tool */
function toolName(tool) { return tool.name; }

const savedEnv = { ...process.env };
/** @param {string} agentDir */
async function registryFor(agentDir) {
  return new ModelRegistry(await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json"), modelsStore: new InMemoryModelsStore(), allowModelNetwork: false }));
}

function restoreEnv() {
  process.env = { ...savedEnv };
}

/** @param {() => void} fn */
function captureWarn(fn) {
  const original = console.warn;
  /** @type {string[]} */
  const warnings = [];
  console.warn = (message) => { warnings.push(String(message)); };
  try {
    fn();
    return warnings;
  } finally {
    console.warn = original;
  }
}

function loadExtension(env = {}, extension = zaiMcpExtension) {
  restoreEnv();
  delete process.env.Z_AI_MCP_SERVERS;
  delete process.env.Z_AI_API_KEY;
  delete process.env.ZAI_API_KEY;
  delete process.env.PI_CODING_AGENT_DIR;
  Object.assign(process.env, { Z_AI_API_KEY: "test-key", ...env });

  /** @type {SmokeTool[]} */
  const tools = [];
  /** @type {Map<string, SmokeCommand>} */
  const commands = new Map();
  const pi = {
    /** @param {typeof tools[number]} tool */
    registerTool: (tool) => { tools.push(tool); },
    /** @param {string} name @param {SmokeCommand} command */
    registerCommand: (name, command) => { commands.set(name, command); },
    on: () => { /* Lifecycle hooks are exercised by the native runtime owner. */ },
  };
  const warnings = captureWarn(() =>{  extension(pi); });
  return { tools, commands, warnings };
}

/** @param {NodeJS.WriteStream} stream @param {() => Promise<void>} fn */
function patchWrite(stream, fn) {
  const original = stream.write.bind(stream);
  let output = "";
  stream.write = /** @param {string | Readonly<Pick<Uint8Array, "toString">>} chunk */ (chunk) => {
    output += String(chunk);
    return true;
  };
  return Promise.resolve()
    .then(fn)
    .then(() => output)
    .finally(() => {
      stream.write = original;
    });
}

testHelpers.resetGlobalStateForTests();
const loaded = loadExtension();
deepEqual(
  loaded.tools.map(toolName),
  ["z_ai_search", "z_ai_reader", "z_ai_zread", "z_ai_vision"],
);
assert.ok(loaded.commands.has("zai-mcp-status"));

const searchOnly = loadExtension({ Z_AI_MCP_SERVERS: "search,unknown" });
deepEqual(searchOnly.tools.map(toolName), ["z_ai_search"]);
assert.match(searchOnly.warnings.join("\n"), /ignoring unknown Z_AI_MCP_SERVERS/);

for (const tool of loaded.tools) {
  assert.ok(tool.promptSnippet !== undefined && tool.promptSnippet.length > 0, `${tool.name} declares prompt routing metadata`);
  assert.ok(tool.promptGuidelines !== undefined && tool.promptGuidelines.every((guideline) => guideline.includes(tool.name)), `${tool.name} names itself in every prompt guideline`);
}
deepEqual(loadExtension({ Z_AI_MCP_SERVERS: "reader" }, zaiMcpSearch).tools.map(toolName), ["z_ai_search"]);
deepEqual(loadExtension({}, zaiMcpStatus).tools, []);

const none = loadExtension({ Z_AI_MCP_SERVERS: "unknown" });
equal(none.tools.length, 0);
assert.match(none.warnings.join("\n"), /no Z\.AI MCP servers enabled/);

deepEqual(
  testHelpers.searchArgs({ query: "current pi docs", content_size: "medium" }),
  { search_query: "current pi docs", search_domain_filter: undefined, search_recency_filter: undefined, content_size: "medium", location: undefined },
);

deepEqual(
  testHelpers.visionArgs({ action: "analyze_image", image_source: "@screenshots/app.png", prompt: "describe" }),
  { image_source: "screenshots/app.png", prompt: "describe" },
);
deepEqual(
  testHelpers.visionArgs({
    action: "ui_diff_check",
    expected_image_source: "@expected.png",
    actual_image_source: "@actual.png",
    prompt: "compare",
  }),
  { expected_image_source: "expected.png", actual_image_source: "actual.png", prompt: "compare" },
);
deepEqual(
  testHelpers.visionArgs({ action: "analyze_video", video_source: "@demo.mp4", prompt: "summarize" }),
  { video_source: "demo.mp4", prompt: "summarize" },
);

const truncated = await testHelpers.truncateForTool("small");
equal(truncated.content, "small");
deepEqual(truncated.details, { truncated: false });

{
  let closeCalls = 0;
  /** @type {PromiseWithResolvers<{ signal: AbortSignal }>} */
  const started = Promise.withResolvers();
  const transport = { close: () => { closeCalls += 1; return Promise.resolve(); } };
  const client = {
    /** @param {unknown} _transport @param {Readonly<{ signal: Readonly<AbortSignal> }>} options */
    connect: (_transport, options) => {
      started.resolve(options);
      return Promise.withResolvers().promise;
    },
  };
  const server = { id: "search", kind: "http" };
  const controller = new AbortController();
  const connecting = testHelpers.connectWith(server, controller.signal, () => ({ client, transport }));
  const connectOptions = await started.promise;
  controller.abort();
  await assert.rejects(connecting, /cancelled while connecting/);
  equal(connectOptions.signal.aborted, true, "connecting receives Pi cancellation");
  equal(closeCalls, 1, "cancellation closes the owned transport once");
  equal(server.client, undefined);
  equal(server.transport, undefined);
  equal(server.connectPromise, undefined);
}

{
  let hangingCloseCalls = 0;
  let rejectedCloseCalls = 0;
  const hanging = {
    id: "search",
    label: "hanging HTTP shutdown",
    kind: "http",
    client: {},
    transport: {
      terminateSession: () => Promise.withResolvers().promise,
      close: () => { hangingCloseCalls += 1; return Promise.resolve(); },
    },
    connectPromise: Promise.withResolvers().promise,
    callQueue: Promise.withResolvers().promise,
  };
  const rejected = {
    id: "reader",
    label: "rejected HTTP shutdown",
    kind: "http",
    transport: {
      terminateSession: () => Promise.reject(new Error("delete failed")),
      close: () => { rejectedCloseCalls += 1; return Promise.resolve(); },
    },
  };
  const started = Date.now();
  await testHelpers.closeServers([hanging, rejected], 20);
  assert.ok(Date.now() - started < 500, "shutdown remains bounded when HTTP DELETE never settles");
  equal(hangingCloseCalls, 1, "timed-out HTTP termination still closes transport");
  equal(rejectedCloseCalls, 1, "failed HTTP termination still closes transport");
  equal(hanging.client, undefined);
  equal(hanging.transport, undefined);
  equal(hanging.connectPromise, undefined);
  equal(hanging.callQueue, undefined, "shutdown resets the per-server call queue");
}

const missingKeyAgentDir = await mkdtemp(join(tmpdir(), "pi-zai-mcp-missing-key-"));
await Promise.all(["authentication", "initialize"].map(async (phase) => {
  let closeCalls = 0;
  /** @type {PromiseWithResolvers<void>} */
  const wait = Promise.withResolvers();
  /** @type {PromiseWithResolvers<void>} */
  const started = Promise.withResolvers();
  const transport = { terminateSession: () => Promise.resolve(), close: () => { closeCalls++; return Promise.resolve(); } };
  const client = { connect: () => { started.resolve(); return phase === "initialize" ? wait.promise : Promise.resolve(); } };
  const server = { id: "search", kind: "http" };
  const pending = testHelpers.connectWith(server, undefined, async () => {
    if (phase === "authentication") { await wait.promise; }
    return { client, transport };
  });
  const rejected = assert.rejects(pending, /cancelled|shut down/);
  if (phase === "initialize") { await started.promise; }
  await Promise.all([testHelpers.closeServers([server]), testHelpers.closeServers([server])]);
  wait.resolve();
  await rejected;
  equal(closeCalls, 1, `${phase}: teardown closes each owned transport once`);
  equal(server.client, undefined, `${phase}: late setup cannot publish a stale client`);
  await assert.rejects(() => testHelpers.connectWith(server, undefined, () => ({ client, transport })), /shut down/);
}));
try {
  restoreEnv();
  delete process.env.Z_AI_API_KEY;
  delete process.env.ZAI_API_KEY;
  delete process.env.ZAI_CODING_CN_API_KEY;
  process.env.PI_CODING_AGENT_DIR = missingKeyAgentDir;
  const modelRegistry = await registryFor(missingKeyAgentDir);
  await assert.rejects(
    () => loaded.tools[0].execute("call-1", { query: "current pi docs" }, undefined, undefined, { modelRegistry }),
    /Missing Z\.ai API key/,
  );
} finally {
  await rm(missingKeyAgentDir, { recursive: true, force: true });
}

const agentDir = await mkdtemp(join(tmpdir(), "pi-zai-mcp-auth-"));
try {
  restoreEnv();
  delete process.env.Z_AI_API_KEY;
  delete process.env.ZAI_API_KEY;
  delete process.env.ZAI_CODING_CN_API_KEY;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  await mkdir(agentDir, { recursive: true });
  await writeFile(
    join(agentDir, "auth.json"),
    JSON.stringify({ zai: { type: "api_key", key: "$ZAI_FROM_AUTH", env: { ZAI_FROM_AUTH: "stored-key" } } }),
    "utf8",
  );
  const registry = await registryFor(agentDir);
  equal(await testHelpers.getApiKey(registry), "stored-key");
  process.env.Z_AI_API_KEY = "env-key";
  equal(await testHelpers.getApiKey(registry), "env-key");
} finally {
  await rm(agentDir, { recursive: true, force: true });
}

const codingCnAgentDir = await mkdtemp(join(tmpdir(), "pi-zai-mcp-cn-"));
try {
  restoreEnv();
  delete process.env.Z_AI_API_KEY;
  delete process.env.ZAI_API_KEY;
  delete process.env.ZAI_CODING_CN_API_KEY;
  process.env.PI_CODING_AGENT_DIR = codingCnAgentDir;
  await mkdir(codingCnAgentDir, { recursive: true });
  await writeFile(
    join(codingCnAgentDir, "auth.json"),
    JSON.stringify({ "zai-coding-cn": { type: "api_key", key: "cn-stored-key" } }),
    "utf8",
  );
  const registry = await registryFor(codingCnAgentDir);
  equal(await testHelpers.getApiKey(registry), "cn-stored-key", "should read key stored under the zai-coding-cn provider");
  process.env.ZAI_CODING_CN_API_KEY = "cn-env-key";
  equal(await testHelpers.getApiKey(registry), "cn-env-key", "ZAI_CODING_CN_API_KEY env should take precedence");
} finally {
  await rm(codingCnAgentDir, { recursive: true, force: true });
}

const customProviderAgentDir = await mkdtemp(join(tmpdir(), "pi-zai-mcp-custom-"));
try {
  restoreEnv();
  delete process.env.Z_AI_API_KEY;
  delete process.env.ZAI_API_KEY;
  delete process.env.ZAI_CODING_CN_API_KEY;
  process.env.PI_CODING_AGENT_DIR = customProviderAgentDir;
  await mkdir(customProviderAgentDir, { recursive: true });
  await writeFile(
    join(customProviderAgentDir, "models.json"),
    JSON.stringify({
      providers: {
        "evil-zai-host": { baseUrl: "https://api.z.ai.evil/v1", api: "openai-completions", models: [{ id: "glm-5.2" }] },
        "my-zai-proxy": { baseUrl: "https://open.bigmodel.cn/api/paas/v4", api: "openai-completions", models: [{ id: "glm-5.2" }] },
        "unrelated": { baseUrl: "https://api.example.com/v1", api: "openai-completions", models: [{ id: "gpt-4o" }] },
      },
    }),
    "utf8",
  );
  await writeFile(
    join(customProviderAgentDir, "auth.json"),
    JSON.stringify({ "evil-zai-host": { type: "api_key", key: "evil-key" }, "my-zai-proxy": { type: "api_key", key: "custom-zai-key" }, unrelated: { type: "api_key", key: "not-zai" } }),
    "utf8",
  );
  const registry = await registryFor(customProviderAgentDir);
  equal(await testHelpers.getApiKey(registry), "custom-zai-key", "should read key from a custom models.json provider pointing at a Z.AI endpoint");
} finally {
  await rm(customProviderAgentDir, { recursive: true, force: true });
}

const commandAgentDir = await mkdtemp(join(tmpdir(), "pi-zai-mcp-command-auth-"));
try {
  const marker = join(commandAgentDir, "command-ran");
  restoreEnv();
  delete process.env.Z_AI_API_KEY;
  delete process.env.ZAI_API_KEY;
  delete process.env.ZAI_CODING_CN_API_KEY;
  process.env.PI_CODING_AGENT_DIR = commandAgentDir;
  await writeFile(
    join(commandAgentDir, "auth.json"),
    JSON.stringify({
      zai: {
        type: "api_key",
        key: `!node -e ${JSON.stringify(`require("node:fs").appendFileSync(${JSON.stringify(marker)}, "x"); process.stdout.write("command-key")`)}`,
      },
    }),
    "utf8",
  );
  await assert.rejects(() => access(marker));
  const registry = await registryFor(commandAgentDir);
  const hostRefreshRuns = await readFile(marker, "utf8");
  equal(testHelpers.hasApiKeySource(registry), true);
  equal(await readFile(marker, "utf8"), hostRefreshRuns, "extension status must not execute auth commands beyond native host refresh");
  equal(await testHelpers.getApiKey(registry), "command-key");
  equal(await testHelpers.getApiKey(registry), "command-key");
  equal(await readFile(marker, "utf8"), "x");
} finally {
  await rm(commandAgentDir, { recursive: true, force: true });
}

testHelpers.resetGlobalStateForTests();
const statusLoaded = loadExtension();
const command = statusLoaded.commands.get("zai-mcp-status");
assert.ok(command !== undefined);
/** @type {{message: string, type?: string}} */
let rpcNotification = { message: "" };
await command.handler("", {
  hasUI: true,
  mode: "rpc",
  ui: { /** @param {string} message @param {string} type */ notify: (message, type) => { rpcNotification = { message, type }; } },
});
equal(rpcNotification.type, "info");
assert.match(rpcNotification.message, /lazy_not_connected_until_first_use/);

const jsonOutput = await patchWrite(process.stderr, () =>
  command.handler("", { hasUI: false, mode: "json", ui: { notify: () => assert.fail("notify should not be used") } }),
);
assert.match(jsonOutput, /Z\.ai Web Search/);

const printOutput = await patchWrite(process.stdout, () =>
  command.handler("", { hasUI: false, mode: "print", ui: { notify: () => assert.fail("notify should not be used") } }),
);
assert.match(printOutput, /Z\.ai Web Search/);

restoreEnv();
console.log("smoke ok");
