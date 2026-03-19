import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname;

const SEARCH_URL = "https://web.transgourmet.ch/de/webshop/resources/articles/search";
const USER_AGENT = "MCP Web Shop App (demo)";
const MAX_PRODUCT_RESULTS = 10;

interface ApiIcon {
  id: string;
  imgSrc: string;
  title: string;
}

interface ApiEcoScore {
  id: number;
  text: string;
}

interface ApiArticle {
  articleNumber: string;
  description: string;
  brand?: string | null;
  unitText: string;
  price: number;
  oldPrice: number;
  isAction: boolean;
  actionPrice: number | null;
  normalPrice: number;
  showAction: boolean;
  celumId: number;
  ecoScore: ApiEcoScore | null;
  icons: ApiIcon[];
  sellAmount: number;
  sellUnit: string | null;
  pricePerSellUnit: number;
  hasComparisonPrice: boolean;
  comparisonPrice: number | null;
  comparisonPriceUnitText: string;
  comparisonPriceUnit: number;
  showCurrentlyNotAvailableMessage?: boolean;
}

interface ApiSearchPayload {
  searchResponse?: { articles?: ApiArticle[] };
}

interface ProductCard {
  articleNumber: string;
  description: string;
  brand: string | null;
  unitText: string;
  price: number;
  oldPrice: number;
  isAction: boolean;
  actionPrice: number | null;
  normalPrice: number;
  imageUrl: string;
  ecoScore: ApiEcoScore | null;
  icons: { title: string; imgUrl: string }[];
  packLabel: string;
  pricePerPackLabel: string;
  comparisonLabel: string | null;
  unavailable: boolean;
}

function resolveMediaUrl(imgSrc: string): string {
  if (imgSrc.startsWith("http://") || imgSrc.startsWith("https://")) {
    return imgSrc;
  }
  const p = imgSrc.startsWith("/") ? imgSrc : `/${imgSrc}`;
  return `https://web.transgourmet.ch${p}`;
}

function productImageUrl(celumId: number): string {
  return `https://webshop.transgourmet.ch/shop/productimages/article/${celumId}.jpg`;
}

function mapArticle(a: ApiArticle): ProductCard {
  const packParts = [a.sellAmount > 0 ? String(a.sellAmount) : null, a.sellUnit, a.unitText].filter(Boolean);
  const packLabel = packParts.join(" · ") || a.unitText;

  const pricePerPack =
    typeof a.pricePerSellUnit === "number" && !Number.isNaN(a.pricePerSellUnit)
      ? new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(a.pricePerSellUnit)
      : "";

  let comparisonLabel: string | null = null;
  if (a.hasComparisonPrice && a.comparisonPrice != null) {
    const cp = new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(
      a.comparisonPrice,
    );
    comparisonLabel = `${cp} / ${a.comparisonPriceUnit} ${a.comparisonPriceUnitText}`;
  }

  return {
    articleNumber: a.articleNumber,
    description: a.description,
    brand: a.brand ?? null,
    unitText: a.unitText,
    price: a.price,
    oldPrice: a.oldPrice,
    isAction: a.isAction,
    actionPrice: a.actionPrice,
    normalPrice: a.normalPrice,
    imageUrl: productImageUrl(a.celumId),
    ecoScore: a.ecoScore,
    icons: (a.icons ?? []).map((i) => ({ title: i.title, imgUrl: resolveMediaUrl(i.imgSrc) })),
    packLabel,
    pricePerPackLabel: pricePerPack ? `Pack: ${pricePerPack}` : "",
    comparisonLabel,
    unavailable: Boolean(a.showCurrentlyNotAvailableMessage),
  };
}

async function searchProducts(searchTerm: string): Promise<{ searchTerm: string; products: ProductCard[] }> {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("searchTerm", searchTerm.trim());
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`Search failed: ${res.status}`);
  }
  const data = (await res.json()) as ApiSearchPayload;
  const raw = (data.searchResponse?.articles ?? []).slice(0, MAX_PRODUCT_RESULTS);
  return {
    searchTerm: searchTerm.trim(),
    products: raw.map(mapArticle),
  };
}

function registerWebShopTools(server: McpServer): void {
  const resourceUri = "ui://web-shop/web-shop-mcp-app.html";

  registerAppTool(
    server,
    "web-shop-search",
    {
      title: "Transgourmet Web Shop Search",
      description:
        "Searches the Transgourmet Switzerland web shop for articles by keyword. Opens an interactive product grid; results are also returned as structured JSON for the conversation.",
      inputSchema: {
        searchTerm: z.string().min(1).describe("Product or category search term (e.g. milk, coffee)."),
      },
      _meta: { ui: { resourceUri } },
    },
    async ({ searchTerm }) => {
      const payload = await searchProducts(searchTerm);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(payload),
          },
        ],
      };
    },
  );

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(path.join(DIST_DIR, "app.html"), "utf-8");
      return {
        contents: [
          {
            uri: resourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: {
              ui: {
                connectDomains: ["https://web.transgourmet.ch"],
                resourceDomains: ["https://web.transgourmet.ch", "https://webshop.transgourmet.ch"],
              },
            },
          },
        ],
      };
    },
  );
}

export function createWebShopMcpServer(): McpServer {
  const server = new McpServer({
    name: "Web Shop MCP App",
    version: "1.0.0",
  });
  registerWebShopTools(server);
  return server;
}
