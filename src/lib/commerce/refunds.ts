import "server-only";

import { requireService } from "@/lib/commerce/server";
import { createProviderRefund, razorpayConfig } from "@/lib/payments/razorpay";

/**
 * Sends an already-recorded refund request to the gateway. The refund is only
 * marked processed later, when the gateway's refund.processed webhook arrives
 * (or an admin confirms a manual refund) — never on our own say-so.
 */
export async function sendRefundToGateway(refundId: string): Promise<"sent" | "no_gateway" | "failed"> {
  const config = razorpayConfig();
  if (!config) return "no_gateway";
  const service = requireService();
  const { data: refund } = await service.from("refunds").select("id, order_id, amount_minor, status, provider_refund_id").eq("id", refundId).maybeSingle();
  if (!refund || refund.status !== "requested") return "failed";
  if (refund.provider_refund_id) return "sent";
  const { data: payment } = await service.from("payments").select("provider_payment_id").eq("order_id", refund.order_id).eq("status", "captured").maybeSingle();
  if (!payment?.provider_payment_id) return "failed";
  try {
    const created = await createProviderRefund(config, { paymentId: payment.provider_payment_id, amountMinor: refund.amount_minor, receipt: refund.id.replace(/-/g, "").slice(0, 30) });
    await service.from("refunds").update({ provider_refund_id: created.id }).eq("id", refund.id);
    return "sent";
  } catch {
    return "failed";
  }
}
