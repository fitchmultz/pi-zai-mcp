import type { AgentToolResult, ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type, type TSchema } from "typebox";
import type { ManagedServer } from "./servers.ts";
import { renderCuratedResult } from "./tools.ts";

export type ZaiExtensionAPI = Readonly<Pick<ExtensionAPI, "registerTool" | "registerCommand" | "on">>;
export type Registry = Readonly<Pick<ExtensionContext["modelRegistry"], "getAll" | "getProviderAuthStatus" | "getProviderAuth">>;
export type CuratedDetails = Readonly<{
  server: string;
  tool: string;
  progress?: string;
  truncated?: Readonly<{ truncated: boolean; file?: string }>;
}>;
type ToolUpdate = Readonly<{
  content: readonly Readonly<{ type: "text"; text: string }>[];
  details: CuratedDetails;
}>;
export type CuratedRequest = Readonly<{
  server: ManagedServer;
  toolName: string;
  args: Readonly<Record<string, unknown>>;
  registry: Registry;
  signal: Readonly<AbortSignal> | undefined;
  onUpdate: ((result: ToolUpdate) => void) | undefined;
}>;
type ToolArgs<T extends TSchema> = Readonly<Parameters<NonNullable<ToolDefinition<T, CuratedDetails, unknown>["renderCall"]>>[0]>;
type CuratedToolConfig<T extends TSchema> = Readonly<Pick<ToolDefinition<T, CuratedDetails, unknown>,
  "name" | "label" | "description" | "promptSnippet" | "renderCall"
>> & {
  readonly parameters: Readonly<T>;
  readonly promptGuidelines?: readonly string[];
  readonly toMcpToolName: (params: ToolArgs<T>) => string;
  readonly toMcpArgs: (params: ToolArgs<T>) => Record<string, unknown>;
};
const OUTCOME_SCHEMA = Type.Object({
  server: Type.String(), tool: Type.String(), text: Type.String(), truncated: Type.Boolean(), file: Type.Optional(Type.String()),
}, { additionalProperties: false });

export function createRegistrar<T extends TSchema>(
  config: CuratedToolConfig<T>,
  execute: (request: CuratedRequest) => Promise<AgentToolResult<CuratedDetails>>,
): (pi: ZaiExtensionAPI, owner: ManagedServer) => void {
  return (pi, owner) => {
    pi.registerTool<T, CuratedDetails, unknown>({
      name: config.name, label: config.label, description: config.description,
      promptSnippet: config.promptSnippet, promptGuidelines: config.promptGuidelines === undefined ? undefined : [...config.promptGuidelines],
      parameters: config.parameters, outputSchema: OUTCOME_SCHEMA,
      renderCall: config.renderCall, renderResult: renderCuratedResult,
      execute(_toolCallId, params, signal: Readonly<AbortSignal> | undefined, onUpdate, ctx: Readonly<{ modelRegistry: Registry }>) {
        return execute({ server: owner, toolName: config.toMcpToolName(params), args: config.toMcpArgs(params), registry: ctx.modelRegistry, signal,
          onUpdate: (result) => { onUpdate?.({ ...result, content: [...result.content] }); },
        });
      },
    });
  };
}
