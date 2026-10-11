import { AFFILIATE_DISCLOSURE } from "@/lib/site";
import type { PurchaseOption } from "@/lib/catalogue/purchase";

/**
 * Phase 1 shows external retailer links only. The buttons are real anchors with
 * sponsored rel attributes; nothing here claims to know whether a purchase completes.
 */
export function PurchaseOptions({ options }: { options: PurchaseOption[] }) {
  return (
    <section className="panel" aria-labelledby="buy-heading">
      <h2 id="buy-heading">Where to buy</h2>
      {options.length === 0 ? (
        <p>No purchase links are available for this book yet.</p>
      ) : (
        <>
          <ul className="buy-list">
            {options.map((option) => (
              <li key={`${option.editionId}-${option.channel}`}>
                <a className="button" href={option.href} rel={option.rel} target="_blank">
                  {option.label}
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="panel-footnote">{AFFILIATE_DISCLOSURE}</p>
        </>
      )}
    </section>
  );
}
