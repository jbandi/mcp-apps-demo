import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

/**
 * Vite legt die Bundles nach `dist/webshop/*.html` (Projektroot).
 * - `tsx`/Quelle: diese Datei liegt in `webshop/` → `../dist/webshop`
 * - `tsc`-Ausgabe: oft `dist/webshop/server.js` → Bundles liegen bereits in `import.meta.dirname`
 */
function webshopUiDistDir(): string {
  const dir = import.meta.dirname;
  const asPosix = dir.split(path.sep).join("/");
  if (asPosix.endsWith("/dist/webshop") || asPosix.endsWith("dist/webshop")) {
    return dir;
  }
  return path.resolve(dir, "..", "dist", "webshop");
}

const WEBSHOP_UI_DIST = webshopUiDistDir();

const uiResourceMeta = {
  connectDomains: ["https://web.transgourmet.ch"],
  resourceDomains: [
    "https://web.transgourmet.ch",
    "https://webshop.transgourmet.ch",
    "https://webpreview.transgourmet.ch",
  ],
} as const;

const SEARCH_URL = "https://web.transgourmet.ch/de/webshop/resources/articles/search";
const USER_AGENT = "MCP-Webshop-App (Demo)";
const MAX_PRODUCT_RESULTS = 10;

/** Damit Hosts (z. B. ChatGPT) strukturierte Tool-Ausgaben an die MCP-App hängen können; `content` bleibt fürs Modell. */
const webShopSearchOutputSchema = z.object({
  searchTerm: z.string(),
  products: z.array(z.unknown()),
});

const cartLinePublicSchema = z.object({
  lineId: z.string(),
  articleNumber: z.string(),
  quantity: z.number(),
  description: z.string(),
  brand: z.string().nullable(),
  unitText: z.string(),
  unitPrice: z.number(),
  lineTotal: z.number(),
  imageUrl: z.string(),
});

const webShopCartAddOutputSchema = z.object({
  userName: z.string(),
  lines: z.array(cartLinePublicSchema),
  added: z.array(
    z.object({
      lineId: z.string(),
      articleNumber: z.string(),
      quantity: z.number(),
    }),
  ),
  lineCount: z.number(),
  subtotalChf: z.number(),
});

const webShopCartRemoveOutputSchema = z.object({
  userName: z.string(),
  lines: z.array(cartLinePublicSchema),
  removedLineIds: z.array(z.string()),
  lineCount: z.number(),
  subtotalChf: z.number(),
});

const webShopCartGetOutputSchema = z.object({
  userName: z.string(),
  lines: z.array(cartLinePublicSchema),
  lineCount: z.number(),
  subtotalChf: z.number(),
});

