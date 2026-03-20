import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname;

const SEARCH_URL = "https://web.transgourmet.ch/de/webshop/resources/articles/search";
const USER_AGENT = "MCP-Webshop-App (Demo)";
const MAX_PRODUCT_RESULTS = 10;

/** Damit Hosts (z. B. ChatGPT) strukturierte Tool-Ausgaben an die MCP-App hängen können; `content` bleibt fürs Modell. */
const webShopSearchOutputSchema = z.object({
  searchTerm: z.string(),
  products: z.array(z.unknown()),
});

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

const WEB_ORIGIN = "https://web.transgourmet.ch";
const WEBPREVIEW_ORIGIN = "https://webpreview.transgourmet.ch";

/** Obergrenze für SVG-Grösse pro Icon beim Einbetten für MCP-Iframes (verhindert riesige Payloads). */
const MAX_INLINE_SVG_BYTES = 256 * 1024;

function resolveMediaUrl(imgSrc: string): string {
  if (imgSrc.startsWith("http://") || imgSrc.startsWith("https://")) {
    return imgSrc;
  }
  const p = imgSrc.startsWith("/") ? imgSrc : `/${imgSrc}`;
  return `${WEB_ORIGIN}${p}`;
}

function isEcoscoreIcon(icon: ApiIcon): boolean {
  return (
    icon.id.toLowerCase().startsWith("ecoscore") || icon.imgSrc.toLowerCase().includes("/ecoscore/")
  );
}

function resolveIconImgUrl(icon: ApiIcon): string {
  if (!isEcoscoreIcon(icon)) {
    return resolveMediaUrl(icon.imgSrc);
  }
  const { imgSrc } = icon;
  if (imgSrc.startsWith("http://") || imgSrc.startsWith("https://")) {
    try {
      const u = new URL(imgSrc);
      if (u.hostname.includes("transgourmet.ch")) {
        return `${WEBPREVIEW_ORIGIN}${u.pathname}${u.search}${u.hash}`;
      }
    } catch {
      /* use fallback below */
    }
    return imgSrc;
  }
  const p = imgSrc.startsWith("/") ? imgSrc : `/${imgSrc}`;
  return `${WEBPREVIEW_ORIGIN}${p}`;
}

/**
 * ChatGPT und andere MCP-Hosts laufen in einem abgeschotteten Iframe. Cross-Origin-SVGs in <img>
 * schlagen oft fehl (strenges img-src und/oder CORP), obwohl dieselbe URL im normalen Tab funktioniert.
 * Serverseitiges Abrufen und data:-URL vermeidet die Cross-Origin-Bildanfrage im Iframe.
 */
async function svgUrlToDataUrlIfApplicable(imgUrl: string): Promise<string> {
  if (!/\.svg(?:[?#]|$)/i.test(imgUrl)) return imgUrl;
  try {
    const res = await fetch(imgUrl, {
      headers: {
        Accept: "image/svg+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": USER_AGENT,
      },
    });
    if (!res.ok) return imgUrl;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_INLINE_SVG_BYTES) return imgUrl;
    return `data:image/svg+xml;base64,${buf.toString("base64")}`;
  } catch {
    return imgUrl;
  }
}

async function inlineSvgIconsInProducts(products: ProductCard[]): Promise<ProductCard[]> {
  return Promise.all(
    products.map(async (p) => ({
      ...p,
      icons: await Promise.all(
        p.icons.map(async (icon) => ({
          ...icon,
          imgUrl: await svgUrlToDataUrlIfApplicable(icon.imgUrl),
        })),
      ),
    })),
  );
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
    icons: (a.icons ?? []).map((i) => ({ title: i.title, imgUrl: resolveIconImgUrl(i) })),
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
    throw new Error(`Suche fehlgeschlagen: ${res.status}`);
  }
  const data = (await res.json()) as ApiSearchPayload;
  const raw = (data.searchResponse?.articles ?? []).slice(0, MAX_PRODUCT_RESULTS);
  const products = await inlineSvgIconsInProducts(raw.map(mapArticle));
  return {
    searchTerm: searchTerm.trim(),
    products,
  };
}

function registerWebShopTools(server: McpServer): void {
  const resourceUri = "ui://web-shop/web-shop-mcp-app.html";

  registerAppTool(
    server,
    "web-shop-search",
    {
      title: "Transgourmet-Webshopsuche",
      description:
        "Durchsucht den Transgourmet-Webshop (Schweiz) nach Artikeln per Stichwort. Öffnet ein interaktives Produktraster; die Ergebnisse werden zusätzlich als strukturiertes JSON für die Unterhaltung zurückgegeben.",
      inputSchema: {
        searchTerm: z
          .string()
          .min(1)
          .describe("Suchbegriff für Produkt oder Kategorie (z. B. Milch, Kaffee)."),
      },
      outputSchema: webShopSearchOutputSchema,
      _meta: { ui: { resourceUri } },
    },
    async ({ searchTerm }) => {
      const payload = await searchProducts(searchTerm);
      return {
        structuredContent: {
          searchTerm: payload.searchTerm,
          products: payload.products,
        },
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
                resourceDomains: [
                  "https://web.transgourmet.ch",
                  "https://webshop.transgourmet.ch",
                  "https://webpreview.transgourmet.ch",
                ],
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
    name: "Transgourmet-Webshop MCP-App",
    version: "1.0.0",
  });
  registerWebShopTools(server);
  return server;
}
