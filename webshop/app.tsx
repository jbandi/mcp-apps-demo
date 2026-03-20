import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { type FormEvent, StrictMode, useCallback, useEffect, useState } from "react";
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

interface CartLineRow {
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

interface CartOverview {
  userName: string;
  lines: CartLineRow[];
  lineCount: number;
  subtotalChf: number;
}

function formatChf(value: number): string {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(value);
}

function isSearchPayload(value: unknown): value is SearchPayload {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as SearchPayload).searchTerm === "string" &&
    Array.isArray((value as SearchPayload).products)
  );
}

function extractTextFromContentBlock(block: { text?: unknown }): string | null {
  const t = block.text;
  if (typeof t === "string") return t;
  if (t && typeof t === "object" && "text" in t) {
    const nested = (t as { text?: unknown }).text;
    return typeof nested === "string" ? nested : null;
  }
  return null;
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

function getCartOverviewFromToolResult(result: {
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

function ProductCardView({ p }: { p: ProductCard }) {
  const displayPrice = p.isAction && p.actionPrice != null ? p.actionPrice : p.price;
  const showStrike =
    p.isAction && p.oldPrice > 0 && p.oldPrice > displayPrice;

  return (
    <article className={styles.card}>
      <div className={styles.imageWrap}>
        <img className={styles.image} src={p.imageUrl} alt="" loading="lazy" />
        <div className={styles.imageOverlay}>
          {p.icons.length > 0 ? (
            <div className={styles.iconsOverlay}>
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
          {p.isAction || p.ecoScore ? (
            <div className={styles.badges}>
              {p.isAction ? <span className={`${styles.badge} ${styles.badgeSale}`}>Aktion</span> : null}
              {p.ecoScore ? <span className={styles.badge}>{p.ecoScore.text}</span> : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className={styles.body}>
        {p.brand ? <div className={styles.brand}>{p.brand}</div> : null}
        <h3 className={styles.title}>{p.description}</h3>
        <div className={styles.articleNo}>Art.Nr: {p.articleNumber}</div>
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
        {p.unavailable ? <div className={styles.unavailable}>Derzeit nicht verfügbar</div> : null}
      </div>
    </article>
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

  return (
    <div className={styles.cardWrap}>
      <ProductCardView p={p} />
      <div className={styles.cardActions}>
        <label htmlFor={`qty-${p.articleNumber}`} className={styles.meta}>
          Menge
        </label>
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
        <button
          type="button"
          className={styles.addCartButton}
          disabled={disabled || p.unavailable}
          onClick={() => onAdd(p.articleNumber, qty)}
        >
          In den Warenkorb
        </button>
      </div>
    </div>
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
          {payload.products.length}{" "}
          {payload.products.length === 1 ? "Ergebnis" : "Ergebnisse"} für &ldquo;
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

function WebShopCartView({
  cart,
  cartBusy,
  cartMessage,
  onRemoveLine,
  onFinalize,
}: {
  cart: CartOverview | null;
  cartBusy: boolean;
  cartMessage: string | null;
  onRemoveLine: (lineId: string) => void;
  onFinalize: () => void;
}) {
  return (
    <div className={styles.viewPanel} role="tabpanel" aria-label="Warenkorb">
      <section className={styles.cartSection} aria-labelledby="cart-heading">
        <h3 className={styles.cartHeading} id="cart-heading">
          Warenkorb
          {cart ? (
            <>
              {" "}
              · {cart.lineCount} {cart.lineCount === 1 ? "Position" : "Positionen"}
            </>
          ) : null}
        </h3>
        {cartMessage ? <div className={styles.error}>{cartMessage}</div> : null}
        {cart === null ? (
          <p className={styles.meta}>{cartBusy ? "Warenkorb wird geladen …" : "—"}</p>
        ) : cart.lines.length === 0 ? (
          <p className={styles.meta}>
            Noch keine Artikel. Wechseln Sie zur Suche und legen Sie Produkte in den Warenkorb.
          </p>
        ) : (
          <>
            <ul className={styles.cartList}>
              {cart.lines.map((line) => (
                <li key={line.lineId} className={styles.cartLine}>
                  <img className={styles.cartThumb} src={line.imageUrl} alt="" loading="lazy" />
                  <div className={styles.cartLineBody}>
                    <div className={styles.cartLineTitle}>{line.description}</div>
                    <div className={styles.cartLineMeta}>
                      Art. {line.articleNumber} · {line.quantity}× {line.unitText} à {formatChf(line.unitPrice)} →{" "}
                      {formatChf(line.lineTotal)}
                    </div>
                  </div>
                  <div className={styles.cartLineActions}>
                    <button
                      type="button"
                      className={styles.removeLineButton}
                      disabled={cartBusy}
                      onClick={() => onRemoveLine(line.lineId)}
                    >
                      Entfernen
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className={styles.cartFooter}>
              <span className={styles.cartTotal}>Total {formatChf(cart.subtotalChf)}</span>
              <button
                type="button"
                className={styles.checkoutButton}
                disabled={cartBusy || cart.lines.length === 0}
                onClick={onFinalize}
              >
                Bestellung abschliessen (Mock)
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function WebShopApp() {
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState<SearchPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState("Gast");
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
      <h2 className={styles.heading}>Transgourmet Webshop</h2>
      <p className={styles.subtitle}>Im Schweizer Grosshandels-Sortiment suchen</p>

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

      <div className={styles.userRow}>
        <label htmlFor="webshop-user">Benutzername (eigener Warenkorb)</label>
        <input
          id="webshop-user"
          className={styles.userInput}
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          autoComplete="username"
          placeholder="z. B. Gast, Anna, …"
        />
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
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WebShopApp />
  </StrictMode>,
);
