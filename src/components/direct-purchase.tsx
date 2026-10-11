import { addToCartAction } from "@/app/cart/actions";
import type { DirectOffer } from "@/lib/catalogue/data";
import { formatMinor } from "@/lib/money";

/** Shown only when direct sales are enabled and an edition has an active price. */
export function DirectPurchase({ offers, returnTo, title }: { offers: DirectOffer[]; returnTo: string; title: string }) {
  if (offers.length === 0) return null;
  return (
    <section className="panel" aria-labelledby="direct-heading">
      <h2 id="direct-heading">Buy from Vidyasagar</h2>
      <ul className="plain-list">
        {offers.map((o) => (
          <li key={o.editionId}>
            <form action={addToCartAction.bind(null, o.editionId, returnTo)} className="inline-form">
              <span>
                <strong>{o.label}</strong>{" "}
                {o.saleMinor ? (<><s>{formatMinor(o.listMinor)}</s> <strong>{formatMinor(o.saleMinor)}</strong></>) : formatMinor(o.listMinor)}
              </span>
              <label className="visually-hidden" htmlFor={`qty-${o.editionId}`}>Quantity of {title}, {o.label}</label>
              <input id={`qty-${o.editionId}`} name="quantity" type="number" min={1} max={20} defaultValue={1} style={{ width: 64 }} />
              <button className="button" type="submit">Add to cart</button>
            </form>
          </li>
        ))}
      </ul>
      <p className="panel-footnote">Prices in Indian rupees. Delivery within India; charges are shown in your cart.</p>
    </section>
  );
}
