import { PageIntro } from "@/components/page-intro";
import { requireRole } from "@/lib/auth/session";
import { formatMinor } from "@/lib/money";
import { createUserClient } from "@/lib/supabase/server";
import { ORDER_STATUS_LABEL } from "@/lib/commerce/labels";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  await requireRole(["admin", "curator"], "/admin/analytics");
  const client = await createUserClient();
  const [clicks, orders] = client
    ? await Promise.all([client.rpc("analytics_clicks", { p_days: 30 }), client.rpc("analytics_orders", { p_days: 30 })])
    : [{ data: [] }, { data: [] }];
  const clickRows = (clicks.data ?? []) as { edition_id: string; book_title: string; channel: string; clicks: number }[];
  const orderRows = (orders.data ?? []) as { status: string; orders: number; revenue_minor: number }[];
  const total = clickRows.reduce((n, r) => n + Number(r.clicks), 0);
  return (
    <>
      <PageIntro eyebrow="Admin" title="Analytics, last 30 days" lede="Counts only. Clicks record which book and store were chosen, never who clicked. A click is not a purchase: we cannot see what happens on the retailer's site." />
      <section className="panel">
        <h2>Retailer link clicks ({total})</h2>
        {clickRows.length === 0 ? <p className="empty-state">No clicks yet.</p> : (
          <div className="data-table-wrap"><table className="data-table">
            <caption className="visually-hidden">Clicks by book and store</caption>
            <thead><tr><th scope="col">Book</th><th scope="col">Store</th><th scope="col">Clicks</th></tr></thead>
            <tbody>{clickRows.map((r) => <tr key={`${r.edition_id}-${r.channel}`}><th scope="row">{r.book_title}</th><td>{r.channel}</td><td>{Number(r.clicks)}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
      <section className="panel">
        <h2>Direct orders</h2>
        {orderRows.length === 0 ? <p className="empty-state">No orders yet.</p> : (
          <div className="data-table-wrap"><table className="data-table">
            <caption className="visually-hidden">Orders by status</caption>
            <thead><tr><th scope="col">Status</th><th scope="col">Orders</th><th scope="col">Paid value</th></tr></thead>
            <tbody>{orderRows.map((r) => <tr key={r.status}><th scope="row">{ORDER_STATUS_LABEL[r.status] ?? r.status}</th><td>{Number(r.orders)}</td><td>{formatMinor(Number(r.revenue_minor))}</td></tr>)}</tbody>
          </table></div>
        )}
        <p className="small muted">Paid value is gross of refunds.</p>
      </section>
    </>
  );
}
