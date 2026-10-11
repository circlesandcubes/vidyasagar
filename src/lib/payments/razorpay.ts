import { createHmac, timingSafeEqual } from "node:crypto";

// Razorpay adapter. The HTTP calls here have NOT been exercised against the live
// gateway in this repository (no credentials were available); signature
// verification and payload mapping are covered by unit tests using computed
// fixtures. Run a test-mode payment end to end before going live.

export type RazorpayConfig = { keyId: string; keySecret: string; webhookSecret: string | null };

export function razorpayConfig(env: NodeJS.ProcessEnv = process.env): RazorpayConfig | null {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || null };
}

function hmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Webhook: HMAC-SHA256 of the RAW request body with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, webhookSecret: string): boolean {
  if (!signature) return false;
  return safeEqualHex(hmacHex(webhookSecret, rawBody), signature.trim());
}

/** Checkout callback: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  if (!orderId || !paymentId || !signature) return false;
  return safeEqualHex(hmacHex(keySecret, `${orderId}|${paymentId}`), signature.trim());
}

type Fetch = typeof fetch;
const API = "https://api.razorpay.com/v1";

async function call<T>(config: RazorpayConfig, path: string, init: RequestInit & { fetchImpl?: Fetch } = {}): Promise<T> {
  const { fetchImpl = fetch, ...rest } = init;
  const response = await fetchImpl(`${API}${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`,
      ...(rest.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Razorpay ${path} failed with HTTP ${response.status}`);
  return (await response.json()) as T;
}

export async function createProviderOrder(
  config: RazorpayConfig,
  args: { amountMinor: number; receipt: string },
  fetchImpl?: Fetch,
): Promise<{ id: string; amount: number }> {
  if (!Number.isInteger(args.amountMinor) || args.amountMinor <= 0) throw new Error("Invalid amount");
  return call(config, "/orders", {
    method: "POST",
    body: JSON.stringify({ amount: args.amountMinor, currency: "INR", receipt: args.receipt.slice(0, 40) }),
    fetchImpl,
  });
}

export async function fetchProviderPayment(
  config: RazorpayConfig,
  paymentId: string,
  fetchImpl?: Fetch,
): Promise<{ id: string; order_id: string; amount: number; status: string; currency: string }> {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new Error("Invalid payment id");
  return call(config, `/payments/${paymentId}`, { fetchImpl });
}

export async function createProviderRefund(
  config: RazorpayConfig,
  args: { paymentId: string; amountMinor: number; receipt: string },
  fetchImpl?: Fetch,
): Promise<{ id: string; status: string }> {
  if (!/^pay_[A-Za-z0-9]+$/.test(args.paymentId)) throw new Error("Invalid payment id");
  return call(config, `/payments/${args.paymentId}/refund`, {
    method: "POST",
    body: JSON.stringify({ amount: args.amountMinor, receipt: args.receipt.slice(0, 40) }),
    fetchImpl,
  });
}

// ---- webhook payload mapping --------------------------------------------------

export type NormalisedEvent =
  | { kind: "captured"; eventType: string; providerOrderId: string; providerPaymentId: string; amountMinor: number }
  | { kind: "failed"; eventType: string; providerOrderId: string }
  | { kind: "refund_processed"; eventType: string; providerPaymentId: string; providerRefundId: string; amountMinor: number }
  | { kind: "ignored"; eventType: string };

type Entity = Record<string, unknown>;
const entity = (body: Entity, key: string): Entity | null => {
  const payload = body.payload as Record<string, { entity?: Entity }> | undefined;
  return payload?.[key]?.entity ?? null;
};
const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
const int = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);

export function normaliseWebhookEvent(body: unknown): NormalisedEvent {
  if (!body || typeof body !== "object") return { kind: "ignored", eventType: "invalid" };
  const b = body as Entity;
  const eventType = str(b.event) ?? "unknown";

  if (eventType === "payment.captured" || eventType === "order.paid") {
    const payment = entity(b, "payment");
    const providerOrderId = str(payment?.order_id);
    const providerPaymentId = str(payment?.id);
    const amountMinor = int(payment?.amount);
    if (providerOrderId && providerPaymentId && amountMinor !== null && payment?.status === "captured") {
      return { kind: "captured", eventType, providerOrderId, providerPaymentId, amountMinor };
    }
    return { kind: "ignored", eventType };
  }
  if (eventType === "payment.failed") {
    const providerOrderId = str(entity(b, "payment")?.order_id);
    return providerOrderId ? { kind: "failed", eventType, providerOrderId } : { kind: "ignored", eventType };
  }
  if (eventType === "refund.processed") {
    const refund = entity(b, "refund");
    const providerPaymentId = str(refund?.payment_id);
    const providerRefundId = str(refund?.id);
    const amountMinor = int(refund?.amount);
    if (providerPaymentId && providerRefundId && amountMinor) {
      return { kind: "refund_processed", eventType, providerPaymentId, providerRefundId, amountMinor };
    }
  }
  return { kind: "ignored", eventType };
}
