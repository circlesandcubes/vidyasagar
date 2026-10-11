import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/commerce/server", () => ({
  requireService: () => ({ rpc, from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }),
  sendOrderConfirmation: vi.fn(),
  sendRefundProcessedEmail: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ serviceRoleConfigured: () => true }));

const SECRET = "whsec_test";
const sign = (body: string) => createHmac("sha256", SECRET).update(body).digest("hex");
const captured = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 5000, status: "captured" } } } });

function request(body: string, headers: Record<string, string>) {
  return new Request("http://localhost/api/webhooks/razorpay", { method: "POST", body, headers });
}

describe("razorpay webhook route", () => {
  beforeEach(() => {
    rpc.mockReset();
    process.env.RAZORPAY_KEY_ID = "rzp_test_x";
    process.env.RAZORPAY_KEY_SECRET = "secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  it("is unavailable (503) without a webhook secret", async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const { POST } = await import("./route");
    expect((await POST(request(captured, {}))).status).toBe(503);
  });

  it("rejects a bad signature before touching the database", async () => {
    const { POST } = await import("./route");
    const res = await POST(request(captured, { "x-razorpay-signature": "0".repeat(64), "x-razorpay-event-id": "evt_1" }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a valid signature without an event id", async () => {
    const { POST } = await import("./route");
    expect((await POST(request(captured, { "x-razorpay-signature": sign(captured) }))).status).toBe(400);
  });

  it("applies a signed capture exactly through the SQL function", async () => {
    rpc.mockResolvedValue({ data: "duplicate", error: null });
    const { POST } = await import("./route");
    const res = await POST(request(captured, { "x-razorpay-signature": sign(captured), "x-razorpay-event-id": "evt_1" }));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("apply_payment_captured", expect.objectContaining({ p_event_id: "evt_1", p_provider_order_id: "order_1", p_amount_minor: 5000 }));
  });

  it("returns 500 when the database fails so the gateway retries", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { POST } = await import("./route");
    const res = await POST(request(captured, { "x-razorpay-signature": sign(captured), "x-razorpay-event-id": "evt_2" }));
    expect(res.status).toBe(500);
  });

  it("acknowledges events it does not act on", async () => {
    const body = JSON.stringify({ event: "payment.authorized", payload: {} });
    const { POST } = await import("./route");
    const res = await POST(request(body, { "x-razorpay-signature": sign(body), "x-razorpay-event-id": "evt_3" }));
    expect(res.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });
});
