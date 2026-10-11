import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { requireUser } from "@/lib/auth/session";
import { commerceReadiness, getCartId, loadCart } from "@/lib/commerce/server";
import { serviceRoleConfigured } from "@/lib/env";
import { formatMinor } from "@/lib/money";
import { createUserClient } from "@/lib/supabase/server";
import { CheckoutForm } from "@/app/checkout/checkout-form";

export const metadata = { title: "Checkout", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const user = await requireUser("/checkout");
  const closed = (
    <main id="main-content"><div className="content-wrap">
      <PageIntro eyebrow="Checkout" title="Checkout" />
      <p className="verification-notice">Online ordering is not open yet. You can still use the Amazon and Flipkart links on book pages.</p>
    </div></main>
  );
  if (!serviceRoleConfigured()) return closed;
  const readiness = await commerceReadiness();
  if (!readiness.ready) return closed;

  const cartId = await getCartId(false);
  const cart = cartId ? await loadCart(cartId, user.id) : null;
  if (!cart || cart.lines.length === 0) {
    return <main id="main-content"><div className="content-wrap"><PageIntro eyebrow="Checkout" title="Checkout" /><p className="empty-state">Your cart is empty. <Link href="/books">Browse books</Link></p></div></main>;
  }
  if (cart.hasProblems) {
    return <main id="main-content"><div className="content-wrap"><PageIntro eyebrow="Checkout" title="Checkout" /><p className="flash flash-error" role="alert">Some items in your cart are unavailable. <Link href="/cart">Review your cart</Link></p></div></main>;
  }
  const client = await createUserClient();
  const { data: addresses } = (await client?.from("addresses").select("id, label, recipient_name, line1, city, state, postal_code, is_default").order("created_at")) ?? { data: [] };
  const priced = cart.priced;
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Checkout" title="Checkout" />
        <dl className="review-facts">
          <dt>Subtotal</dt><dd>{formatMinor(priced.subtotalMinor)}</dd>
          {priced.applied.map((a) => (<div key={a.ruleId}><dt>{a.label}</dt><dd>−{formatMinor(a.amountMinor)}</dd></div>))}
          <dt>Delivery</dt><dd>{priced.shippingMinor === 0 ? "Free" : formatMinor(priced.shippingMinor)}</dd>
          <dt><strong>Total</strong></dt><dd><strong>{formatMinor(priced.totalMinor)}</strong></dd>
        </dl>
        {!addresses?.length ? (
          <p>Add a delivery address first. <Link href="/account/addresses">Add an address</Link></p>
        ) : (
          <CheckoutForm addresses={addresses} />
        )}
        <p className="small muted"><Link href="/shipping">Delivery</Link> · <Link href="/returns">Returns</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></p>
      </div>
    </main>
  );
}
