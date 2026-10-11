import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { getCurrentRoles, requireRole } from "@/lib/auth/session";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/commerce/labels";
import { formatMinor } from "@/lib/money";
import { createUserClient } from "@/lib/supabase/server";
import { ORDER_NEXT } from "@/lib/validation/commerce-admin";
import { confirmManualRefundAction, requestRefundAction, setOrderStatusAction, shipOrderAction } from "@/app/admin/orders/actions";

export const metadata = { title: "Order" };
export const dynamic = "force-dynamic";

type Refund = { id: string; amount_minor: number; status: string; reason: string | null };
type Line = { id: string; title: string; edition_label: string; quantity: number; line_total_minor: number; personalisation: unknown };
type Address = { recipient_name: string; phone?: string | null; line1: string; line2?: string | null; city: string; state: string; postal_code: string };

export default async function AdminOrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { number } = await params;
  const query = await searchParams;
  if (!/^VS-\d{4,}$/.test(number)) notFound();
  await requireRole(["admin", "curator"], `/admin/orders/${number}`);
  const isAdmin = (await getCurrentRoles()).includes("admin");
  const client = await createUserClient();
  const { data: order } = (await client?.from("orders").select("*, lines:order_lines(*), history:order_status_history(from_status, to_status, note, created_at), refunds(*), payments(provider_payment_id, status, amount_minor)").eq("order_number", number).maybeSingle()) ?? { data: null };
  if (!order) notFound();
  const a = order.shipping_address as Address;
  const refundRows = order.refunds as Refund[];
  const lineRows = order.lines as Line[];
  const next = ORDER_NEXT[order.status] ?? [];
  const refunded = refundRows.filter((r) => r.status === "processed").reduce((n, r) => n + r.amount_minor, 0);
  const committed = refundRows.filter((r) => r.status !== "failed").reduce((n, r) => n + r.amount_minor, 0);
  return (
    <>
      <PageIntro eyebrow="Admin" title={`Order ${order.order_number}`} lede={`${ORDER_STATUS_LABEL[order.status]} · ${PAYMENT_STATUS_LABEL[order.payment_status]} · ${formatMinor(order.total_minor)}`} />
      <Flash searchParams={query} />
      <section className="panel">
        <h2>Customer and delivery</h2>
        <p>{order.customer_email}<br />{a.recipient_name}{a.phone ? `, ${a.phone}` : ""}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.postal_code}</p>
      </section>
      <section className="panel">
        <h2>Items</h2>
        <ul>{lineRows.map((l) => {
          const p = l.personalisation as { fields?: { label: string; value: string }[] } | null;
          return <li key={l.id}>{l.title} ({l.edition_label}) × {l.quantity}: {formatMinor(l.line_total_minor)}{p?.fields && <div className="small">{p.fields.map((f) => `${f.label}: ${f.value}`).join("; ")}</div>}</li>;
        })}</ul>
        <p className="small">Subtotal {formatMinor(order.subtotal_minor)}, discount {formatMinor(order.discount_minor)}, delivery {formatMinor(order.shipping_minor)}.</p>
      </section>

      {next.length > 0 && (
        <section className="panel">
          <h2>Update status</h2>
          {order.status === "processing" && (
            <form action={shipOrderAction.bind(null, order.id, order.order_number)} className="form-stack">
              <h3>Mark as shipped</h3>
              <div className="field"><label htmlFor="carrier">Carrier</label><input id="carrier" name="carrier" required maxLength={80} /></div>
              <div className="field"><label htmlFor="tracking">Tracking number</label><input id="tracking" name="tracking" maxLength={80} /></div>
              <div className="field"><label htmlFor="trackingUrl">Tracking link (https)</label><input id="trackingUrl" name="trackingUrl" type="url" /></div>
              <button className="button" type="submit">Mark shipped and email customer</button>
            </form>
          )}
          {next.filter((s) => s !== "shipped").map((s) => (
            <form key={s} action={setOrderStatusAction.bind(null, order.id, order.order_number, s)} className="inline-form">
              <label className="visually-hidden" htmlFor={`n-${s}`}>Note</label>
              <input id={`n-${s}`} name="note" placeholder="Note (optional)" maxLength={500} />
              <button className="button" type="submit">Mark as {ORDER_STATUS_LABEL[s].toLowerCase()}</button>
            </form>
          ))}
          {(order.status === "paid" || order.status === "processing") && <p className="small muted">Cancelling a paid order does not refund it; issue the refund below.</p>}
        </section>
      )}

      {(order.payment_status === "paid" || order.payment_status === "partially_refunded" || refundRows.length > 0) && (
        <section className="panel">
          <h2>Refunds</h2>
          <p className="small">Refunded {formatMinor(refunded)} of {formatMinor(order.total_minor)}. Refunds go to the gateway and are marked complete only when it confirms.</p>
          <ul>{refundRows.map((r) => (
            <li key={r.id}>{formatMinor(r.amount_minor)}: {r.status}{r.reason ? ` (${r.reason})` : ""}
              {isAdmin && r.status === "requested" && (
                <form action={confirmManualRefundAction.bind(null, r.id, order.order_number)} className="inline-form">
                  <label className="visually-hidden" htmlFor={`ref-${r.id}`}>Payment reference</label>
                  <input id={`ref-${r.id}`} name="reference" placeholder="Reference of manual refund" required />
                  <button className="link-button" type="submit">Confirm refunded outside the gateway</button>
                </form>
              )}</li>
          ))}</ul>
          {isAdmin && committed < order.total_minor && (order.payment_status === "paid" || order.payment_status === "partially_refunded") && (
            <form action={requestRefundAction.bind(null, order.id, order.order_number)} className="form-stack">
              <div className="field"><label htmlFor="amount">Refund amount (₹)</label><input id="amount" name="amount" required inputMode="decimal" /></div>
              <div className="field"><label htmlFor="reason">Reason</label><input id="reason" name="reason" required minLength={3} maxLength={500} /></div>
              <button className="button" type="submit">Refund</button>
            </form>
          )}
          {!isAdmin && <p className="small muted">Only administrators can issue refunds.</p>}
        </section>
      )}

      <section className="panel">
        <h2>History</h2>
        <ul>{[...order.history].sort((x, y) => x.created_at.localeCompare(y.created_at)).map((h, i) => (
          <li key={i}>{new Date(h.created_at).toLocaleString("en-IN")}: {h.from_status ? `${ORDER_STATUS_LABEL[h.from_status]} → ` : ""}{ORDER_STATUS_LABEL[h.to_status]}{h.note ? ` (${h.note})` : ""}</li>
        ))}</ul>
      </section>
    </>
  );
}
