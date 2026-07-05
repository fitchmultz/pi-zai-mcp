import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __test, default as zaiMcpExtension } from "../src/index.ts";
import zaiMcpReader from "../extensions/zai-mcp-reader.ts";
import zaiMcpSearch from "../extensions/zai-mcp-search.ts";
import zaiMcpStatus from "../extensions/zai-mcp-status.ts";
import zaiMcpVision from "../extensions/zai-mcp-vision.ts";
import zaiMcpZread from "../extensions/zai-mcp-zread.ts";

const savedEnv = { ...process.env };

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

async function loadFreshModule(id) {
  return import(`../src/index.ts?smoke=${id}-${Date.now()}-${Math.random()}`);
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

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
assert.deepEqual(packageJson.pi.extensions, [
  "./extensions/zai-mcp-search.ts",
  "./extensions/zai-mcp-reader.ts",
  "./extensions/zai-mcp-zread.ts",
  "./extensions/zai-mcp-vision.ts",
  "./extensions/zai-mcp-status.ts",
]);

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

const split = [zaiMcpSearch, zaiMcpReader, zaiMcpZread, zaiMcpVision].flatMap((extension) => loadExtension({}, extension).tools.map((tool) => tool.name));
assert.deepEqual(split, ["z_ai_search", "z_ai_reader", "z_ai_zread", "z_ai_vision"]);
assert.deepEqual(loadExtension({ Z_AI_MCP_SERVERS: "reader" }, zaiMcpSearch).tools.map((tool) => tool.name), ["z_ai_search"]);
assert.deepEqual(loadExtension({}, zaiMcpStatus).tools, []);

__test.resetGlobalStateForTests();
{
  const tools = [];
  const commands = new Map();
  const pi = {
    registerTool: (tool) => tools.push(tool),
    registerCommand: (name, command) => commands.set(name, command),
    on: () => undefined,
  };
  for (const server of ["search", "reader", "zread", "vision"]) {
    const mod = await loadFreshModule(server);
    mod.registerZaiMcpServers(pi, [server]);
  }
  const statusMod = await loadFreshModule("status");
  statusMod.registerZaiMcpStatusCommand(pi);
  let notification;
  await commands.get("zai-mcp-status").handler("", {
    hasUI: true,
    mode: "rpc",
    ui: { notify: (message) => (notification = message) },
  });
  assert.deepEqual(JSON.parse(notification).map((server) => server.id), ["search", "reader", "zread", "vision"]);
}
__test.resetGlobalStateForTests();

const none = loadExtension({ Z_AI_MCP_SERVERS: "unknown" });
assert.equal(none.tools.length, 0);
assert.match(none.warnings.join("\n"), /no Z\.AI MCP servers enabled/);

assert.deepEqual(
  __test.searchArgs({ query: "current pi docs" }),
  { search_query: "current pi docs", search_domain_filter: undefined, search_recency_filter: undefined, content_size: "high", location: undefined },
);
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

const missingKeyAgentDir = await mkdtemp(join(tmpdir(), "pi-zai-mcp-missing-key-"));
try {
  restoreEnv();
  delete process.env.Z_AI_API_KEY;
  delete process.env.ZAI_API_KEY;
  delete process.env.ZAI_CODING_CN_API_KEY;
  process.env.PI_CODING_AGENT_DIR = missingKeyAgentDir;
  await assert.rejects(
    () => loaded.tools[0].execute("call-1", { query: "current pi docs" }, undefined, undefined, {}),
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
  assert.equal(__test.getApiKey(), "stored-key");
  process.env.Z_AI_API_KEY = "env-key";
  assert.equal(__test.getApiKey(), "env-key");
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
  assert.equal(__test.getApiKey(), "cn-stored-key", "should read key stored under the zai-coding-cn provider");
  process.env.ZAI_CODING_CN_API_KEY = "cn-env-key";
  assert.equal(__test.getApiKey(), "cn-env-key", "ZAI_CODING_CN_API_KEY env should take precedence");
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
  assert.equal(__test.getApiKey(), "custom-zai-key", "should read key from a custom models.json provider pointing at a Z.AI endpoint");
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
  assert.equal(__test.hasApiKeySource(), true);
  await assert.rejects(() => access(marker));
  assert.equal(__test.getApiKey(), "command-key");
  assert.equal(__test.getApiKey(), "command-key");
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
