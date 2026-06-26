import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  getAgentDir,
  highlightCode,
  keyHint,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai/compat";
import { Text } from "@earendil-works/pi-tui";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Type } from "typebox";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const EXTENSION_NAME = "pi-zai-mcp";
const require = createRequire(import.meta.url);
const { version: EXTENSION_VERSION } = require("../package.json") as { version: string };
const VISION_MCP_PACKAGE = "@z_ai/mcp-server";
const VISION_MCP_BIN = "zai-mcp-server";
const DEFAULT_TIMEOUT_MS = positiveIntegerFromEnv("Z_AI_MCP_TIMEOUT_MS", 180_000);

type ServerId = "search" | "reader" | "zread" | "vision";
type ServerKind = "http" | "stdio";

type ServerConfig = {
  id: ServerId;
  label: string;
  kind: ServerKind;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
};

type ManagedServer = ServerConfig & {
  client?: Client;
  transport?: StreamableHTTPClientTransport | StdioClientTransport;
  connectPromise?: Promise<Client>;
  callQueue?: Promise<void>;
  lastError?: string;
};

type ToolUpdate = {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
};

type ToolRenderContext = {
  args?: Record<string, unknown>;
};

type ZreadAction = "search_doc" | "read_file" | "get_repo_structure";
type VisionAction =
  | "ui_to_artifact"
  | "extract_text_from_screenshot"
  | "diagnose_error_screenshot"
  | "understand_technical_diagram"
  | "analyze_data_visualization"
  | "ui_diff_check"
  | "analyze_image"
  | "analyze_video";

const SEARCH_SCHEMA = Type.Object({
  query: Type.String({
    minLength: 1,
    description: "Search query. Z.AI recommends keeping it under about 70 characters.",
  }),
  domain_filter: Type.Optional(
    Type.String({ minLength: 1, description: "Optional whitelist domain, for example 'docs.z.ai' or 'github.com'." }),
  ),
  recency_filter: Type.Optional(
    StringEnum(["oneDay", "oneWeek", "oneMonth", "oneYear", "noLimit"] as const, {
      description: "Optional time range for search results.",
      default: "noLimit",
    }),
  ),
  content_size: Type.Optional(
    StringEnum(["medium", "high"] as const, {
      description: "Summary size. Defaults to 'high' for more context; use 'medium' to reduce quota use.",
      default: "high",
    }),
  ),
  location: Type.Optional(
    StringEnum(["cn", "us"] as const, {
      description: "User region hint. Use 'cn' for Chinese-region queries, 'us' for non-Chinese-region queries.",
      default: "cn",
    }),
  ),
});

const READER_SCHEMA = Type.Object({
  url: Type.String({ format: "uri", description: "URL to fetch and convert into model-friendly input." }),
  timeout: Type.Optional(Type.Integer({ minimum: 1, description: "Request timeout in seconds. Z.AI default is 20." })),
  no_cache: Type.Optional(Type.Boolean({ description: "Disable Z.AI reader cache." })),
  return_format: Type.Optional(
    StringEnum(["markdown", "text"] as const, { description: "Return Markdown or plain text.", default: "markdown" }),
  ),
  retain_images: Type.Optional(Type.Boolean({ description: "Keep image references in the returned content. Default true upstream." })),
  no_gfm: Type.Optional(Type.Boolean({ description: "Disable GitHub Flavored Markdown output." })),
  keep_img_data_url: Type.Optional(Type.Boolean({ description: "Keep image data URLs. Default false upstream." })),
  with_images_summary: Type.Optional(Type.Boolean({ description: "Include a summary of images found on the page." })),
  with_links_summary: Type.Optional(Type.Boolean({ description: "Include a summary of links found on the page." })),
});

const ZREAD_SCHEMA = Type.Object({
  action: StringEnum(["search_doc", "read_file", "get_repo_structure"] as const, {
    description:
      "Repository action: search_doc searches docs/issues/commits, read_file reads one file, get_repo_structure lists directories/files.",
  }),
  repo_name: Type.String({
    minLength: 3,
    pattern: "^[^/\\s]+/[^/\\s]+$",
    description: "Public GitHub repository in owner/repo form, for example 'vitejs/vite'.",
  }),
  query: Type.Optional(Type.String({ minLength: 1, description: "Required for search_doc: keywords or question about the repository." })),
  language: Type.Optional(
    StringEnum(["en", "zh"] as const, { description: "Optional search_doc response language hint.", default: "en" }),
  ),
  file_path: Type.Optional(Type.String({ minLength: 1, description: "Required for read_file: repository-relative file path." })),
  dir_path: Type.Optional(Type.String({ minLength: 1, description: "Optional for get_repo_structure: directory path; default is repository root." })),
});

