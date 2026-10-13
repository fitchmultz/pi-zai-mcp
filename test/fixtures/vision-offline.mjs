import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { appendFileSync, readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { InitializeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { syncBuiltinESMExports } from "node:module";

// A real child's write callback must complete without exposing its synthetic diagnostics.
/** @type {Promise<void>} */
const stderrDrained = new Promise((resolve) => {
  process.stderr.write("private fixture stderr".repeat(100_000), () => {
    resolve();
  });
});

await stderrDrained;

const serverName = process.env.SERVER_NAME;
if (serverName?.startsWith("fixture-hold-initialize-") === true) {
  const logPath = process.env.ZAI_MCP_LOG_PATH;
  assert.ok(logPath !== undefined);
  const marker = `OFFLINE_INITIALIZE_STARTED ${serverName}`;
  if (!readFileSync(logPath, "utf8").includes(marker)) {
    const server = new McpServer({ name: serverName, version: "1" });
    server.server.setRequestHandler(InitializeRequestSchema, () => {
      appendFileSync(logPath, `${marker}\n`);
      return new Promise(() => {
        /* Held until native client disposal, not a fabricated protocol reply. */
      });
    });
    setInterval(() => {
      /* Keep this real child alive after EOF until the SDK sends a termination signal. */
    }, 1000);
    await server.connect(new StdioServerTransport());
    await new Promise(() => {
      /* The next fresh child skips this marker and runs the actual vendor entrypoint. */
    });
  }
}

/** @returns {never} */
function denyNetwork() {
  throw new Error("Unexpected network in offline vision fixture");
}
http.request = denyNetwork;
http.get = denyNetwork;
https.request = denyNetwork;
https.get = denyNetwork;
net.connect = denyNetwork;
net.createConnection = denyNetwork;
net.Socket.prototype.connect = denyNetwork;
syncBuiltinESMExports();

/** @param {unknown} block */
function visualSource(block) {
  assert.ok(block !== null && typeof block === "object");
  let source;
  if ("image_url" in block) {
    source = block.image_url;
  } else if ("video_url" in block) {
    source = block.video_url;
  }
  if (source !== null && typeof source === "object" && "url" in source) {
    assert.ok(typeof source.url === "string");
    return source.url;
  }
  return;
}

/** @param {unknown} messages */
function visualSources(messages) {
  assert.ok(Array.isArray(messages));
  /** @type {string[]} */
  const sources = [];
  for (const message of messages) {
    const value = /** @type {unknown} */ (message);
    assert.ok(value !== null && typeof value === "object" && "content" in value);
    if (!Array.isArray(value.content)) {
      continue;
    }
    for (const block of value.content) {
      const source = visualSource(block);
      if (source !== undefined) {
        sources.push(source);
      }
    }
  }
  return sources;
}

globalThis.fetch = (input, options) => {
  assert.ok(typeof options?.body === "string");
  const body = /** @type {unknown} */ (JSON.parse(options.body));
  assert.ok(body !== null && typeof body === "object");
  assert.ok(
    "model" in body &&
      "max_tokens" in body &&
      "temperature" in body &&
      "top_p" in body &&
      "messages" in body,
  );
  const held = /hold-offline-fetch-\w+/.exec(options.body)?.[0];
  if (held !== undefined) {
    const logPath = process.env.ZAI_MCP_LOG_PATH;
    assert.ok(logPath !== undefined);
    appendFileSync(logPath, `OFFLINE_FETCH_STARTED ${held}\n`);
    return new Promise(() => {
      /* Held until the extension disposes this real vendor child. */
    });
  }
  let url;
  if (typeof input === "string") {
    url = input;
  } else if ("url" in input) {
    url = input.url;
  } else {
    url = input.toString();
  }
  const receipt = {
    url,
    pid: process.pid,
    sources: visualSources(body.messages),
    authorization: new Headers(options.headers).get("authorization"),
    unrelatedEnvironment: ["ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY", "NODE_OPTIONS"].filter(
      (key) => key in process.env,
    ),
    model: body.model,
    maxTokens: body.max_tokens,
    temperature: body.temperature,
    topP: body.top_p,
    logPath: process.env.ZAI_MCP_LOG_PATH ?? null,
  };
  return Promise.resolve(
    Response.json({ choices: [{ message: { content: JSON.stringify(receipt) } }] }),
  );
};
