import {
  highlightCode,
  keyHint,
  type Theme,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { TSchema } from "typebox";

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function stringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  return value === undefined || value === null ? fallback : JSON.stringify(value);
}

type TextResult = Readonly<{
  content?: readonly Readonly<{ type: string; text?: string }>[];
  details?: unknown;
}>;
type ResultTheme = Readonly<Pick<Theme, "fg">>;

function firstTextContent(result: TextResult): string {
  return result.content?.find((item) => item.type === "text")?.text ?? "";
}

function displayText(raw: string): { text: string; language?: string } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { text: raw };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === "string") {
      return displayText(parsed);
    }
    return { text: JSON.stringify(parsed, null, 2), language: "json" };
  } catch {
    return {
      text: raw,
      language: trimmed.startsWith("{") || trimmed.startsWith("[") ? "json" : undefined,
    };
  }
}

function limitedLines(text: string, maxLines: number): { text: string; omittedLines: number } {
  const lines = text.split("\n");
  const shown = lines.slice(0, maxLines);
  return { text: shown.join("\n"), omittedLines: Math.max(0, lines.length - shown.length) };
}

export function compactInline(value: string, maxLength = 120): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function resultDetails(value: unknown): Readonly<{
  server?: string;
  tool?: string;
  progress?: string;
  truncated: boolean;
  file?: string;
}> {
  const raw = isRecord(value) ? value : {};
  const truncation = isRecord(raw.truncated) ? raw.truncated : {};
  return {
    server: typeof raw.server === "string" ? raw.server : undefined,
    tool: typeof raw.tool === "string" ? raw.tool : undefined,
    progress: typeof raw.progress === "string" ? raw.progress : undefined,
    truncated: truncation.truncated === true,
    file: typeof truncation.file === "string" ? truncation.file : undefined,
  };
}

type RenderDetails = ReturnType<typeof resultDetails>;

function renderProgress(
  result: TextResult,
  details: RenderDetails,
  args: unknown,
): { target: string; message: string } {
  const progress = firstTextContent(result);
  const message =
    progress.length > 0 ? progress : (details.progress ?? "Starting Z.AI MCP call...");
  const hasTarget = details.server !== undefined || details.tool !== undefined;
  const target = hasTarget
    ? `${details.server ?? "z_ai"}/${details.tool ?? "tool"}`
    : stringValue(isRecord(args) ? args.action : undefined, "Z.AI MCP");
  return { target, message };
}

function renderFooter(details: RenderDetails, omittedLines: number, theme: ResultTheme): string {
  let footer = "";
  if (omittedLines > 0) {
    footer += `\n${theme.fg("muted", `… ${omittedLines} more lines omitted from TUI view`)}`;
  }
  if (details.file !== undefined) {
    footer += `\n${theme.fg("muted", `Full agent-context output: ${details.file}`)}`;
  }
  return footer;
}

function resultHeader(details: RenderDetails, failed: boolean, theme: ResultTheme): string {
  let status = theme.fg("success", "done");
  if (failed) {
    status = theme.fg("error", "failed");
  } else if (details.truncated) {
    status = theme.fg("warning", "truncated for agent context");
  }
  return `${status} ${theme.fg("dim", `${details.server ?? "z_ai"}/${details.tool ?? "tool"}`)}`;
}

export function renderCuratedResult(
  result: TextResult,
  options: Readonly<{ expanded?: boolean; isPartial?: boolean }>,
  theme: ResultTheme,
  context?: Readonly<
    Pick<
      Parameters<NonNullable<ToolDefinition<TSchema, unknown, unknown>["renderResult"]>>[3],
      "args" | "isError"
    >
  >,
): Text {
  const details = resultDetails(result.details);
  if (options.isPartial === true) {
    const { target, message } = renderProgress(result, details, context?.args);
    return new Text(
      `${theme.fg("warning", "running")} ${theme.fg("dim", target)}\n${theme.fg("toolOutput", message)}`,
      0,
      0,
    );
  }
  return renderFinishedResult(result, details, {
    expanded: options.expanded === true,
    failed: context?.isError === true,
    theme,
  });
}