const VISION_SCHEMA = Type.Object({
  action: StringEnum(
    [
      "ui_to_artifact",
      "extract_text_from_screenshot",
      "diagnose_error_screenshot",
      "understand_technical_diagram",
      "analyze_data_visualization",
      "ui_diff_check",
      "analyze_image",
      "analyze_video",
    ] as const,
    {
      description:
        "Vision action. Choose the most specific action; use analyze_image only as a fallback and analyze_video for MP4/MOV/M4V video up to 8 MB.",
    },
  ),
  image_source: Type.Optional(
    Type.String({
      minLength: 1,
      description:
        "Local image path or remote image URL. Required for single-image actions except ui_diff_check and analyze_video.",
    }),
  ),
  expected_image_source: Type.Optional(
    Type.String({ minLength: 1, description: "Required for ui_diff_check: expected/reference UI screenshot path or URL." }),
  ),
  actual_image_source: Type.Optional(
    Type.String({ minLength: 1, description: "Required for ui_diff_check: actual/implemented UI screenshot path or URL." }),
  ),
  video_source: Type.Optional(
    Type.String({ minLength: 1, description: "Required for analyze_video: local path or remote URL to MP4, MOV, or M4V video up to 8 MB." }),
  ),
  prompt: Type.String({ minLength: 1, description: "Specific instructions for what to analyze, extract, compare, diagnose, or generate." }),
  output_type: Type.Optional(
    StringEnum(["code", "prompt", "spec", "description"] as const, {
      description: "Required for ui_to_artifact: desired artifact type.",
    }),
  ),
  programming_language: Type.Optional(
    Type.String({ description: "Optional for OCR/code screenshots: programming language such as 'python' or 'typescript'." }),
  ),
  context: Type.Optional(
    Type.String({ description: "Optional for error diagnosis: when/where the error happened, command run, app context, etc." }),
  ),
  diagram_type: Type.Optional(
    Type.String({ description: "Optional for diagrams: architecture, flowchart, UML, ER, sequence, etc." }),
  ),
  analysis_focus: Type.Optional(
    Type.String({ description: "Optional for data visualizations: trends, anomalies, comparisons, metrics, etc." }),
  ),
});

function positiveIntegerFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

const ENV_VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENV_VAR_NAME_PREFIX_RE = /^[A-Za-z_][A-Za-z0-9_]*/;
const AUTH_COMMAND_CACHE = new Map<string, string | undefined>();

function resolveAuthKeyTemplate(value: string, env?: Record<string, string>): string | undefined {
  let resolved = "";
  let index = 0;

  while (index < value.length) {
    const dollarIndex = value.indexOf("$", index);
    if (dollarIndex < 0) return resolved + value.slice(index);

    resolved += value.slice(index, dollarIndex);
    const next = value[dollarIndex + 1];

    if (next === "$" || next === "!") {
      resolved += next;
      index = dollarIndex + 2;
      continue;
    }

    if (next === "{") {
      const end = value.indexOf("}", dollarIndex + 2);
      if (end < 0) {
        resolved += "$";
        index = dollarIndex + 1;
        continue;
      }
      const name = value.slice(dollarIndex + 2, end);
      if (!ENV_VAR_NAME_RE.test(name)) {
        resolved += value.slice(dollarIndex, end + 1);
        index = end + 1;
        continue;
      }
      const replacement = env?.[name] ?? process.env[name];
      if (replacement === undefined) return undefined;
      resolved += replacement;
      index = end + 1;
      continue;
    }

    const match = value.slice(dollarIndex + 1).match(ENV_VAR_NAME_PREFIX_RE);
    if (!match) {
      resolved += "$";
      index = dollarIndex + 1;
      continue;
    }

    const replacement = env?.[match[0]] ?? process.env[match[0]];
    if (replacement === undefined) return undefined;
    resolved += replacement;
    index = dollarIndex + 1 + match[0].length;
  }

  return resolved;
}

