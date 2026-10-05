import type { ZaiExtensionAPI as ExtensionAPI } from "../src/register-tool.ts";
import { registerZaiMcpStatusCommand } from "../src/index.ts";

export default function zaiMcpStatus(pi: ExtensionAPI): void {
  registerZaiMcpStatusCommand(pi);
}