const webShopCartFinalizeOutputSchema = z.object({
  userName: z.string(),
  orderId: z.string(),
  finalizedAt: z.string(),
  lines: z.array(cartLinePublicSchema),
  subtotalChf: z.number(),
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

interface ApiArticleDetailPayload {
  article?: ApiArticle;
}

/** Eine Warenkorbzeile; gleicher Artikel kann mehrfach vorkommen (mehrere Positionen). */
interface CartLine {
  lineId: string;
  articleNumber: string;
  quantity: number;
  snapshot: CartLineSnapshot;
}

interface CartLineSnapshot {
  description: string;
  brand: string | null;
  unitText: string;
  unitPrice: number;
  imageUrl: string;
}

/** In-memory Warenkörbe, Schlüssel = Benutzername (getrimmt). */
const shoppingCarts = new Map<string, CartLine[]>();

function normalizeUserName(userName: string): string {
  return userName.trim();
}

function getOrCreateCartLines(userName: string): CartLine[] {
  const key = normalizeUserName(userName);
  if (!key) {
    throw new Error("Benutzername darf nicht leer sein.");
  }
  let lines = shoppingCarts.get(key);
  if (!lines) {
    lines = [];
    shoppingCarts.set(key, lines);
  }
  return lines;
}

function newLineId(): string {
  return `ln_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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
        return `${WEB_ORIGIN}${u.pathname}${u.search}${u.hash}`;
      }
    } catch {
      /* use fallback below */
    }
    return imgSrc;
  }
  const p = imgSrc.startsWith("/") ? imgSrc : `/${imgSrc}`;
  return `${WEB_ORIGIN}${p}`;
}


/** Obergrenze für SVG-Grösse pro Icon beim Einbetten für MCP-Iframes (verhindert riesige Payloads). */
const MAX_INLINE_SVG_BYTES = 256 * 1024;
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

function roundChf(value: number): number {
  return Math.round(value * 100) / 100;
}

function effectiveUnitPrice(a: ApiArticle): number {
  return a.isAction && a.actionPrice != null ? a.actionPrice : a.price;
}

function snapshotFromArticle(a: ApiArticle): CartLineSnapshot {
  return {
    description: a.description,
    brand: a.brand ?? null,
    unitText: a.unitText,
    unitPrice: roundChf(effectiveUnitPrice(a)),
    imageUrl: productImageUrl(a.celumId),
  };
}

function cartLineToPublic(line: CartLine) {
  const { snapshot } = line;
  const lineTotal = roundChf(snapshot.unitPrice * line.quantity);
  return {
    lineId: line.lineId,
    articleNumber: line.articleNumber,
    quantity: line.quantity,
    description: snapshot.description,
    brand: snapshot.brand,
    unitText: snapshot.unitText,
    unitPrice: snapshot.unitPrice,
    lineTotal,
    imageUrl: snapshot.imageUrl,
  };
}

function cartSubtotal(lines: CartLine[]): number {
  return roundChf(lines.reduce((sum, l) => sum + l.snapshot.unitPrice * l.quantity, 0));
}

async function fetchArticleDetail(articleNumber: string): Promise<ApiArticle> {
  const num = articleNumber.trim();
  if (!num) {
    throw new Error("Artikelnummer fehlt.");
  }
  const url = new URL(`/de/webshop/resources/articles/${encodeURIComponent(num)}/detail`, WEB_ORIGIN);
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`Artikel-Detail fehlgeschlagen (${res.status}): ${num}`);
  }
  const data = (await res.json()) as ApiArticleDetailPayload;
  if (!data.article) {
    throw new Error(`Artikel nicht gefunden: ${num}`);
  }
  return data.article;
}

function getCartOverviewPayload(userName: string): z.infer<typeof webShopCartGetOutputSchema> {
  const key = normalizeUserName(userName);
  const lines = shoppingCarts.get(key) ?? [];
  return {
    userName: key,
    lines: lines.map(cartLineToPublic),
    lineCount: lines.length,
    subtotalChf: cartSubtotal(lines),
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
  const mainResourceUri = "ui://web-shop/web-shop-mcp-app.html";
  const cartResourceUri = "ui://web-shop/web-shop-cart-mcp-app.html";

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
      _meta: { ui: { resourceUri: mainResourceUri } },
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

  registerAppTool(
    server,
    "web-shop-cart-add",
    {
      title: "Webshop: Artikel in den Warenkorb",
      description:
        "Legt eine oder mehrere Positionen in den Warenkorb des angegebenen Benutzers. Pro Eintrag entsteht eine eigene Zeile (gleiche Artikelnummer kann mehrfach vorkommen). Artikelstammdaten werden per Detail-API geladen.",
      inputSchema: {
        userName: z.string().min(1).describe("Benutzername; pro Name existiert ein eigener Warenkorb."),
        items: z
          .array(
            z.object({
              articleNumber: z.string().min(1).describe("Artikelnummer aus der Suche."),
              quantity: z
                .number()
                .int()
                .positive()
                .describe("Anzahl Verkaufseinheiten (z. B. Tray/Pack) für diese Position."),
            }),
          )
          .min(1)
          .describe("Liste von Positionen; jede Position wird als eigene Warenkorbzeile hinzugefügt."),
      },
      outputSchema: webShopCartAddOutputSchema,
      _meta: { ui: { resourceUri: mainResourceUri } },
    },
    async ({ userName, items }) => {
      const lines = getOrCreateCartLines(userName);
      const key = normalizeUserName(userName);
      const added: { lineId: string; articleNumber: string; quantity: number }[] = [];

      for (const item of items) {
        const article = await fetchArticleDetail(item.articleNumber);
        const line: CartLine = {
          lineId: newLineId(),
          articleNumber: article.articleNumber,
          quantity: item.quantity,
          snapshot: snapshotFromArticle(article),
        };
        lines.push(line);
        added.push({
          lineId: line.lineId,
          articleNumber: line.articleNumber,
          quantity: line.quantity,
        });
      }

      const overview = getCartOverviewPayload(key);
      return {
        structuredContent: {
          ...overview,
          added,
        },
        content: [{ type: "text", text: JSON.stringify({ ...overview, added }) }],
      };
    },
  );

  registerAppTool(
    server,
    "web-shop-cart-remove",
    {
      title: "Webshop: Position aus Warenkorb entfernen",
      description:
        "Entfernt Warenkorbzeilen: entweder eine konkrete Zeile per lineId (von web-shop-cart-get) oder alle Zeilen zu einer Artikelnummer.",
      inputSchema: {
        userName: z.string().min(1),
        lineId: z.string().min(1).optional().describe("Eine bestimmte Zeile entfernen."),
        articleNumber: z
          .string()
          .min(1)
          .optional()
          .describe("Alle Zeilen mit dieser Artikelnummer entfernen."),
      },
      outputSchema: webShopCartRemoveOutputSchema,
      _meta: { ui: { resourceUri: mainResourceUri } },
    },
    async ({ userName, lineId, articleNumber }) => {
      const hasLine = Boolean(lineId);
      const hasArt = Boolean(articleNumber);
      if (hasLine === hasArt) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Genau eines angeben: lineId (eine Zeile) oder articleNumber (alle Zeilen zu diesem Artikel).",
            },
          ],
        };
      }

      const key = normalizeUserName(userName);
      const lines = shoppingCarts.get(key);
      const removedLineIds: string[] = [];

      if (lines?.length) {
        if (lineId) {
          const idx = lines.findIndex((l) => l.lineId === lineId);
          if (idx >= 0) {
            removedLineIds.push(lines[idx]!.lineId);
            lines.splice(idx, 1);
          }
        } else if (articleNumber) {
          const num = articleNumber.trim();
          for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i]!.articleNumber === num) {
              removedLineIds.push(lines[i]!.lineId);
              lines.splice(i, 1);
            }
          }
        }
        if (lines.length === 0) {
          shoppingCarts.delete(key);
        }
      }

      const overview = getCartOverviewPayload(key);
      return {
        structuredContent: {
          ...overview,
          removedLineIds,
        },
        content: [{ type: "text", text: JSON.stringify({ ...overview, removedLineIds }) }],
      };
    },
  );

  registerAppTool(
    server,
    "web-shop-cart-get",
    {
      title: "Webshop: Warenkorb anzeigen",
      description:
        "Liefert alle Positionen, Mengen und Summen für den Warenkorb des Benutzers (Demo, im Speicher des MCP-Servers). Öffnet eine eigene Warenkorb-Oberfläche (nicht die Produktsuche).",
      inputSchema: {
        userName: z.string().min(1).describe("Benutzername dessen Warenkorb angezeigt werden soll."),
      },
      outputSchema: webShopCartGetOutputSchema,
      _meta: { ui: { resourceUri: cartResourceUri } },
    },
    async ({ userName }) => {
      const overview = getCartOverviewPayload(userName);
      return {
        structuredContent: overview,
        content: [{ type: "text", text: JSON.stringify(overview) }],
      };
    },
  );

  registerAppTool(
    server,
    "web-shop-cart-finalize",
    {
      title: "Webshop: Bestellung abschliessen (Mock)",
      description:
        "Schliesst den Warenkorb mock-mässig ab: generiert eine Bestellreferenz, gibt die Positionen zurück und leert den Warenkorb. Kein echter Auftrag bei Transgourmet.",
      inputSchema: {
        userName: z.string().min(1),
      },
      outputSchema: webShopCartFinalizeOutputSchema,
      _meta: { ui: { resourceUri: mainResourceUri } },
    },
    async ({ userName }) => {
      const key = normalizeUserName(userName);
      const lines = shoppingCarts.get(key);
      if (!lines?.length) {
        return {
          isError: true,
          content: [{ type: "text", text: "Warenkorb ist leer; nichts abzuschliessen." }],
        };
      }

      const publicLines = lines.map(cartLineToPublic);
      const subtotalChf = cartSubtotal(lines);
      const orderId = `MOCK-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const finalizedAt = new Date().toISOString();
      shoppingCarts.delete(key);

      const payload = {
        userName: key,
        orderId,
        finalizedAt,
        lines: publicLines,
        subtotalChf,
      };
      return {
        structuredContent: payload,
        content: [{ type: "text", text: JSON.stringify(payload) }],
      };
    },
  );

  registerAppResource(
    server,
    mainResourceUri,
    mainResourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(path.join(WEBSHOP_UI_DIST, "search-ui.html"), "utf-8");
      return {
        contents: [
          {
            uri: mainResourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: {
              ui: uiResourceMeta,
            },
          },
        ],
      };
    },
  );

  registerAppResource(
    server,
    cartResourceUri,
    cartResourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(path.join(WEBSHOP_UI_DIST, "cart-ui.html"), "utf-8");
      return {
        contents: [
          {
            uri: cartResourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: {
              ui: uiResourceMeta,
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
