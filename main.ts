import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import type { Request, Response } from "express";
import { createDadJokesMcpServer, registerDadJokesTools } from "./dad-jokes-server.js";
import { createColorPickerMcpServer, registerColorPickerTools } from "./server.js";
import { createDadJokes2McpServer } from "./dad-jokes/server.js";

function createMcpHandler(createServer: () => McpServer) {
  return async (req: Request, res: Response) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  };
}

function createCombinedMcpServer(): McpServer {
  const server = new McpServer({
    name: "Color Picker & Dad Jokes MCP App",
    version: "1.0.0",
  });
  registerColorPickerTools(server);
  registerDadJokesTools(server);
  return server;
}

async function startStreamableHTTPServer(): Promise<void> {
  const port = parseInt(process.env.PORT ?? "3001", 10);

  const app = createMcpExpressApp({ host: "0.0.0.0" });
  app.use(cors());

  app.all("/mcp", createMcpHandler(createColorPickerMcpServer));
  app.all("/mcp/colorpicker", createMcpHandler(createColorPickerMcpServer));
  app.all("/mcp/dadjokes", createMcpHandler(createDadJokesMcpServer));
  app.all("/mcp/dadjokes2", createMcpHandler(createDadJokes2McpServer));

  const httpServer = app.listen(port, (err) => {
    if (err) {
      console.error("Failed to start server:", err);
      process.exit(1);
    }
    console.log(`MCP server listening on http://localhost:${port}/mcp (colorpicker, dadjokes)`);
  });

  let isShuttingDown = false;

  const shutdown = () => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    console.log("Shutting down server...");
    const forceCloseTimer = setTimeout(() => {
      console.warn("Forcing shutdown of open HTTP connections...");
      httpServer.closeAllConnections?.();
      process.exit(0);
    }, 1000);

    httpServer.close(() => {
      clearTimeout(forceCloseTimer);
      console.log("Server shut down");
      process.exit(0);
    });

    httpServer.closeIdleConnections?.();
    httpServer.closeAllConnections?.();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function startStdioServer(createServer: () => McpServer): Promise<void> {
  await createServer().connect(new StdioServerTransport());
}

async function main() {
  if (process.argv.includes("--stdio")) {
    await startStdioServer(createCombinedMcpServer);
  } else {
    await startStreamableHTTPServer();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
