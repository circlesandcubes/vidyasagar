import Link from "next/link";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { getCurrentUser } from "@/lib/auth/session";
import { getCartId, loadCart } from "@/lib/commerce/server";
import { serviceRoleConfigured } from "@/lib/env";
import { formatMinor } from "@/lib/money";
import { applyCouponAction, removeCouponAction, removeLineAction, setQuantityAction } from "@/app/cart/actions";

export const metadata = { title: "Your cart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CartPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (!serviceRoleConfigured()) {
    return (
      <main id="main-content"><div className="content-wrap">
        <PageIntro eyebrow="Cart" title="Your cart" />
        <p className="verification-notice">Online ordering is not available on this site yet. You can still use the Amazon and Flipkart links on book pages.</p>
      </div></main>
    );
  }
  const user = await getCurrentUser();
  const cartId = await getCartId(false);
  const cart = cartId ? await loadCart(cartId, user?.id ?? null) : null;
  const priced = cart?.priced;
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Cart" title="Your cart" />
        <Flash searchParams={params} />
        {!cart || cart.lines.length === 0 ? (
          <p className="empty-state">Your cart is empty. <Link href="/books">Browse books</Link></p>
        ) : (
          <>
            {cart.problems.length > 0 && (
              <div className="flash flash-error" role="alert"><ul>{cart.problems.map((p) => <li key={p}>{p}</li>)}</ul><p>Remove these items to continue.</p></div>
            )}
            <div className="data-table-wrap">
              <table className="data-table">
                <caption className="visually-hidden">Items in your cart</caption>
                <thead><tr><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Price</th><th scope="col"><span className="visually-hidden">Remove</span></th></tr></thead>
                <tbody>
                  {cart.lines.map((l) => {
                    const p = priced?.lines.find((x) => x.editionId === l.editionId && !l.problem);
                    return (
                      <tr key={l.lineId}>
                        <th scope="row">
                          {l.slug ? <Link href={`/books/${l.slug}`}>{l.title}</Link> : l.title}
                          <div className="small muted">{l.editionLabel}</div>
                          {l.personalisation && <div className="small">{l.personalisation.template_name}: {l.personalisation.fields.map((f) => `${f.label}: ${f.value}`).join("; ")}</div>}
                          {l.problem && <div className="small">{l.problem}</div>}
                        </th>
                        <td>
                          {l.personalisation ? l.quantity : (
                            <form action={setQuantityAction.bind(null, l.lineId)} className="inline-form">
                              <label className="visually-hidden" htmlFor={`q-${l.lineId}`}>Quantity for {l.title}</label>
                              <input id={`q-${l.lineId}`} name="quantity" type="number" min={1} max={20} defaultValue={l.quantity} style={{ width: 64 }} />
                              <button className="link-button" type="submit">Update</button>
                            </form>
                          )}
                        </td>
                        <td>{l.problem ? "—" : formatMinor((p?.totalMinor ?? 0))}</td>
                        <td><form action={removeLineAction.bind(null, l.lineId)}><button className="link-button" type="submit">Remove</button></form></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {priced && (
              <dl className="review-facts">
                <dt>Subtotal</dt><dd>{formatMinor(priced.subtotalMinor)}</dd>
                {priced.applied.map((a) => (<div key={a.ruleId}><dt>{a.label}</dt><dd>−{formatMinor(a.amountMinor)}</dd></div>))}
                <dt>Delivery</dt><dd>{priced.shippingMinor === 0 ? "Free" : formatMinor(priced.shippingMinor)}</dd>
                <dt><strong>Total</strong></dt><dd><strong>{formatMinor(priced.totalMinor)}</strong></dd>
              </dl>
            )}
            {priced?.notices.map((n) => <p key={n} className="small muted">{n}</p>)}

            {cart.couponCode ? (
              <form action={removeCouponAction}><p className="small">Coupon {cart.couponCode} <button className="link-button" type="submit">Remove</button></p></form>
            ) : (
              <form action={applyCouponAction} className="form-stack">
                <div className="field"><label htmlFor="code">Coupon code</label><input id="code" name="code" maxLength={32} autoComplete="off" /></div>
                <button className="button" type="submit">Apply</button>
              </form>
            )}
            <p className="small muted">Prices are in Indian rupees. Delivery is within India.</p>
            <p><Link className="button" href="/checkout" aria-disabled={cart.hasProblems}>Continue to checkout</Link></p>
          </>
        )}
      </div>
    </main>
  );
}
