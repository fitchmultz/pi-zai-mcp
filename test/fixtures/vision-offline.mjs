import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { syncBuiltinESMExports } from "node:module";

// Explicit --import on the real vendor child, not inherited NODE_OPTIONS.
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
globalThis.fetch = (input, options) => {
  assert.ok(typeof options?.body === "string");
  const body = /** @type {unknown} */ (JSON.parse(options.body));
  assert.ok(body !== null && typeof body === "object");
  assert.ok("model" in body && "max_tokens" in body && "temperature" in body && "top_p" in body);
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
