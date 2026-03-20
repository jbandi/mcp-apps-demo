export interface CartLineRow {
  lineId: string;
  articleNumber: string;
  quantity: number;
  description: string;
  brand: string | null;
  unitText: string;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string;
}

export interface CartOverview {
  userName: string;
  lines: CartLineRow[];
  lineCount: number;
  subtotalChf: number;
}

export function formatChf(value: number): string {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(value);
}

export function extractTextFromContentBlock(block: { text?: unknown }): string | null {
  const t = block.text;
  if (typeof t === "string") return t;
  if (t && typeof t === "object" && "text" in t) {
    const nested = (t as { text?: unknown }).text;
    return typeof nested === "string" ? nested : null;
  }
  return null;
}

function isCartLineRow(value: unknown): value is CartLineRow {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.lineId === "string" &&
    typeof o.articleNumber === "string" &&
    typeof o.quantity === "number" &&
    typeof o.description === "string" &&
    (o.brand === null || typeof o.brand === "string") &&
    typeof o.unitText === "string" &&
    typeof o.unitPrice === "number" &&
    typeof o.lineTotal === "number" &&
    typeof o.imageUrl === "string"
  );
}

function isCartOverview(value: unknown): value is CartOverview {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (
    typeof o.userName !== "string" ||
    typeof o.lineCount !== "number" ||
    typeof o.subtotalChf !== "number" ||
    !Array.isArray(o.lines)
  ) {
    return false;
  }
  return o.lines.every(isCartLineRow);
}

function parseCartOverviewFromText(raw: string): CartOverview | null {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/m.exec(s);
  if (fence) s = fence[1].trim();
  try {
    const parsed = JSON.parse(s) as unknown;
    return isCartOverview(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getCartOverviewFromToolResult(result: {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content?: Array<{ type: string; text?: unknown }>;
}): CartOverview | null {
  if (result.isError) return null;
  const sc = result.structuredContent;
  if (sc && isCartOverview(sc)) return sc;

  const textBlocks = result.content?.filter((c) => c.type === "text") ?? [];
  for (const block of textBlocks) {
    const raw = extractTextFromContentBlock(block);
    if (raw) {
      const parsed = parseCartOverviewFromText(raw);
      if (parsed) return parsed;
    }
  }
  return null;
}
