import { formatChf, type CartOverview } from "./cart-model";
import styles from "./cart-ui.module.css";

const defaultEmptyMessage =
  "Noch keine Artikel. Wechseln Sie zur Suche und legen Sie Produkte in den Warenkorb.";

export function WebShopCartView({
  cart,
  cartBusy,
  cartMessage,
  onRemoveLine,
  onFinalize,
  emptyCartMessage = defaultEmptyMessage,
}: {
  cart: CartOverview | null;
  cartBusy: boolean;
  cartMessage: string | null;
  onRemoveLine: (lineId: string) => void;
  onFinalize: () => void;
  /** Hinweis, wenn der Warenkorb leer ist (z. B. in der reinen Warenkorb-App ohne Suche). */
  emptyCartMessage?: string;
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
          <p className={styles.meta}>{emptyCartMessage}</p>
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
                Bestellung abschliessen
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
