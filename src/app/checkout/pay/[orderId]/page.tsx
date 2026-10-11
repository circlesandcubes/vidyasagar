import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { requireUser } from "@/lib/auth/session";
import { ensureProviderOrder } from "@/lib/commerce/checkout";
import { getCommerceSettings } from "@/lib/commerce/server";
import { formatMinor } from "@/lib/money";
import { razorpayConfig } from "@/lib/payments/razorpay";
import { createUserClient } from "@/lib/supabase/server";
import { RazorpayButton } from "@/app/checkout/pay/[orderId]/razorpay-button";

export const metadata = { title: "Payment", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  await requireUser(`/checkout/pay/${orderId}`);
  if (!/^[0-9a-f-]{36}$/.test(orderId)) notFound();
  const client = await createUserClient();
  // RLS: only the owner can read the order.
  const { data: order } = (await client?.from("orders").select("id, order_number, status, total_minor, customer_email").eq("id", orderId).maybeSingle()) ?? { data: null };
  if (!order) notFound();
  if (order.status !== "pending_payment") redirect(`/orders/${order.order_number}`);

  const config = razorpayConfig();
  const providerOrderId = config ? await ensureProviderOrder(order.id) : null;
  const settings = await getCommerceSettings();
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Payment" title={`Pay for order ${order.order_number}`} />
        <p>Amount to pay: <strong>{formatMinor(order.total_minor)}</strong></p>
        {config && providerOrderId ? (
          <RazorpayButton orderNumber={order.order_number} keyId={config.keyId} providerOrderId={providerOrderId} amountMinor={order.total_minor} email={order.customer_email} businessName={settings.businessName ?? "Vidyasagar"} />
        ) : (
          <p className="flash flash-error" role="alert">We could not start the payment just now. Your order is saved; please try again in a few minutes.</p>
        )}
        <p className="small muted">Unpaid orders are cancelled automatically after a short time. <Link href="/orders">Your orders</Link></p>
      </div>
    </main>
  );
}
