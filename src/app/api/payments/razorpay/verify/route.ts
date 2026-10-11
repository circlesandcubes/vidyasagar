import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { requireService, sendOrderConfirmation } from "@/lib/commerce/server";
import { fetchProviderPayment, razorpayConfig, verifyCheckoutSignature } from "@/lib/payments/razorpay";
import { createUserClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const body = z.object({
  orderNumber: z.string().regex(/^VS-\d{4,}$/),
  razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]+$/),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/),
});

/**
 * Called by the browser after Checkout succeeds. It is a fast path only: the
 * signature proves the payment belongs to our gateway order, and we then ask the
 * gateway for the payment itself. The webhook remains the authoritative backstop.
 */
export async function POST(request: Request) {
  const config = razorpayConfig();
  const user = await getCurrentUser();
  if (!config || !user) return NextResponse.json({ ok: false }, { status: user ? 503 : 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const b = parsed.data;

  const client = await createUserClient();
  const { data: order } = (await client?.from("orders").select("id").eq("order_number", b.orderNumber).maybeSingle()) ?? { data: null };
  if (!order) return NextResponse.json({ ok: false }, { status: 404 });

  const service = requireService();
  const { data: payment } = await service.from("payments").select("provider_order_id").eq("order_id", order.id).eq("provider", "razorpay").maybeSingle();
  if (!payment || payment.provider_order_id !== b.razorpay_order_id) return NextResponse.json({ ok: false }, { status: 400 });
  if (!verifyCheckoutSignature(b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature, config.keySecret)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let providerPayment;
  try {
    providerPayment = await fetchProviderPayment(config, b.razorpay_payment_id);
  } catch {
    return NextResponse.json({ ok: false, pending: true }, { status: 502 });
  }
  if (providerPayment.order_id !== b.razorpay_order_id) return NextResponse.json({ ok: false }, { status: 400 });
  if (providerPayment.status !== "captured") return NextResponse.json({ ok: true, pending: true });

  const { data: outcome, error } = await service.rpc("apply_payment_captured", {
    p_provider: "razorpay",
    p_event_id: `verify:${b.razorpay_payment_id}`,
    p_event_type: "checkout.verify",
    p_provider_order_id: b.razorpay_order_id,
    p_provider_payment_id: b.razorpay_payment_id,
    p_amount_minor: providerPayment.amount,
    p_payload: { source: "checkout_verify", payment_id: providerPayment.id, status: providerPayment.status },
  });
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  if (outcome === "applied") await sendOrderConfirmation(order.id);
  return NextResponse.json({ ok: true, outcome });
}
