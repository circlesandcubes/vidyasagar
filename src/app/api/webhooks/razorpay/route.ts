import { NextResponse } from "next/server";
import { requireService, sendOrderConfirmation, sendRefundProcessedEmail } from "@/lib/commerce/server";
import { normaliseWebhookEvent, razorpayConfig, verifyWebhookSignature } from "@/lib/payments/razorpay";
import { serviceRoleConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Razorpay webhook. Order of operations matters:
 *   1. read the RAW body (the signature covers exact bytes)
 *   2. verify the signature before parsing anything
 *   3. apply through idempotent SQL functions keyed by the event id
 * Duplicates and ignorable events return 200 so the gateway stops retrying;
 * a database failure returns 500 so it retries.
 */
export async function POST(request: Request) {
  const config = razorpayConfig();
  if (!config?.webhookSecret || !serviceRoleConfigured()) return NextResponse.json({ ok: false }, { status: 503 });

  const raw = await request.text();
  if (raw.length > 200_000) return NextResponse.json({ ok: false }, { status: 413 });
  if (!verifyWebhookSignature(raw, request.headers.get("x-razorpay-signature"), config.webhookSecret)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const eventId = request.headers.get("x-razorpay-event-id");
  if (!eventId || !/^[A-Za-z0-9_-]{4,100}$/.test(eventId)) return NextResponse.json({ ok: false }, { status: 400 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const event = normaliseWebhookEvent(body);
  if (event.kind === "ignored") return NextResponse.json({ ok: true, ignored: true });

  const service = requireService();
  const payload = { event: event.eventType, kind: event.kind };
  if (event.kind === "captured") {
    const { data, error } = await service.rpc("apply_payment_captured", {
      p_provider: "razorpay", p_event_id: eventId, p_event_type: event.eventType,
      p_provider_order_id: event.providerOrderId, p_provider_payment_id: event.providerPaymentId,
      p_amount_minor: event.amountMinor, p_payload: payload,
    });
    if (error) return NextResponse.json({ ok: false }, { status: 500 });
    if (data === "applied") {
      const { data: pay } = await service.from("payments").select("order_id").eq("provider", "razorpay").eq("provider_order_id", event.providerOrderId).maybeSingle();
      if (pay) await sendOrderConfirmation(pay.order_id);
    }
    return NextResponse.json({ ok: true, outcome: data });
  }
  if (event.kind === "failed") {
    const { data, error } = await service.rpc("apply_payment_failed", {
      p_provider: "razorpay", p_event_id: eventId, p_event_type: event.eventType,
      p_provider_order_id: event.providerOrderId, p_payload: payload,
    });
    if (error) return NextResponse.json({ ok: false }, { status: 500 });
    return NextResponse.json({ ok: true, outcome: data });
  }
  const { data, error } = await service.rpc("apply_refund_processed", {
    p_provider: "razorpay", p_event_id: eventId, p_event_type: event.eventType,
    p_provider_payment_id: event.providerPaymentId, p_provider_refund_id: event.providerRefundId,
    p_amount_minor: event.amountMinor, p_payload: payload,
  });
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  if (data === "applied") {
    const { data: pay } = await service.from("payments").select("order_id").eq("provider", "razorpay").eq("provider_payment_id", event.providerPaymentId).maybeSingle();
    if (pay) await sendRefundProcessedEmail(pay.order_id, event.amountMinor, event.providerRefundId);
  }
  return NextResponse.json({ ok: true, outcome: data });
}
