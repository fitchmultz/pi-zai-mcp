import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead } from "@earendil-works/pi-coding-agent";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isRecord, stringValue } from "./tools.ts";

function unwrapJsonString(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('"')) { return text; }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return typeof parsed === "string" ? unwrapJsonString(parsed) : text;
  } catch { return text; }
}

function summarizeResource(resource: Readonly<Record<string, unknown>>): string {
  const label = `[Resource: ${stringValue(resource.uri, "unknown")}]`;
  return typeof resource.text === "string" ? `${label}\n${unwrapJsonString(resource.text)}` : label;
}

function summarizeContentItem(value: unknown): string {
  if (!isRecord(value)) { return stringValue(value); }
  switch (value.type) {
    case "text":
      if (typeof value.text === "string") { return unwrapJsonString(value.text); }
      break;
    case "image":
      if (typeof value.mimeType === "string") {
        return `[Image result: ${value.mimeType}, ${typeof value.data === "string" ? value.data.length : 0} base64 chars]`;
      }
      break;
    case "resource":
      if (isRecord(value.resource)) { return summarizeResource(value.resource); }
      break;
    case "resource_link":
      return `[Resource link: ${stringValue(value.name ?? value.uri, "unknown")}] ${stringValue(value.uri)}`;
    default:
      break;
  }
  return JSON.stringify(value, null, 2);
}

export function summarizeMcpResult(result: unknown): string {
  if (!isRecord(result)) { return stringValue(result); }
  const parts: string[] = [];
  if (result.isError === true) { parts.push("[MCP tool reported an error]"); }
  if (Array.isArray(result.content)) {
    for (const item of result.content) { parts.push(summarizeContentItem(item)); }
  }
  if (result.structuredContent !== undefined) {
    parts.push(`Structured content:\n${JSON.stringify(result.structuredContent, null, 2)}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : JSON.stringify(result, null, 2);
}

export async function truncateForTool(text: string): Promise<{ content: string; details: { truncated: boolean; file?: string } }> {
  const truncation = truncateHead(text, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
  if (!truncation.truncated) { return { content: truncation.content, details: { truncated: false } }; }
  const dir = await mkdtemp(join(tmpdir(), "pi-zai-mcp-"));
  await chmod(dir, 0o700);
  const file = join(dir, "output.txt");
  await writeFile(file, text, { encoding: "utf8", mode: 0o600, flag: "wx" });
  const notice = `\n\n[Z.ai MCP output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Full output saved to: ${file}]`;
  return { content: truncation.content + notice, details: { truncated: true, file } };
}
