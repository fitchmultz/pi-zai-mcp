import type { ZaiExtensionAPI as ExtensionAPI } from "../src/register-tool.ts";
import { registerZaiMcpServers } from "../src/index.ts";

export default function zaiMcpReader(pi: ExtensionAPI): void {
  registerZaiMcpServers(pi, ["reader"]);
}
