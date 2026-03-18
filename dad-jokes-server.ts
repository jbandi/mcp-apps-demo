import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname;

const DAD_JOKE_API = "https://icanhazdadjoke.com";
const USER_AGENT = "MCP Dad Jokes App (https://github.com/mcp-apps-dadjokes)";

interface DadJoke {
  id: string;
  joke: string;
}

interface SearchResponse {
  results: DadJoke[];
  total_jokes: number;
}

async function fetchRandomJoke(): Promise<DadJoke> {
  const res = await fetch(`${DAD_JOKE_API}/search?limit=30`, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch jokes: ${res.status}`);
  const data = (await res.json()) as SearchResponse;
  const jokes = data.results ?? [];
  if (jokes.length === 0) {
    const singleRes = await fetch(DAD_JOKE_API, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    const single = (await singleRes.json()) as DadJoke;
    return single;
  }
  return jokes[Math.floor(Math.random() * jokes.length)]!;
}

export function registerDadJokesTools(server: McpServer): void {
  const resourceUri = "ui://dad-jokes/dad-jokes-mcp-app.html";

  registerAppTool(
    server,
    "dad-joke",
    {
      title: "Dad Joke",
      description:
        "Fetches a random dad joke and opens an interactive widget. The user can view the joke and send it to the host LLM for a comment.",
      inputSchema: {},
      _meta: { ui: { resourceUri } },
    },
    async () => {
      const joke = await fetchRandomJoke();
      return {
        content: [{ type: "text", text: joke.joke }],
      };
    },
  );

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(path.join(DIST_DIR, "dad-jokes-mcp-app.html"), "utf-8");
      return {
        contents: [
          {
            uri: resourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: {
              ui: {
                csp: {
                  connectDomains: ["https://icanhazdadjoke.com"],
                },
              },
            },
          },
        ],
      };
    },
  );
}

export function createDadJokesMcpServer(): McpServer {
  const server = new McpServer({
    name: "Dad Jokes MCP App",
    version: "1.0.0",
  });
  registerDadJokesTools(server);
  return server;
}
