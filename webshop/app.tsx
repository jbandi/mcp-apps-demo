import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { type FormEvent, StrictMode, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import styles from "./app.module.css";

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
  ecoScore: { id: number; text: string } | null;
  icons: { title: string; imgUrl: string }[];
  packLabel: string;
  pricePerPackLabel: string;
  comparisonLabel: string | null;
  unavailable: boolean;
}

interface SearchPayload {
  searchTerm: string;
  products: ProductCard[];
}

function formatChf(value: number): string {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(value);
}

function getSearchPayloadFromToolResult(result: {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
}): SearchPayload | null {
  if (result.isError) return null;
  const textBlock = result.content?.find((c) => c.type === "text");
  const raw = textBlock?.text;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw.trim()) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "searchTerm" in parsed &&
      "products" in parsed &&
      typeof (parsed as SearchPayload).searchTerm === "string" &&
      Array.isArray((parsed as SearchPayload).products)
    ) {
      return parsed as SearchPayload;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function ProductCardView({ p }: { p: ProductCard }) {
  const displayPrice = p.isAction && p.actionPrice != null ? p.actionPrice : p.price;
  const showStrike =
    p.isAction && p.oldPrice > 0 && p.oldPrice > displayPrice;

  return (
    <article className={styles.card}>
      <div className={styles.imageWrap}>
        <img className={styles.image} src={p.imageUrl} alt="" loading="lazy" />
        <div className={styles.badges}>
          {p.isAction ? <span className={`${styles.badge} ${styles.badgeSale}`}>Aktion</span> : null}
          {p.ecoScore ? <span className={styles.badge}>{p.ecoScore.text}</span> : null}
        </div>
      </div>
      <div className={styles.body}>
        {p.brand ? <div className={styles.brand}>{p.brand}</div> : null}
        <h3 className={styles.title}>{p.description}</h3>
        <div className={styles.priceRow}>
          <span className={styles.price}>{formatChf(displayPrice)}</span>
          {showStrike ? (
            <span className={styles.oldPrice}>{formatChf(p.oldPrice)}</span>
          ) : null}
        </div>
        <div className={styles.unitMeta}>
          <span>{p.packLabel}</span>
          {p.pricePerPackLabel ? (
            <>
              <br />
              <span>{p.pricePerPackLabel}</span>
            </>
          ) : null}
          {p.comparisonLabel ? (
            <>
              <br />
              <span>{p.comparisonLabel}</span>
            </>
          ) : null}
        </div>
        {p.icons.length > 0 ? (
          <div className={styles.icons}>
            {p.icons.slice(0, 6).map((icon) => (
              <img
                key={`${p.articleNumber}-${icon.title}-${icon.imgUrl}`}
                className={styles.icon}
                src={icon.imgUrl}
                alt={icon.title}
                title={icon.title}
                loading="lazy"
              />
            ))}
          </div>
        ) : null}
        {p.unavailable ? <div className={styles.unavailable}>Derzeit nicht verfügbar</div> : null}
      </div>
    </article>
  );
}

function WebShopApp() {
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState<SearchPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const { app, error: connectError } = useApp({
    appInfo: { name: "Transgourmet Web Shop", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (a) => {
      a.onteardown = async () => ({});
      a.onerror = console.error;

      a.ontoolinput = (params) => {
        const term = params.arguments?.searchTerm;
        if (typeof term === "string" && term.trim()) {
          setQuery(term.trim());
        }
      };

      a.ontoolresult = (result) => {
        const data = getSearchPayloadFromToolResult(result);
        if (data) {
          setPayload(data);
          setQuery(data.searchTerm);
          setError(null);
        } else {
          setError("Search did not return product data.");
        }
        setLoading(false);
      };
    },
  });

  const runSearch = useCallback(
    async (term: string) => {
      if (!app || !term.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const result = await app.callServerTool({
          name: "web-shop-search",
          arguments: { searchTerm: term.trim() },
        });
        const data = getSearchPayloadFromToolResult(result);
        if (!data) {
          throw new Error("Invalid response");
        }
        setPayload(data);
      } catch (e) {
        console.error(e);
        setError("Search failed. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [app],
  );

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      void runSearch(query);
    },
    [query, runSearch],
  );

  const handleSendToLlm = useCallback(async () => {
    if (!app || !payload?.products.length) return;
    setSent(true);
    try {
      const lines = payload.products.map((p, i) => {
        const price = p.isAction && p.actionPrice != null ? p.actionPrice : p.price;
        return `${i + 1}. [${p.articleNumber}] ${p.brand ? `${p.brand} — ` : ""}${p.description} — ${formatChf(price)} (${p.packLabel})`;
      });
      const body = [
        `Web shop search: "${payload.searchTerm}" (${payload.products.length} articles).`,
        "",
        ...lines,
        "",
        "Summarize options, call out any promotions, and suggest what to order for a small restaurant.",
      ].join("\n");

      await app.sendMessage({
        role: "user",
        content: [{ type: "text", text: body }],
      });
    } finally {
      setTimeout(() => setSent(false), 2000);
    }
  }, [app, payload]);

  if (connectError) {
    return (
      <div className={styles.error}>
        <strong>Error:</strong> {connectError.message}
      </div>
    );
  }
  if (!app) {
    return <div className={styles.loading}>Connecting...</div>;
  }

  return (
    <main className={styles.main}>
      <h2 className={styles.heading}>Transgourmet Web Shop</h2>
      <p className={styles.subtitle}>Search the Swiss wholesale assortment</p>

      <form className={styles.searchRow} onSubmit={handleSubmit}>
        <input
          className={styles.searchInput}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Milch, Kaffee, Tomaten"
          enterKeyHint="search"
          autoComplete="off"
        />
        <button className={styles.searchButton} type="submit" disabled={loading || !query.trim()}>
          {loading ? "…" : "Search"}
        </button>
      </form>

      {error ? <div className={styles.error}>{error}</div> : null}

      {payload ? (
        <p className={styles.meta}>
          {payload.products.length} result{payload.products.length === 1 ? "" : "s"} for &ldquo;
          {payload.searchTerm}&rdquo;
        </p>
      ) : null}

      {payload && payload.products.length === 0 ? (
        <p className={styles.empty}>No articles found. Try another term.</p>
      ) : null}

      {payload && payload.products.length > 0 ? (
        <>
          <div className={styles.grid}>
            {payload.products.map((p) => (
              <ProductCardView key={p.articleNumber} p={p} />
            ))}
          </div>
          <div className={styles.actions}>
            <button
              className={styles.button}
              type="button"
              onClick={() => void handleSendToLlm()}
              disabled={sent || !payload.products.length}
            >
              {sent ? "Sent!" : "Send results to LLM"}
            </button>
          </div>
        </>
      ) : null}

      {!payload && !loading && !error ? (
        <p className={styles.empty}>Enter a search term or open this tool from the assistant with a query.</p>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WebShopApp />
  </StrictMode>,
);
