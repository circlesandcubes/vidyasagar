import Link from "next/link";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireRole } from "@/lib/auth/session";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/commerce/labels";
import { formatMinor } from "@/lib/money";
import { createUserClient } from "@/lib/supabase/server";

export const metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

const FILTERS = ["pending_payment", "paid", "processing", "shipped", "delivered", "cancelled", "needs_review"];
const EXCEPTIONS = ["order_not_found", "amount_mismatch", "duplicate_payment", "order_cancelled"];

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  await requireRole(["admin", "curator"], "/admin/orders");
  const client = await createUserClient();
  const status = typeof params.status === "string" && FILTERS.includes(params.status) ? params.status : null;
  let query = client?.from("orders").select("order_number, status, payment_status, total_minor, placed_at, customer_email").order("placed_at", { ascending: false }).limit(200);
  if (query && status) query = query.eq("status", status);
  const [{ data: orders }, { data: exceptions }] = client
    ? await Promise.all([query!, client.from("payment_events").select("id, event_type, outcome, received_at, order:orders(order_number)").in("outcome", EXCEPTIONS).order("received_at", { ascending: false }).limit(20)])
    : [{ data: [] }, { data: [] }];
  return (
    <>
      <PageIntro eyebrow="Admin" title="Orders" />
      <Flash searchParams={params} />
      {exceptions && exceptions.length > 0 && (
        <section className="panel" aria-labelledby="exc-h">
          <h2 id="exc-h">Payment exceptions needing attention</h2>
          <p className="small">These payments could not be applied automatically. Money may have been taken without a matching, payable order.</p>
          <ul>{exceptions.map((e) => {
            const o = Array.isArray(e.order) ? e.order[0] : e.order;
            return <li key={e.id}>{new Date(e.received_at).toLocaleString("en-IN")}: {e.outcome.replace(/_/g, " ")} ({e.event_type}){o ? <> · <Link href={`/admin/orders/${o.order_number}`}>{o.order_number}</Link></> : " · no matching order; check the gateway dashboard"}</li>;
          })}</ul>
        </section>
      )}
      <nav aria-label="Filter by status" className="chip-row">
        <Link className="chip" href="/admin/orders">All</Link>
        {FILTERS.map((f) => <Link key={f} className="chip" href={`/admin/orders?status=${f}`}>{ORDER_STATUS_LABEL[f]}</Link>)}
      </nav>
      {!orders?.length ? <p className="empty-state">No orders.</p> : (
        <div className="data-table-wrap"><table className="data-table">
          <caption className="visually-hidden">Orders</caption>
          <thead><tr><th scope="col">Order</th><th scope="col">Placed</th><th scope="col">Customer</th><th scope="col">Status</th><th scope="col">Payment</th><th scope="col">Total</th></tr></thead>
          <tbody>{orders.map((o) => (
            <tr key={o.order_number}>
              <th scope="row"><Link href={`/admin/orders/${o.order_number}`}>{o.order_number}</Link></th>
              <td>{new Date(o.placed_at).toLocaleDateString("en-IN")}</td><td>{o.customer_email}</td>
              <td>{ORDER_STATUS_LABEL[o.status]}</td><td>{PAYMENT_STATUS_LABEL[o.payment_status]}</td><td>{formatMinor(o.total_minor)}</td>
            </tr>))}</tbody>
        </table></div>
      )}
    </>
  );
}
