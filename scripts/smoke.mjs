import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRuntime, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { InMemoryModelsStore } from "@earendil-works/pi-ai";
import { __test, default as zaiMcpExtension } from "../src/index.ts";
import zaiMcpSearch from "../extensions/zai-mcp-search.ts";
import zaiMcpStatus from "../extensions/zai-mcp-status.ts";

const savedEnv = { ...process.env };
async function registryFor(agentDir) {
  return new ModelRegistry(await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json"), modelsStore: new InMemoryModelsStore(), allowModelNetwork: false }));
}

function restoreEnv() {
  process.env = { ...savedEnv };
}

function captureWarn(fn) {
  const original = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(String(message));
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

  const tools = [];
  const commands = new Map();
  const pi = {
    registerTool: (tool) => tools.push(tool),
    registerCommand: (name, command) => commands.set(name, command),
    on: () => undefined,
  };
  const warnings = captureWarn(() => extension(pi));
  return { tools, commands, warnings };
}

function patchWrite(stream, fn) {
  const original = stream.write;
  let output = "";
  stream.write = (chunk) => {
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

__test.resetGlobalStateForTests();
const loaded = loadExtension();
assert.deepEqual(
  loaded.tools.map((tool) => tool.name),
  ["z_ai_search", "z_ai_reader", "z_ai_zread", "z_ai_vision"],
);
assert.ok(loaded.commands.has("zai-mcp-status"));

const searchOnly = loadExtension({ Z_AI_MCP_SERVERS: "search,unknown" });
assert.deepEqual(searchOnly.tools.map((tool) => tool.name), ["z_ai_search"]);
assert.match(searchOnly.warnings.join("\n"), /ignoring unknown Z_AI_MCP_SERVERS/);

for (const tool of loaded.tools) {
  assert.ok(tool.promptSnippet, `${tool.name} declares prompt routing metadata`);
  assert.ok(tool.promptGuidelines.every((guideline) => guideline.includes(tool.name)), `${tool.name} names itself in every prompt guideline`);
}
assert.deepEqual(loadExtension({ Z_AI_MCP_SERVERS: "reader" }, zaiMcpSearch).tools.map((tool) => tool.name), ["z_ai_search"]);
assert.deepEqual(loadExtension({}, zaiMcpStatus).tools, []);

const none = loadExtension({ Z_AI_MCP_SERVERS: "unknown" });
assert.equal(none.tools.length, 0);
assert.match(none.warnings.join("\n"), /no Z\.AI MCP servers enabled/);

assert.deepEqual(
  __test.searchArgs({ query: "current pi docs", content_size: "medium" }),
  { search_query: "current pi docs", search_domain_filter: undefined, search_recency_filter: undefined, content_size: "medium", location: undefined },
);

assert.deepEqual(
  __test.visionArgs({ action: "analyze_image", image_source: "@screenshots/app.png", prompt: "describe" }),
  { image_source: "screenshots/app.png", prompt: "describe" },
);
assert.deepEqual(
  __test.visionArgs({
    action: "ui_diff_check",
    expected_image_source: "@expected.png",
    actual_image_source: "@actual.png",
    prompt: "compare",
  }),
  { expected_image_source: "expected.png", actual_image_source: "actual.png", prompt: "compare" },
);
assert.deepEqual(
  __test.visionArgs({ action: "analyze_video", video_source: "@demo.mp4", prompt: "summarize" }),
  { video_source: "demo.mp4", prompt: "summarize" },
);

const truncated = await __test.truncateForTool("small", "search", "web_search_prime");
assert.equal(truncated.content, "small");
assert.deepEqual(truncated.details, { truncated: false });

{
  let closeCalls = 0;
  let connectOptions;
  const transport = { close: async () => { closeCalls += 1; } };
  const client = {
    connect: async (_transport, options) => {
      connectOptions = options;
      await new Promise(() => undefined);
    },
  };
  const server = { id: "search", kind: "http" };
  const controller = new AbortController();
  const connecting = __test.connectWith(server, controller.signal, () => ({ client, transport }));
  while (!connectOptions) await Promise.resolve();
  controller.abort();
  await assert.rejects(connecting, /cancelled while connecting/);
  assert.equal(connectOptions.signal.aborted, true, "connecting receives Pi cancellation");
  assert.equal(closeCalls, 1, "cancellation closes the owned transport once");
  assert.equal(server.client, undefined);
  assert.equal(server.transport, undefined);
  assert.equal(server.connectPromise, undefined);
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
      terminateSession: () => new Promise(() => undefined),
      close: async () => { hangingCloseCalls += 1; },
    },
    connectPromise: new Promise(() => undefined),
    callQueue: new Promise(() => undefined),
  };
  const rejected = {
    id: "reader",
    label: "rejected HTTP shutdown",
    kind: "http",
    transport: {
      terminateSession: async () => { throw new Error("delete failed"); },
      close: async () => { rejectedCloseCalls += 1; },
    },
  };
  const started = Date.now();
  await __test.closeServers([hanging, rejected], 20);
  assert.ok(Date.now() - started < 500, "shutdown remains bounded when HTTP DELETE never settles");
  assert.equal(hangingCloseCalls, 1, "timed-out HTTP termination still closes transport");
  assert.equal(rejectedCloseCalls, 1, "failed HTTP termination still closes transport");
  assert.equal(hanging.client, undefined);
  assert.equal(hanging.transport, undefined);
  assert.equal(hanging.connectPromise, undefined);
  assert.equal(hanging.callQueue, undefined, "shutdown resets the per-server call queue");
}

const missingKeyAgentDir = await mkdtemp(join(tmpdir(), "pi-zai-mcp-missing-key-"));
for (const phase of ["authentication", "initialize"]) {
  let release, closeCalls = 0, connects = 0;
  const wait = new Promise(resolve => { release = resolve; });
  const transport = { terminateSession: async () => {}, close: async () => { closeCalls++; } };
  const client = { connect: async () => { connects++; if (phase === "initialize") await wait; } };
  const server = { id: "search", kind: "http" };
  const pending = __test.connectWith(server, undefined, async () => {
    if (phase === "authentication") await wait;
    return { client, transport };
  });
  const rejected = assert.rejects(pending, /cancelled|shut down/);
  if (phase === "initialize") while (!connects) await Promise.resolve();
  await Promise.all([__test.closeServers([server]), __test.closeServers([server])]);
  release();
  await rejected;
  assert.equal(closeCalls, 1, `${phase}: teardown closes each owned transport once`);
  assert.equal(server.client, undefined, `${phase}: late setup cannot publish a stale client`);
  await assert.rejects(() => __test.connectWith(server, undefined, () => ({ client, transport })), /shut down/);
}
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
  assert.equal(await __test.getApiKey(registry), "stored-key");
  process.env.Z_AI_API_KEY = "env-key";
  assert.equal(await __test.getApiKey(registry), "env-key");
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
  assert.equal(await __test.getApiKey(registry), "cn-stored-key", "should read key stored under the zai-coding-cn provider");
  process.env.ZAI_CODING_CN_API_KEY = "cn-env-key";
  assert.equal(await __test.getApiKey(registry), "cn-env-key", "ZAI_CODING_CN_API_KEY env should take precedence");
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
  assert.equal(await __test.getApiKey(registry), "custom-zai-key", "should read key from a custom models.json provider pointing at a Z.AI endpoint");
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
  assert.equal(__test.hasApiKeySource(registry), true);
  assert.equal(await readFile(marker, "utf8"), hostRefreshRuns, "extension status must not execute auth commands beyond native host refresh");
  assert.equal(await __test.getApiKey(registry), "command-key");
  assert.equal(await __test.getApiKey(registry), "command-key");
  assert.equal(await readFile(marker, "utf8"), "x");
} finally {
  await rm(commandAgentDir, { recursive: true, force: true });
}

__test.resetGlobalStateForTests();
const statusLoaded = loadExtension();
const command = statusLoaded.commands.get("zai-mcp-status");
let rpcNotification;
await command.handler("", {
  hasUI: true,
  mode: "rpc",
  ui: { notify: (message, type) => (rpcNotification = { message, type }) },
});
assert.equal(rpcNotification.type, "info");
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