function renderFinishedResult(
  result: TextResult,
  details: RenderDetails,
  view: Readonly<{ expanded: boolean; failed: boolean; theme: ResultTheme }>,
): Text {
  const { expanded, failed, theme } = view;
  const { text, language } = displayText(firstTextContent(result));
  const lineLimit = expanded ? 80 : 8;
  const byteLimit = expanded ? 24_000 : 4_000;
  const byteLimited = text.slice(0, byteLimit);
  const byteNotice =
    text.length > byteLimit
      ? `\n… ${text.length - byteLimit} more characters omitted from TUI view`
      : "";
  const limited = limitedLines(byteLimited + byteNotice, lineLimit);
  const body =
    language !== undefined
      ? highlightCode(limited.text, language).join("\n")
      : theme.fg("toolOutput", limited.text);
  let header = resultHeader(details, failed, theme);
  if (!expanded && (limited.omittedLines > 0 || text.length > byteLimit)) {
    header += ` ${theme.fg("muted", `(${keyHint("app.tools.expand", "for more")})`)}`;
  }
  const footer = renderFooter(details, limited.omittedLines, theme);
  return new Text(`${header}\n${body}${footer}`, 0, 0);
}

type ActionArgSpec = Readonly<{ required: readonly string[]; picks: readonly string[] }>;
const ZREAD_ACTION_ARGS: Readonly<Record<string, ActionArgSpec>> = {
  search_doc: { required: ["query"], picks: ["repo_name", "query", "language"] },
  read_file: { required: ["file_path"], picks: ["repo_name", "file_path"] },
  get_repo_structure: { required: [], picks: ["repo_name", "dir_path"] },
};
const VISION_ACTION_ARGS: Readonly<Record<string, ActionArgSpec>> = {
  ui_diff_check: {
    required: ["expected_image_source", "actual_image_source"],
    picks: ["expected_image_source", "actual_image_source", "prompt"],
  },
  analyze_video: { required: ["video_source"], picks: ["video_source", "prompt"] },
  ui_to_artifact: {
    required: ["image_source", "output_type"],
    picks: ["image_source", "output_type", "prompt"],
  },
  extract_text_from_screenshot: {
    required: ["image_source"],
    picks: ["image_source", "prompt", "programming_language"],
  },
  diagnose_error_screenshot: {
    required: ["image_source"],
    picks: ["image_source", "prompt", "context"],
  },
  understand_technical_diagram: {
    required: ["image_source"],
    picks: ["image_source", "prompt", "diagram_type"],
  },
  analyze_data_visualization: {
    required: ["image_source"],
    picks: ["image_source", "prompt", "analysis_focus"],
  },
  analyze_image: { required: ["image_source"], picks: ["image_source", "prompt"] },
};
const VISION_SOURCE_KEYS = new Set([
  "image_source",
  "expected_image_source",
  "actual_image_source",
  "video_source",
]);

function requireParam(
  params: Readonly<Record<string, unknown>>,
  name: string,
  action: string,
): void {
  if (params[name] === undefined || params[name] === null || params[name] === "") {
    throw new Error(`Missing required parameter '${name}' for ${action}.`);
  }
}

function buildArgs(
  action: string,
  params: Readonly<Record<string, unknown>>,
  table: Readonly<Partial<Record<string, ActionArgSpec>>>,
): Record<string, unknown> | undefined {
  const spec = Object.hasOwn(table, action) ? table[action] : undefined;
  if (spec === undefined) {
    return undefined;
  }
  for (const key of spec.required) {
    requireParam(params, key, action);
  }
  return Object.fromEntries(spec.picks.map((key) => [key, params[key]]));
}

export function zreadArgs(params: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const action = stringValue(params.action);
  requireParam(params, "repo_name", action);
  const args = buildArgs(action, params, ZREAD_ACTION_ARGS);
  if (args !== undefined) {
    return args;
  }
  throw new Error(`Unsupported Zread action '${action}'.`);
}

export function visionArgs(params: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const action = stringValue(params.action);
  const args = buildArgs(action, params, VISION_ACTION_ARGS);
  if (args === undefined) {
    requireParam(params, "image_source", action);
    throw new Error(`Unsupported vision action '${action}'.`);
  }
  return Object.fromEntries(
    Object.entries(args).map((entry) => {
      const [key, value] = entry;
      return [
        key,
        VISION_SOURCE_KEYS.has(key) && typeof value === "string" && value.startsWith("@")
          ? value.slice(1)
          : value,
      ];
    }),
  );
}

export function searchArgs(params: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return {
    search_query: params.query,
    search_domain_filter: params.domain_filter,
    search_recency_filter: params.recency_filter,
    content_size: params.content_size ?? "high",
    location: params.location,
  };
}
