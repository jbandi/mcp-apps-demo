import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { type FormEvent, StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  type CartOverview,
  extractTextFromContentBlock,
  formatChf,
  getCartOverviewFromToolResult,
} from "./cart-model";
import styles from "./cart-ui.module.css";
import { WebShopCartView } from "./WebShopCartView";

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
  /** Gesamtzahl der Treffer laut Suche (kann grösser sein als angezeigte `products`). */
  totalCount?: number;
  products: ProductCard[];
}

function isSearchPayload(value: unknown): value is SearchPayload {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as SearchPayload).searchTerm === "string" &&
    Array.isArray((value as SearchPayload).products)
  );
}

function parseSearchPayloadJson(raw: string): SearchPayload | null {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/m.exec(s);
  if (fence) s = fence[1].trim();
  try {
    const parsed = JSON.parse(s) as unknown;
    return isSearchPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getSearchPayloadFromToolResult(result: {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content?: Array<{ type: string; text?: unknown }>;
}): SearchPayload | null {
  if (result.isError) return null;

  const sc = result.structuredContent;
  if (sc && isSearchPayload(sc)) {
    return sc;
  }

  const textBlocks = result.content?.filter((c) => c.type === "text") ?? [];
  for (const block of textBlocks) {
    const raw = extractTextFromContentBlock(block);
    if (raw) {
      const parsed = parseSearchPayloadJson(raw);
      if (parsed) return parsed;
    }
  }

  return null;
}

/** Öffnet die Artikel-Detailseite im öffentlichen Webshop. */
function articleCatalogUrl(articleNumber: string): string {
  const num = encodeURIComponent(articleNumber.trim());
  return `https://web.transgourmet.ch/de/webshop/catalog/article/${num}`;
}

function formatUnitLine(p: ProductCard): string {
  const parts = [p.packLabel, p.pricePerPackLabel, p.comparisonLabel].filter(Boolean) as string[];
  return parts.join(" · ");
}

function CartIcon() {
  return (
    <svg
      className={styles.cartIconSvg}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function ProductWithCartActions({
  p,
  disabled,
  onAdd,
}: {
  p: ProductCard;
  disabled: boolean;
  onAdd: (articleNumber: string, quantity: number) => void;
}) {
  const [qty, setQty] = useState(1);
  const displayPrice = p.isAction && p.actionPrice != null ? p.actionPrice : p.price;
  const showStrike =
    p.isAction && p.oldPrice > 0 && p.oldPrice > displayPrice;
  const unitLine = formatUnitLine(p);

  return (
    <article className={styles.cardWrap}>
      <div className={styles.imageCol}>
        <div className={styles.imageWrap}>
          <img className={styles.image} src={p.imageUrl} alt="" loading="lazy" />
        </div>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.badgeRow}>
          <span className={styles.articlePill} title="Artikelnummer">
            {p.articleNumber}
          </span>
          {p.icons.length > 0 ? (
            <div className={styles.iconsRow}>
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
          {p.isAction ? (
            <span className={`${styles.badge} ${styles.badgeSale}`}>Aktion</span>
          ) : null}
          {p.ecoScore ? <span className={styles.badgeEco}>{p.ecoScore.text}</span> : null}
        </div>
        {p.brand ? <div className={styles.brand}>{p.brand}</div> : null}
        <h3 className={styles.title}>{p.description}</h3>
        {unitLine ? <div className={styles.unitMeta}>{unitLine}</div> : null}
        {p.unavailable ? <div className={styles.unavailable}>Derzeit nicht verfügbar</div> : null}
      </div>

      <div className={styles.cardRight}>
        <div className={styles.cardPriceBlock}>
          <div className={styles.priceRow}>
            <span className={styles.price}>{formatChf(displayPrice)}</span>
            {showStrike ? (
              <span className={styles.oldPrice}>{formatChf(p.oldPrice)}</span>
            ) : null}
          </div>
        </div>
        <div className={styles.cardRightBottom}>
          <label className={styles.qtyRow} htmlFor={`qty-${p.articleNumber}`}>
            <span className={styles.qtyRowLabel}>Menge</span>
            <input
              id={`qty-${p.articleNumber}`}
              className={styles.qtyInput}
              type="number"
              min={1}
              step={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
              disabled={disabled || p.unavailable}
            />
          </label>
          <div className={styles.cardButtonRow}>
            <a
              className={styles.detailsButton}
              href={articleCatalogUrl(p.articleNumber)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Details
            </a>
            <button
              type="button"
              className={styles.addCartButton}
              disabled={disabled || p.unavailable}
              onClick={() => onAdd(p.articleNumber, qty)}
              aria-label="In den Warenkorb"
              title="In den Warenkorb"
            >
              <CartIcon />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function WebShopSearchView({
  query,
  onQueryChange,
  onSubmit,
  loading,
  error,
  payload,
  addToCartDisabled,
  onAddToCart,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  loading: boolean;
  error: string | null;
  payload: SearchPayload | null;
  addToCartDisabled: boolean;
  onAddToCart: (articleNumber: string, quantity: number) => void;
}) {
  return (
    <div className={styles.viewPanel} role="tabpanel" aria-label="Produktsuche">
      <form className={styles.searchRow} onSubmit={onSubmit}>
        <input
          className={styles.searchInput}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="z. B. Milch, Kaffee, Tomaten"
          enterKeyHint="search"
          autoComplete="off"
        />
        <button className={styles.searchButton} type="submit" disabled={loading || !query.trim()}>
          {loading ? "…" : "Suchen"}
        </button>
      </form>

      {error ? <div className={styles.error}>{error}</div> : null}

      {payload ? (
        <p className={styles.meta}>
          {(payload.totalCount ?? payload.products.length)}{" "}
          {(payload.totalCount ?? payload.products.length) === 1 ? "Ergebnis" : "Ergebnisse"} für
          &ldquo;
          {payload.searchTerm}&rdquo;
        </p>
      ) : null}

      {payload && payload.products.length === 0 ? (
        <p className={styles.empty}>Keine Artikel gefunden. Versuchen Sie einen anderen Suchbegriff.</p>
      ) : null}

      {payload && payload.products.length > 0 ? (
        <div className={styles.grid}>
          {payload.products.map((p) => (
            <ProductWithCartActions
              key={p.articleNumber}
              p={p}
              disabled={addToCartDisabled}
              onAdd={onAddToCart}
            />
          ))}
        </div>
      ) : null}

      {!payload && !loading && !error ? (
        <p className={styles.empty}>
          Geben Sie einen Suchbegriff ein, oder öffnen Sie dieses Tool im Assistenten mit einer Abfrage.
        </p>
      ) : null}
    </div>
  );
}

function WebShopApp() {
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState<SearchPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState("guest");
  const [cart, setCart] = useState<CartOverview | null>(null);
  const [cartBusy, setCartBusy] = useState(false);
  const [cartMessage, setCartMessage] = useState<string | null>(null);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"search" | "cart">("search");

  const { app, error: connectError } = useApp({
    appInfo: { name: "Transgourmet Webshop", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (a) => {
      a.onteardown = async () => ({});
      a.onerror = console.error;

      a.ontoolinput = (params) => {
        const term = params.arguments?.searchTerm;
        if (typeof term === "string" && term.trim()) {
          setQuery(term.trim());
        }
        const un = params.arguments?.userName;
        if (typeof un === "string" && un.trim()) {
          setUserName(un.trim());
        }
      };

      a.ontoolresult = (result) => {
        const searchData = getSearchPayloadFromToolResult(result);
        if (searchData) {
          setPayload(searchData);
          setQuery(searchData.searchTerm);
          setError(null);
          setLoading(false);
          return;
        }

        const cartData = getCartOverviewFromToolResult(result);
        if (cartData) {
          setCart(cartData);
          setCartMessage(null);
          setLoading(false);
          setCartBusy(false);
          return;
        }

        if (result.isError) {
          setLoading(false);
          setCartBusy(false);
          return;
        }

        const sc = result.structuredContent;
        if (
          sc &&
          typeof sc === "object" &&
          "orderId" in sc &&
          typeof (sc as { orderId: unknown }).orderId === "string"
        ) {
          setLastOrderId((sc as { orderId: string }).orderId);
          const un =
            typeof (sc as { userName: unknown }).userName === "string"
              ? (sc as { userName: string }).userName
              : "";
          setCart({
            userName: un,
            lines: [],
            lineCount: 0,
            subtotalChf: 0,
          });
          setCartMessage(null);
        }

        setLoading(false);
        setCartBusy(false);
      };
    },
  });

  const refreshCart = useCallback(async () => {
    if (!app || !userName.trim()) return;
    setCartBusy(true);
    setCartMessage(null);
    try {
      const result = await app.callServerTool({
        name: "web-shop-cart-get",
        arguments: { userName: userName.trim() },
      });
      const overview = getCartOverviewFromToolResult(result);
      if (overview) {
        setCart(overview);
      } else if (result.isError) {
        setCartMessage("Warenkorb konnte nicht geladen werden.");
      }
    } catch (e) {
      console.error(e);
      setCartMessage("Warenkorb konnte nicht geladen werden.");
    } finally {
      setCartBusy(false);
    }
  }, [app, userName]);

  useEffect(() => {
    if (app && userName.trim()) {
      void refreshCart();
    }
  }, [app, userName, refreshCart]);

  const addToCart = useCallback(
    async (articleNumber: string, quantity: number) => {
      if (!app || !userName.trim()) return;
      setCartBusy(true);
      setCartMessage(null);
      try {
        const result = await app.callServerTool({
          name: "web-shop-cart-add",
          arguments: {
            userName: userName.trim(),
            items: [{ articleNumber, quantity }],
          },
        });
        const overview = getCartOverviewFromToolResult(result);
        if (overview) {
          setCart(overview);
        } else if (result.isError) {
          setCartMessage("Artikel konnte nicht hinzugefügt werden.");
        }
      } catch (e) {
        console.error(e);
        setCartMessage("Artikel konnte nicht hinzugefügt werden.");
      } finally {
        setCartBusy(false);
      }
    },
    [app, userName],
  );

  const removeLine = useCallback(
    async (lineId: string) => {
      if (!app || !userName.trim()) return;
      setCartBusy(true);
      setCartMessage(null);
      try {
        const result = await app.callServerTool({
          name: "web-shop-cart-remove",
          arguments: { userName: userName.trim(), lineId },
        });
        const overview = getCartOverviewFromToolResult(result);
        if (overview) {
          setCart(overview);
        }
      } catch (e) {
        console.error(e);
        setCartMessage("Zeile konnte nicht entfernt werden.");
      } finally {
        setCartBusy(false);
      }
    },
    [app, userName],
  );

  const finalizeOrder = useCallback(async () => {
    if (!app || !userName.trim()) return;
    setCartBusy(true);
    setCartMessage(null);
    try {
      const result = await app.callServerTool({
        name: "web-shop-cart-finalize",
        arguments: { userName: userName.trim() },
      });
      if (result.isError) {
        setCartMessage("Bestellung konnte nicht abgeschlossen werden (evtl. leerer Warenkorb).");
        setCartBusy(false);
        return;
      }
      const sc = result.structuredContent as Record<string, unknown> | undefined;
      const oid = sc && typeof sc.orderId === "string" ? sc.orderId : null;
      if (oid) {
        setLastOrderId(oid);
      }
      await refreshCart();
    } catch (e) {
      console.error(e);
      setCartMessage("Bestellung konnte nicht abgeschlossen werden.");
    } finally {
      setCartBusy(false);
    }
  }, [app, userName, refreshCart]);

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
          throw new Error("Ungültige Antwort");
        }
        setPayload(data);
      } catch (e) {
        console.error(e);
        setError("Suche fehlgeschlagen. Bitte erneut versuchen.");
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

  if (connectError) {
    return (
      <div className={styles.error}>
        <strong>Fehler:</strong> {connectError.message}
      </div>
    );
  }
  if (!app) {
    return <div className={styles.loading}>Verbindung wird hergestellt …</div>;
  }

  const cartCount = cart?.lineCount ?? 0;

  return (
    <main className={styles.main}>
      <div className={styles.mainHeader}>
        <h2 className={`${styles.heading} ${styles.headingBrand}`}>Transgourmet Webshop</h2>
        <p className={styles.userDisplay}>
          <span className={styles.userDisplayLabel}>username</span>
          <span className={styles.userDisplayValue}>{userName}</span>
        </p>
      </div>

      {lastOrderId ? (
        <p className={styles.orderBanner} role="status">
          Bestellung (Mock) registriert: <strong>{lastOrderId}</strong>
        </p>
      ) : null}

      {activeView === "search" ? (
        <WebShopSearchView
          query={query}
          onQueryChange={setQuery}
          onSubmit={handleSubmit}
          loading={loading}
          error={error}
          payload={payload}
          addToCartDisabled={cartBusy || !userName.trim()}
          onAddToCart={addToCart}
        />
      ) : (
        <WebShopCartView
          cart={cart}
          cartBusy={cartBusy}
          cartMessage={cartMessage}
          onRemoveLine={(lineId) => void removeLine(lineId)}
          onFinalize={() => void finalizeOrder()}
        />
      )}

      <div className={styles.viewTabs} role="tablist" aria-label="Ansicht wechseln">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "search"}
          className={`${styles.viewTab} ${activeView === "search" ? styles.viewTabActive : ""}`}
          onClick={() => setActiveView("search")}
        >
          Suche
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "cart"}
          className={`${styles.viewTab} ${activeView === "cart" ? styles.viewTabActive : ""}`}
          onClick={() => setActiveView("cart")}
        >
          Warenkorb
          {cartCount > 0 ? (
            <span className={styles.viewTabBadge} aria-hidden>
              {cartCount}
            </span>
          ) : null}
        </button>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WebShopApp />
  </StrictMode>,
);
