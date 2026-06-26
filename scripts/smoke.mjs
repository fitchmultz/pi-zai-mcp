import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __test, default as zaiMcpExtension } from "../src/index.ts";

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

function loadExtension(env = {}) {
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
  const warnings = captureWarn(() => zaiMcpExtension(pi));
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

const loaded = loadExtension();
assert.deepEqual(
  loaded.tools.map((tool) => tool.name),
  ["z_ai_search", "z_ai_reader", "z_ai_zread", "z_ai_vision"],
);
assert.ok(loaded.commands.has("zai-mcp-status"));

const searchOnly = loadExtension({ Z_AI_MCP_SERVERS: "search,unknown" });
assert.deepEqual(searchOnly.tools.map((tool) => tool.name), ["z_ai_search"]);
assert.match(searchOnly.warnings.join("\n"), /ignoring unknown Z_AI_MCP_SERVERS/);

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

restoreEnv();
delete process.env.Z_AI_API_KEY;
delete process.env.ZAI_API_KEY;
await assert.rejects(
  () => loaded.tools[0].execute("call-1", { query: "current pi docs" }, undefined, undefined, {}),
  /Missing Z\.ai API key/,
);

const agentDir = await mkdtemp(join(tmpdir(), "pi-zai-mcp-auth-"));
try {
  restoreEnv();
  delete process.env.Z_AI_API_KEY;
  delete process.env.ZAI_API_KEY;
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

const commandAgentDir = await mkdtemp(join(tmpdir(), "pi-zai-mcp-command-auth-"));
try {
  const marker = join(commandAgentDir, "command-ran");
  restoreEnv();
  delete process.env.Z_AI_API_KEY;
  delete process.env.ZAI_API_KEY;
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

const command = loaded.commands.get("zai-mcp-status");
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
