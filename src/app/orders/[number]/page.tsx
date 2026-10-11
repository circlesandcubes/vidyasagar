import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireUser } from "@/lib/auth/session";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/commerce/labels";
import { formatMinor } from "@/lib/money";
import { createUserClient } from "@/lib/supabase/server";
import { cancelPendingOrderAction } from "@/app/orders/actions";

export const metadata = { title: "Order", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Address = { recipient_name: string; line1: string; line2?: string | null; city: string; state: string; postal_code: string };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { number } = await params;
  const query = await searchParams;
  if (!/^VS-\d{4,}$/.test(number)) notFound();
  await requireUser(`/orders/${number}`);
  const client = await createUserClient();
  const { data: order } = (await client
    ?.from("orders")
    .select("id, order_number, status, payment_status, subtotal_minor, discount_minor, shipping_minor, total_minor, coupon_code, shipping_address, placed_at, lines:order_lines(id, title, edition_label, quantity, line_total_minor, personalisation), shipments:shipping_events(carrier, tracking_number, tracking_url, created_at), refunds(amount_minor, status)")
    .eq("order_number", number)
    .maybeSingle()) ?? { data: null };
  if (!order) notFound();
  const address = order.shipping_address as Address;
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Order" title={`Order ${order.order_number}`} lede={`${ORDER_STATUS_LABEL[order.status] ?? order.status} · ${PAYMENT_STATUS_LABEL[order.payment_status] ?? order.payment_status}`} />
        <Flash searchParams={query} />
        <div className="data-table-wrap">
          <table className="data-table">
            <caption className="visually-hidden">Items in this order</caption>
            <thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Total</th></tr></thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={l.id}>
                  <th scope="row">{l.title}<div className="small muted">{l.edition_label}</div>
                    {(l.personalisation as { template_name?: string; fields?: { label: string; value: string }[] } | null)?.fields && (
                      <div className="small">{(l.personalisation as { fields: { label: string; value: string }[] }).fields.map((f) => `${f.label}: ${f.value}`).join("; ")}</div>
                    )}
                  </th>
                  <td>{l.quantity}</td><td>{formatMinor(l.line_total_minor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="review-facts">
          <dt>Subtotal</dt><dd>{formatMinor(order.subtotal_minor)}</dd>
          {order.discount_minor > 0 && (<><dt>Discount{order.coupon_code ? ` (${order.coupon_code})` : ""}</dt><dd>−{formatMinor(order.discount_minor)}</dd></>)}
          <dt>Delivery</dt><dd>{order.shipping_minor === 0 ? "Free" : formatMinor(order.shipping_minor)}</dd>
          <dt><strong>Total</strong></dt><dd><strong>{formatMinor(order.total_minor)}</strong></dd>
        </dl>
        <h2>Delivering to</h2>
        <p>{address.recipient_name}<br />{address.line1}{address.line2 ? `, ${address.line2}` : ""}<br />{address.city}, {address.state} {address.postal_code}</p>
        {order.shipments.length > 0 && (
          <>
            <h2>Shipment</h2>
            <ul>{order.shipments.map((s, i) => (<li key={i}>{s.carrier ?? "Carrier"} {s.tracking_number ?? ""} {s.tracking_url && <a href={s.tracking_url} rel="noopener noreferrer">Track</a>}</li>))}</ul>
          </>
        )}
        {order.refunds.length > 0 && (
          <><h2>Refunds</h2><ul>{order.refunds.map((r, i) => (<li key={i}>{formatMinor(r.amount_minor)}: {r.status === "processed" ? "refunded" : "requested"}</li>))}</ul></>
        )}
        {order.status === "pending_payment" && (
          <div className="action-row">
            <Link className="button" href={`/checkout/pay/${order.id}`}>Pay now</Link>
            <form action={cancelPendingOrderAction.bind(null, order.id, order.order_number)}><button className="link-button" type="submit">Cancel this order</button></form>
          </div>
        )}
        <p className="small muted">Questions about this order? See <Link href="/returns">returns</Link> or contact us using the details on the <Link href="/shipping">delivery page</Link>.</p>
      </div>
    </main>
  );
}