function resolveAuthKey(value: string, env?: Record<string, string>): string | undefined {
  if (value.startsWith("!")) {
    if (AUTH_COMMAND_CACHE.has(value)) return AUTH_COMMAND_CACHE.get(value);
    let result: string | undefined;
    try {
      const output = execSync(value.slice(1), {
        encoding: "utf8",
        timeout: 10_000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      result = output.trim() || undefined;
    } catch {
      result = undefined;
    }
    AUTH_COMMAND_CACHE.set(value, result);
    return result;
  }

  return resolveAuthKeyTemplate(value, env);
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function readZaiCredential(): { key: string; env?: Record<string, string> } | undefined {
  try {
    const raw = readFileSync(join(getAgentDir(), "auth.json"), "utf8");
    const parsed = JSON.parse(raw) as { zai?: { type?: unknown; key?: unknown; env?: unknown } };
    const credential = parsed.zai;
    if (credential?.type !== "api_key" || typeof credential.key !== "string" || credential.key.length === 0) return undefined;
    return { key: credential.key, env: stringRecord(credential.env) };
  } catch {
    return undefined;
  }
}

function readZaiKeyFromPiAuth(): string | undefined {
  const credential = readZaiCredential();
  return credential ? resolveAuthKey(credential.key, credential.env) : undefined;
}

function hasApiKeySource(): boolean {
  return Boolean(process.env.Z_AI_API_KEY || process.env.ZAI_API_KEY || readZaiCredential());
}

function getApiKey(): string | undefined {
  return process.env.Z_AI_API_KEY || process.env.ZAI_API_KEY || readZaiKeyFromPiAuth();
}

function enabledServerIds(): Set<ServerId> | undefined {
  const raw = process.env.Z_AI_MCP_SERVERS;
  if (!raw || raw.trim().length === 0 || raw.trim().toLowerCase() === "all") return undefined;

  const known = new Set<ServerId>(["search", "reader", "zread", "vision"]);
  const enabled = new Set<ServerId>();
  const unknown: string[] = [];

  for (const value of raw.split(",")) {
    const id = value.trim().toLowerCase();
    if (!id) continue;
    if (known.has(id as ServerId)) {
      enabled.add(id as ServerId);
    } else {
      unknown.push(id);
    }
  }

  if (unknown.length > 0) {
    console.warn(`[${EXTENSION_NAME}] ignoring unknown Z_AI_MCP_SERVERS value(s): ${unknown.join(", ")}`);
  }

  return enabled;
}

function environment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
}

function resolveVisionServerCommand(): { command: string; args: string[] } {
  const packageJsonPath = require.resolve(`${VISION_MCP_PACKAGE}/package.json`);
  const packageRoot = dirname(packageJsonPath);
  const packageJson = require(packageJsonPath) as { bin?: string | Record<string, string> };
  const binPath = typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin?.[VISION_MCP_BIN];

  if (!binPath) throw new Error(`${VISION_MCP_PACKAGE} does not declare the ${VISION_MCP_BIN} binary.`);

  return {
    command: process.execPath,
    args: [resolve(packageRoot, binPath)],
  };
}

function createServers(): ManagedServer[] {
  const enabled = enabledServerIds();
  const all: ManagedServer[] = [
    {
      id: "search",
      label: "Z.ai Web Search",
      kind: "http",
      url: "https://api.z.ai/api/mcp/web_search_prime/mcp",
    },
    {
      id: "reader",
      label: "Z.ai Web Reader",
      kind: "http",
      url: "https://api.z.ai/api/mcp/web_reader/mcp",
    },
    {
      id: "zread",
      label: "Z.ai Zread Repository Reader",
      kind: "http",
      url: "https://api.z.ai/api/mcp/zread/mcp",
    },
  ];

  if (!enabled || enabled.has("vision")) {
    const visionCommand = resolveVisionServerCommand();
    all.push({
      id: "vision",
      label: "Z.ai Vision",
      kind: "stdio",
      command: visionCommand.command,
      args: visionCommand.args,
      env: {
        ...environment(),
        Z_AI_MODE: process.env.Z_AI_MODE || "ZAI",
      },
    });
  }

  if (!enabled) return all;
  return all.filter((server) => enabled.has(server.id));
}

function unwrapJsonString(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('"')) return text;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return typeof parsed === "string" ? unwrapJsonString(parsed) : text;
  } catch {
    return text;
  }
}

