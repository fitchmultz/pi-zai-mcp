import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { syncBuiltinESMExports } from "node:module";

// Explicit --import on the real vendor child, not inherited NODE_OPTIONS.
function denyNetwork() {
  throw new Error("Unexpected network in offline vision fixture");
}
http.request = http.get = https.request = https.get = denyNetwork;
net.connect = net.createConnection = net.Socket.prototype.connect = denyNetwork;
syncBuiltinESMExports();
globalThis.fetch = async (url, options) => {
  assert.equal(String(url), "https://api.z.ai/api/paas/v4/chat/completions");
  const body = JSON.parse(options.body);
  const receipt = {
    authorization: new Headers(options.headers).get("authorization"),
    unrelatedEnvironment: ["ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY", "NODE_OPTIONS"].filter((key) => key in process.env),
    model: body.model,
    maxTokens: body.max_tokens,
  };
  return Response.json({ choices: [{ message: { content: JSON.stringify(receipt) } }] });
};
