import { describe, expect, it } from "vitest";
import { couponSchema, discountRuleSchema, priceSchema, refundSchema, shipmentSchema } from "@/lib/validation/commerce-admin";

const ed = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("price validation", () => {
  it("converts rupees to paise", () => {
    const r = priceSchema.parse({ editionId: ed, list: "299.50", sale: "249", taxRatePercent: "5", isActive: "on" });
    expect(r.list).toBe(29950);
    expect(r.sale).toBe(24900);
    expect(r.isActive).toBe(true);
  });
  it("rejects a sale price that is not below the list price", () => {
    expect(priceSchema.safeParse({ editionId: ed, list: "100", sale: "100" }).success).toBe(false);
    expect(priceSchema.safeParse({ editionId: ed, list: "100", sale: "150" }).success).toBe(false);
  });
  it("rejects zero and malformed prices", () => {
    expect(priceSchema.safeParse({ editionId: ed, list: "0" }).success).toBe(false);
    expect(priceSchema.safeParse({ editionId: ed, list: "12.345" }).success).toBe(false);
    expect(priceSchema.safeParse({ editionId: ed, list: "abc" }).success).toBe(false);
  });
});

describe("discount validation", () => {
  it("stores percentages as basis points", () => {
    expect(discountRuleSchema.parse({ name: "Spring", kind: "percent", value: "12.5" }).value).toBe(1250);
  });
  it("stores fixed amounts as paise and rejects out-of-range percentages", () => {
    expect(discountRuleSchema.parse({ name: "Flat", kind: "fixed", value: "50" }).value).toBe(5000);
    expect(discountRuleSchema.safeParse({ name: "x", kind: "percent", value: "101" }).success).toBe(false);
    expect(discountRuleSchema.safeParse({ name: "x", kind: "percent", value: "0" }).success).toBe(false);
  });
  it("requires the window to end after it starts", () => {
    expect(discountRuleSchema.safeParse({ name: "x", kind: "fixed", value: "5", startsAt: "2026-02-01", endsAt: "2026-01-01" }).success).toBe(false);
  });
});

describe("coupon, shipment and refund validation", () => {
  it("normalises coupon codes to upper case", () => {
    expect(couponSchema.parse({ code: "welcome10", ruleId: ed }).code).toBe("WELCOME10");
    expect(couponSchema.safeParse({ code: "no spaces", ruleId: ed }).success).toBe(false);
  });
  it("requires https tracking links", () => {
    expect(shipmentSchema.safeParse({ carrier: "X", trackingUrl: "http://t.example/1" }).success).toBe(false);
    expect(shipmentSchema.safeParse({ carrier: "X", trackingUrl: "https://t.example/1" }).success).toBe(true);
  });
  it("needs an amount and a reason for refunds", () => {
    expect(refundSchema.parse({ amount: "100", reason: "Damaged" }).amount).toBe(10000);
    expect(refundSchema.safeParse({ amount: "100", reason: "x" }).success).toBe(false);
  });
});