function isMcpErrorResult(result: unknown): boolean {
  return Boolean(result && typeof result === "object" && (result as { isError?: boolean }).isError);
}

function summarizeMcpResult(result: unknown): string {
  if (!result || typeof result !== "object") return String(result);

  const maybe = result as {
    content?: Array<Record<string, unknown>>;
    structuredContent?: unknown;
    isError?: boolean;
  };

  const parts: string[] = [];
  if (maybe.isError) parts.push("[MCP tool reported an error]");

  if (Array.isArray(maybe.content)) {
    for (const item of maybe.content) {
      if (item.type === "text" && typeof item.text === "string") {
        parts.push(unwrapJsonString(item.text));
      } else if (item.type === "image" && typeof item.mimeType === "string") {
        parts.push(`[Image result: ${item.mimeType}, ${typeof item.data === "string" ? item.data.length : 0} base64 chars]`);
      } else if (item.type === "resource" && item.resource && typeof item.resource === "object") {
        const resource = item.resource as Record<string, unknown>;
        if (typeof resource.text === "string") {
          parts.push(`[Resource: ${String(resource.uri ?? "unknown")}]\n${unwrapJsonString(resource.text)}`);
        } else {
          parts.push(`[Resource: ${String(resource.uri ?? "unknown")}]`);
        }
      } else if (item.type === "resource_link") {
        parts.push(`[Resource link: ${String(item.name ?? item.uri ?? "unknown")}] ${String(item.uri ?? "")}`);
      } else {
        parts.push(JSON.stringify(item, null, 2));
      }
    }
  }

  if (maybe.structuredContent !== undefined) {
    parts.push(`Structured content:\n${JSON.stringify(maybe.structuredContent, null, 2)}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : JSON.stringify(result, null, 2);
}

async function truncateForTool(
  text: string,
  serverId: string,
  toolName: string,
): Promise<{ content: string; details: { truncated: boolean; file?: string } }> {
  const truncation = truncateHead(text, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  if (!truncation.truncated) return { content: truncation.content, details: { truncated: false } };

  const dir = join(tmpdir(), EXTENSION_NAME);
  await mkdir(dir, { recursive: true });
  const safeName = `${Date.now()}-${randomUUID()}-${serverId}-${toolName}`.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const file = join(dir, `${safeName}.txt`);
  await writeFile(file, text, "utf8");

  const notice = `\n\n[Z.ai MCP output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Full output saved to: ${file}]`;
  return { content: truncation.content + notice, details: { truncated: true, file } };
}

async function connect(server: ManagedServer): Promise<Client> {
  if (server.client) return server.client;
  if (server.connectPromise) return server.connectPromise;

  server.connectPromise = (async () => {
    const client = new Client({ name: EXTENSION_NAME, version: EXTENSION_VERSION });

    if (server.kind === "http") {
      const apiKey = getApiKey();
      if (!apiKey) throw new Error("Missing Z.ai API key. Set Z_AI_API_KEY/ZAI_API_KEY or run pi /login for the zai provider.");
      if (!server.url) throw new Error(`Missing URL for ${server.id}`);
      const transport = new StreamableHTTPClientTransport(new URL(server.url), {
        requestInit: {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      });
      server.transport = transport;
      await client.connect(transport, { timeout: DEFAULT_TIMEOUT_MS });
    } else {
      const apiKey = getApiKey();
      if (!apiKey) throw new Error("Missing Z.ai API key. Set Z_AI_API_KEY/ZAI_API_KEY or run pi /login for the zai provider.");
      if (!server.command) throw new Error(`Missing command for ${server.id}`);
      const transport = new StdioClientTransport({
        command: server.command,
        args: server.args,
        env: { ...server.env, Z_AI_API_KEY: apiKey },
        stderr: "pipe",
      });
      server.transport = transport;
      await client.connect(transport, { timeout: DEFAULT_TIMEOUT_MS });
    }

    server.client = client;
    server.lastError = undefined;
    return client;
  })();

  try {
    return await server.connectPromise;
  } catch (error) {
    server.connectPromise = undefined;
    server.lastError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

function abortError(message: string): Error {
  return new Error(message);
}

function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
  if (signal?.aborted) throw abortError(message);
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined, message: string): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError(message));

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      cleanup();
      reject(abortError(message));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

async function runExclusive<T>(server: ManagedServer, signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T> {
  const previous = server.callQueue ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(() => {
    throwIfAborted(signal, "Tool call was cancelled before it started.");
    return operation();
  });
  const queueTail = run.then(
    () => undefined,
    () => undefined,
  );
  server.callQueue = queueTail;
  queueTail.finally(() => {
    if (server.callQueue === queueTail) server.callQueue = undefined;
  });

  return withAbort(run, signal, "Tool call was cancelled while waiting for another Z.AI MCP call to finish.");
}

async function callMcpTool(
  server: ManagedServer,
  toolName: string,
  args: Record<string, unknown>,
  signal: AbortSignal | undefined,
  onProgress?: (message: string) => void,
) {
  throwIfAborted(signal, "Tool call was cancelled before it started.");
  onProgress?.(`Connecting to ${server.label}...`);
  const client = await connect(server);
  throwIfAborted(signal, "Tool call was cancelled before it reached Z.AI MCP.");
  onProgress?.(`Calling ${server.label} ${toolName}...`);

  return client.callTool(
    { name: toolName, arguments: args },
    undefined,
    {
      signal,
      timeout: DEFAULT_TIMEOUT_MS,
      resetTimeoutOnProgress: true,
      onprogress: (progress) => {
        if (progress.message) onProgress?.(progress.message);
      },
    },
  );
}

function requireParam(params: Record<string, unknown>, name: string, action: string): void {
  if (params[name] === undefined || params[name] === null || params[name] === "") {
    throw new Error(`Missing required parameter '${name}' for ${action}.`);
  }
}

function cleanArgs(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined));
}

async function executeCuratedTool(
  server: ManagedServer,
  toolName: string,
  args: Record<string, unknown>,
  signal: AbortSignal | undefined,
  onUpdate: ((result: ToolUpdate) => void) | undefined,
) {
  const update = (progress: string) => {
    onUpdate?.({
      content: [{ type: "text", text: progress }],
      details: { server: server.id, tool: toolName, progress },
    });
  };

  update(server.callQueue ? `Waiting for another ${server.label} call to finish...` : `Starting ${server.label} ${toolName}...`);

  const result = await runExclusive(server, signal, () => callMcpTool(server, toolName, cleanArgs(args), signal, update));
  const text = summarizeMcpResult(result);
  if (isMcpErrorResult(result)) throw new Error(`Z.AI MCP ${server.id}/${toolName} failed:\n${text}`);
  const truncated = await truncateForTool(text, server.id, toolName);
  return {
    content: [{ type: "text" as const, text: truncated.content }],
    details: { server: server.id, tool: toolName, truncated: truncated.details },
  };
}

function firstTextContent(result: { content?: Array<{ type: string; text?: string }> }): string {
  return result.content?.find((item) => item.type === "text")?.text ?? "";
}

function displayText(raw: string): { text: string; language?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { text: raw };

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string") return displayText(parsed);
    return { text: JSON.stringify(parsed, null, 2), language: "json" };
  } catch {
    return { text: raw, language: trimmed.startsWith("{") || trimmed.startsWith("[") ? "json" : undefined };
  }
}

function limitedLines(text: string, maxLines: number): { text: string; totalLines: number; omittedLines: number } {
  const lines = text.split("\n");
  const shown = lines.slice(0, maxLines);
  return {
    text: shown.join("\n"),
    totalLines: lines.length,
    omittedLines: Math.max(0, lines.length - shown.length),
  };
}

function compactInline(value: unknown, maxLength = 120): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function renderToolCall(title: string, summary: string, theme: { fg(color: string, text: string): string; bold(text: string): string }) {
  const content = `${theme.fg("toolTitle", theme.bold(title))} ${theme.fg("accent", compactInline(summary))}`;
  return new Text(content.trimEnd(), 0, 0);
}

function renderCuratedResult(
  result: { content?: Array<{ type: string; text?: string }>; details?: unknown },
  options: { expanded?: boolean; isPartial?: boolean },
  theme: { fg(color: string, text: string): string },
  context?: ToolRenderContext,
) {
  const details = result.details as
    | { server?: string; tool?: string; progress?: string; truncated?: { truncated?: boolean; file?: string } }
    | undefined;

  if (options.isPartial) {
    const progress = firstTextContent(result) || details?.progress || "Starting Z.AI MCP call...";
    const target = details?.server || details?.tool ? `${details?.server ?? "z_ai"}/${details?.tool ?? "tool"}` : String(context?.args?.action ?? "Z.AI MCP");
    return new Text(`${theme.fg("warning", "running")} ${theme.fg("dim", target)}\n${theme.fg("toolOutput", progress)}`, 0, 0);
  }

  const raw = firstTextContent(result);
  const { text, language } = displayText(raw);
  const lineLimit = options.expanded ? 80 : 8;
  const byteLimit = options.expanded ? 24_000 : 4_000;
  const byteLimited = text.length > byteLimit ? `${text.slice(0, byteLimit)}\n… ${text.length - byteLimit} more characters omitted from TUI view` : text;
  const limited = limitedLines(byteLimited, lineLimit);
  const body = language ? highlightCode(limited.text, language).join("\n") : theme.fg("toolOutput", limited.text);

  const status = details?.truncated?.truncated ? theme.fg("warning", "truncated for agent context") : theme.fg("success", "done");
  let header = `${status} ${theme.fg("dim", `${details?.server ?? "z_ai"}/${details?.tool ?? "tool"}`)}`;
  if (!options.expanded && (limited.omittedLines > 0 || text.length > byteLimit)) {
    header += ` ${theme.fg("muted", `(${keyHint("app.tools.expand", "for more")})`)}`;
  }

  let footer = "";
  if (limited.omittedLines > 0) {
    footer += `\n${theme.fg("muted", `… ${limited.omittedLines} more lines omitted from TUI view`)}`;
  }
  if (details?.truncated?.file) {
    footer += `\n${theme.fg("muted", `Full agent-context output: ${details.truncated.file}`)}`;
  }

  return new Text(`${header}\n${body}${footer}`, 0, 0);
}

type ActionArgSpec = {
  required: readonly string[];
  picks: readonly string[];
};

type CuratedToolConfig = {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: ToolDefinition<any>["parameters"];
  renderCall: (...args: any[]) => any;
  renderResult: (...args: any[]) => any;
  toMcpToolName: (params: any) => string;
  toMcpArgs: (params: any) => Record<string, unknown>;
};

function buildArgs(
  action: string,
  params: Record<string, unknown>,
  table: Partial<Record<string, ActionArgSpec>>,
): Record<string, unknown> | undefined {
  const spec = table[action];
  if (!spec) return undefined;

  for (const key of spec.required) requireParam(params, key, action);
  return Object.fromEntries(spec.picks.map((key) => [key, params[key]]));
}

const ZREAD_ACTION_ARGS = {
  search_doc: { required: ["query"], picks: ["repo_name", "query", "language"] },
  read_file: { required: ["file_path"], picks: ["repo_name", "file_path"] },
  get_repo_structure: { required: [], picks: ["repo_name", "dir_path"] },
} as const satisfies Record<ZreadAction, ActionArgSpec>;

function zreadArgs(params: Record<string, unknown>): Record<string, unknown> {
  const action = params.action as ZreadAction;
  requireParam(params, "repo_name", action);

  const args = buildArgs(action, params, ZREAD_ACTION_ARGS);
  if (args) return args;

  throw new Error(`Unsupported Zread action '${String(action)}'.`);
}

const VISION_ACTION_ARGS = {
  ui_diff_check: {
    required: ["expected_image_source", "actual_image_source"],
    picks: ["expected_image_source", "actual_image_source", "prompt"],
  },
  analyze_video: { required: ["video_source"], picks: ["video_source", "prompt"] },
  ui_to_artifact: { required: ["image_source", "output_type"], picks: ["image_source", "output_type", "prompt"] },
  extract_text_from_screenshot: {
    required: ["image_source"],
    picks: ["image_source", "prompt", "programming_language"],
  },
  diagnose_error_screenshot: { required: ["image_source"], picks: ["image_source", "prompt", "context"] },
  understand_technical_diagram: { required: ["image_source"], picks: ["image_source", "prompt", "diagram_type"] },
  analyze_data_visualization: { required: ["image_source"], picks: ["image_source", "prompt", "analysis_focus"] },
  analyze_image: { required: ["image_source"], picks: ["image_source", "prompt"] },
} as const satisfies Record<VisionAction, ActionArgSpec>;

const VISION_SOURCE_KEYS = ["image_source", "expected_image_source", "actual_image_source", "video_source"] as const;

function normalizePathLikeSource(value: unknown): unknown {
  return typeof value === "string" && value.startsWith("@") ? value.slice(1) : value;
}

function normalizeVisionSources(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key,
      (VISION_SOURCE_KEYS as readonly string[]).includes(key) ? normalizePathLikeSource(value) : value,
    ]),
  );
}

function visionArgs(params: Record<string, unknown>): Record<string, unknown> {
  const action = params.action as VisionAction;

  const args = buildArgs(action, params, VISION_ACTION_ARGS);
  if (args) return normalizeVisionSources(args);

  requireParam(params, "image_source", action);
  throw new Error(`Unsupported vision action '${String(action)}'.`);
}

function searchArgs(params: Record<string, unknown>): Record<string, unknown> {
  return {
    search_query: params.query,
    search_domain_filter: params.domain_filter,
    search_recency_filter: params.recency_filter,
    content_size: params.content_size ?? "high",
    location: params.location,
  };
}

const REGISTRARS = {
  search: {
    name: "z_ai_search",
    label: "Z.ai Search",
    description:
      "Search the live web through Z.AI Web Search MCP. Use for current information, docs, news, weather, stocks, or external references. Supports domain, recency, summary-size, and region filters.",
    promptSnippet: "Search the web with Z.AI Web Search MCP using query, domain, recency, summary-size, and region filters",
    promptGuidelines: [
      "Use z_ai_search when the user needs current web information or external documentation beyond the local repo.",
      "Default content_size is high for more context; specify medium when lower quota use is more important.",
      "Keep z_ai_search queries focused; use domain_filter for known sites and recency_filter for time-sensitive questions.",
    ],
    parameters: SEARCH_SCHEMA,
    renderCall(args, theme) {
      const filters = [args.domain_filter, args.recency_filter, args.content_size].filter(Boolean).join(", ");
      return renderToolCall("z_ai_search", `${args.query}${filters ? ` (${filters})` : ""}`, theme);
    },
    renderResult(result, options, theme, context) {
      return renderCuratedResult(result, options, theme, context);
    },
    toMcpToolName: () => "web_search_prime",
    toMcpArgs: searchArgs,
  },
  reader: {
    name: "z_ai_reader",
    label: "Z.ai Reader",
    description:
      "Read and convert a URL through Z.AI Web Reader MCP. Returns model-friendly Markdown or text and can include image/link summaries. Use after search or when the user provides a specific URL.",
    promptSnippet: "Read a URL with Z.AI Web Reader MCP and return Markdown/text plus optional image/link summaries",
    promptGuidelines: [
      "Use z_ai_reader when a specific URL needs full-page content instead of search snippets.",
      "Set with_links_summary or with_images_summary on z_ai_reader when links or image context matters.",
    ],
    parameters: READER_SCHEMA,
    renderCall(args, theme) {
      return renderToolCall("z_ai_reader", args.url, theme);
    },
    renderResult(result, options, theme, context) {
      return renderCuratedResult(result, options, theme, context);
    },
    toMcpToolName: () => "webReader",
    toMcpArgs: (params) => params,
  },
  zread: {
    name: "z_ai_zread",
    label: "Z.ai Zread",
    description:
      "Inspect public GitHub repositories through Z.AI Zread MCP. Actions: search_doc searches repo docs/issues/commits, read_file reads one repository file, get_repo_structure lists files/directories.",
    promptSnippet: "Search, read files, and inspect structure for public GitHub repositories with Z.AI Zread MCP",
    promptGuidelines: [
      "Use z_ai_zread for public GitHub repository research when local repo files are unavailable or the user asks about an external repo.",
      "For z_ai_zread, choose action=search_doc for questions, action=get_repo_structure for navigation, and action=read_file only when you know the file_path.",
    ],
    parameters: ZREAD_SCHEMA,
    renderCall(args, theme) {
      const target = args.action === "read_file" ? `${args.repo_name}/${args.file_path}` : args.repo_name;
      return renderToolCall("z_ai_zread", `${args.action} ${target}`, theme);
    },
    renderResult(result, options, theme, context) {
      return renderCuratedResult(result, options, theme, context);
    },
    toMcpToolName: (params) => params.action as string,
    toMcpArgs: zreadArgs,
  },
  vision: {
    name: "z_ai_vision",
    label: "Z.ai Vision",
    description:
      "Analyze images and videos through Z.AI Vision MCP. Actions cover UI-to-code/spec/prompt/description, screenshot OCR, error diagnosis, technical diagrams, charts/dashboards, UI diff checks, general image analysis, and video analysis.",
    promptSnippet: "Analyze images/videos with Z.AI Vision MCP using action-specific arguments for UI, OCR, errors, diagrams, charts, diffs, images, and video",
    promptGuidelines: [
      "Use z_ai_vision only when the visual input is available as a local path or remote URL; for most clients, pasted images are not enough for MCP vision.",
      "For z_ai_vision, choose the most specific action; use analyze_image only when no specialized action fits.",
      "For z_ai_vision action=ui_diff_check, provide expected_image_source and actual_image_source; for action=analyze_video, provide video_source.",
    ],
    parameters: VISION_SCHEMA,
    renderCall(args, theme) {
      const source = args.video_source ?? args.image_source ?? args.expected_image_source ?? "";
      return renderToolCall("z_ai_vision", `${args.action} ${source}`, theme);
    },
    renderResult(result, options, theme, context) {
      return renderCuratedResult(result, options, theme, context);
    },
    toMcpToolName: (params) => params.action as string,
    toMcpArgs: visionArgs,
  },
} satisfies Record<ServerId, CuratedToolConfig>;

function registerCuratedTool(pi: ExtensionAPI, server: ManagedServer, config: CuratedToolConfig) {
  pi.registerTool<any>({
    name: config.name,
    label: config.label,
    description: config.description,
    promptSnippet: config.promptSnippet,
    promptGuidelines: config.promptGuidelines,
    parameters: config.parameters,
    renderCall: config.renderCall,
    renderResult: config.renderResult,
    async execute(_toolCallId, params, signal, onUpdate) {
      return executeCuratedTool(server, config.toMcpToolName(params), config.toMcpArgs(params), signal, onUpdate);
    },
  });
}

async function closeServers(servers: ManagedServer[]) {
  await Promise.allSettled(
    servers.map(async (server) => {
      if (server.transport instanceof StreamableHTTPClientTransport) {
        await server.transport.terminateSession().catch(() => undefined);
      }
      await server.transport?.close().catch(() => undefined);
      server.client = undefined;
      server.transport = undefined;
      server.connectPromise = undefined;
    }),
  );
}

function serverStatus(servers: ManagedServer[]) {
  return servers.map((server) => {
    const connected = Boolean(server.client);
    return {
      id: server.id,
      label: server.label,
      kind: server.kind,
      toolRegistered: true,
      connected,
      connectionStatus: connected ? "connected" : "lazy_not_connected_until_first_use",
      lastError: server.lastError,
    };
  });
}

function registerConfiguredTools(pi: ExtensionAPI, servers: ManagedServer[]) {
  for (const server of servers) {
    const config = REGISTRARS[server.id];
    if (config) registerCuratedTool(pi, server, config);
  }
}

export const __test = { createServers, getApiKey, hasApiKeySource, searchArgs, serverStatus, truncateForTool, visionArgs };

export default function zaiMcpExtension(pi: ExtensionAPI) {
  const servers = createServers();

  if (servers.length === 0) {
    console.warn(`[${EXTENSION_NAME}] no Z.AI MCP servers enabled; no tools registered.`);
  }

  registerConfiguredTools(pi, servers);

  pi.registerCommand("zai-mcp-status", {
    description: "Show configured Z.ai MCP servers and connection status",
    handler: async (_args, ctx) => {
      const status = JSON.stringify(serverStatus(servers), null, 2);
      if (ctx.hasUI) {
        ctx.ui.notify(status, "info");
      } else {
        const stream = ctx.mode === "print" ? process.stdout : process.stderr;
        stream.write(`${status}\n`);
      }
    },
  });

  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    const failed = servers.filter((server) => server.lastError);
    if (failed.length > 0 && ctx.hasUI) {
      ctx.ui.notify(
        `Z.ai MCP loaded with ${failed.length} error(s). Use /zai-mcp-status for details.`,
        "warning",
      );
    }
  });

  pi.on("session_shutdown", async () => {
    await closeServers(servers);
  });

  if (!hasApiKeySource()) {
    console.warn(
      `[${EXTENSION_NAME}] No Z.ai API key found. Set Z_AI_API_KEY/ZAI_API_KEY, ` +
        `or run pi /login for the zai provider so ${join(getAgentDir(), "auth.json")} contains a zai API key. ` +
        `Z.ai MCP tools will fail until configured.`,
    );
  }
}
