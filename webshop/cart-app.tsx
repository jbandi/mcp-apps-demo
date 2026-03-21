import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { CartOverview } from "./cart-model";
import { getCartOverviewFromToolResult } from "./cart-model";
import styles from "./search-ui.module.css";
import { WebShopCartView } from "./WebShopCartView";

function WebShopCartApp() {
  const [userName, setUserName] = useState("Gast");
  const [cart, setCart] = useState<CartOverview | null>(null);
  const [cartBusy, setCartBusy] = useState(false);
  const [cartMessage, setCartMessage] = useState<string | null>(null);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);

  const { app, error: connectError } = useApp({
    appInfo: { name: "Transgourmet Webshop Warenkorb", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (a) => {
      a.onteardown = async () => ({});
      a.onerror = console.error;

      a.ontoolinput = (params) => {
        const un = params.arguments?.userName;
        if (typeof un === "string" && un.trim()) {
          setUserName(un.trim());
        }
      };

      a.ontoolresult = (result) => {
        const cartData = getCartOverviewFromToolResult(result);
        if (cartData) {
          setCart(cartData);
          setCartMessage(null);
          setCartBusy(false);
          return;
        }

        if (result.isError) {
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

  return (
    <main className={styles.main}>
      <h2 className={styles.heading}>Warenkorb</h2>
      <p className={styles.subtitle}>Transgourmet Webshop (Demo)</p>

      <div className={styles.userRow}>
        <label htmlFor="webshop-cart-user">Benutzername</label>
        <input
          id="webshop-cart-user"
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

      <WebShopCartView
        cart={cart}
        cartBusy={cartBusy}
        cartMessage={cartMessage}
        onRemoveLine={(lineId) => void removeLine(lineId)}
        onFinalize={() => void finalizeOrder()}
        emptyCartMessage="Noch keine Artikel in diesem Warenkorb."
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WebShopCartApp />
  </StrictMode>,
);
