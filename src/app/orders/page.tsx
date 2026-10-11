import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { requireUser } from "@/lib/auth/session";
import { formatMinor } from "@/lib/money";
import { createUserClient } from "@/lib/supabase/server";
import { ORDER_STATUS_LABEL } from "@/lib/commerce/labels";

export const metadata = { title: "Your orders", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  await requireUser("/orders");
  const client = await createUserClient();
  const { data: orders } = (await client?.from("orders").select("order_number, status, total_minor, placed_at").order("placed_at", { ascending: false }).limit(100)) ?? { data: [] };
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Account" title="Your orders" />
        {!orders?.length ? <p className="empty-state">You have not placed any orders yet.</p> : (
          <div className="data-table-wrap">
            <table className="data-table">
              <caption className="visually-hidden">Your orders</caption>
              <thead><tr><th scope="col">Order</th><th scope="col">Placed</th><th scope="col">Status</th><th scope="col">Total</th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.order_number}>
                    <th scope="row"><Link href={`/orders/${o.order_number}`}>{o.order_number}</Link></th>
                    <td>{new Date(o.placed_at).toLocaleDateString("en-IN")}</td>
                    <td>{ORDER_STATUS_LABEL[o.status] ?? o.status}</td>
                    <td>{formatMinor(o.total_minor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
