import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname;

export function registerColorPickerTools(server: McpServer): void {
  const resourceUri = "ui://color-picker/mcp-app.html";

  registerAppTool(server,
    "color-picker",
    {
      title: "Color Picker",
      description: "Opens an interactive color picker. The user can select a color and send it back to the conversation.",
      inputSchema: {},
      _meta: { ui: { resourceUri } },
    },
    async () => {
      return {
        content: [{ type: "text", text: "Opening color picker UI..." }],
      };
    },
  );

  registerAppResource(server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(path.join(DIST_DIR, "mcp-app.html"), "utf-8");
      return {
        contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }],
      };
    },
  );
}

export function createColorPickerMcpServer(): McpServer {
  const server = new McpServer({
    name: "Color Picker MCP App",
    version: "1.0.0",
  });
  registerColorPickerTools(server);
  return server;
}
