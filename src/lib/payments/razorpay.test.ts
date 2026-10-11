import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createProviderOrder, createProviderRefund, fetchProviderPayment, normaliseWebhookEvent, razorpayConfig,
  verifyCheckoutSignature, verifyWebhookSignature,
} from "@/lib/payments/razorpay";

const sign = (secret: string, message: string) => createHmac("sha256", secret).update(message).digest("hex");
const config = { keyId: "rzp_test_x", keySecret: "key_secret", webhookSecret: "whsec" };

describe("signature verification", () => {
  const body = JSON.stringify({ event: "payment.captured" });
  it("accepts the correct webhook signature over the raw body", () => {
    expect(verifyWebhookSignature(body, sign("whsec", body), "whsec")).toBe(true);
  });
  it("rejects wrong secrets, altered bodies, missing and wrong-length signatures", () => {
    expect(verifyWebhookSignature(body, sign("other", body), "whsec")).toBe(false);
    expect(verifyWebhookSignature(body + " ", sign("whsec", body), "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, null, "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, "abc", "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, "", "whsec")).toBe(false);
  });
  it("verifies the checkout callback signature", () => {
    const sig = sign("key_secret", "order_1|pay_1");
    expect(verifyCheckoutSignature("order_1", "pay_1", sig, "key_secret")).toBe(true);
    expect(verifyCheckoutSignature("order_2", "pay_1", sig, "key_secret")).toBe(false);
    expect(verifyCheckoutSignature("order_1", "pay_2", sig, "key_secret")).toBe(false);
    expect(verifyCheckoutSignature("", "", "", "key_secret")).toBe(false);
  });
});

describe("configuration", () => {
  it("is null unless both key id and secret are set", () => {
    expect(razorpayConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(razorpayConfig({ RAZORPAY_KEY_ID: "a" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(razorpayConfig({ RAZORPAY_KEY_ID: "a", RAZORPAY_KEY_SECRET: "b" } as unknown as NodeJS.ProcessEnv)).toEqual({ keyId: "a", keySecret: "b", webhookSecret: null });
  });
});

describe("event mapping", () => {
  const captured = { event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 34900, status: "captured" } } } };
  it("maps captured payments", () => {
    expect(normaliseWebhookEvent(captured)).toEqual({ kind: "captured", eventType: "payment.captured", providerOrderId: "order_1", providerPaymentId: "pay_1", amountMinor: 34900 });
  });
  it("ignores captures that are not marked captured or are malformed", () => {
    const authorised = structuredClone(captured);
    (authorised.payload.payment.entity as Record<string, unknown>).status = "authorized";
    expect(normaliseWebhookEvent(authorised).kind).toBe("ignored");
    expect(normaliseWebhookEvent({ event: "payment.captured", payload: {} }).kind).toBe("ignored");
    expect(normaliseWebhookEvent({ event: "payment.captured", payload: { payment: { entity: { id: "p", order_id: "o", amount: -5, status: "captured" } } } }).kind).toBe("ignored");
    expect(normaliseWebhookEvent(null).kind).toBe("ignored");
    expect(normaliseWebhookEvent({ event: "something.else" }).kind).toBe("ignored");
  });
  it("maps failures and refunds", () => {
    expect(normaliseWebhookEvent({ event: "payment.failed", payload: { payment: { entity: { order_id: "order_1" } } } })).toEqual({ kind: "failed", eventType: "payment.failed", providerOrderId: "order_1" });
    expect(normaliseWebhookEvent({ event: "refund.processed", payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_1", amount: 1000 } } } })).toEqual({ kind: "refund_processed", eventType: "refund.processed", providerPaymentId: "pay_1", providerRefundId: "rfnd_1", amountMinor: 1000 });
  });
});

describe("API calls (mocked transport)", () => {
  const ok = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
  it("creates an order in paise with basic auth", async () => {
    const f = ok({ id: "order_1", amount: 100 });
    await createProviderOrder(config, { amountMinor: 100, receipt: "VS-1001" }, f as unknown as typeof fetch);
    const [url, init] = f.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect(JSON.parse(init.body as string)).toEqual({ amount: 100, currency: "INR", receipt: "VS-1001" });
    expect(init.headers.authorization).toBe(`Basic ${Buffer.from("rzp_test_x:key_secret").toString("base64")}`);
  });
  it("rejects non-integer amounts and malformed payment ids before any request", async () => {
    const f = ok({});
    await expect(createProviderOrder(config, { amountMinor: 10.5, receipt: "r" }, f as unknown as typeof fetch)).rejects.toThrow("Invalid amount");
    await expect(fetchProviderPayment(config, "../orders", f as unknown as typeof fetch)).rejects.toThrow("Invalid payment id");
    await expect(createProviderRefund(config, { paymentId: "x", amountMinor: 1, receipt: "r" }, f as unknown as typeof fetch)).rejects.toThrow("Invalid payment id");
    expect(f).not.toHaveBeenCalled();
  });
  it("surfaces HTTP failures without leaking the response body", async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { description: "secret detail" } }) });
    await expect(createProviderOrder(config, { amountMinor: 100, receipt: "r" }, f as unknown as typeof fetch)).rejects.toThrow("failed with HTTP 400");
  });
});
