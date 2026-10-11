import { describe, expect, it } from "vitest";
import { allocate, priceCart, shippingFor, type CartLineInput, type DiscountRule } from "@/lib/commerce/pricing";

const line = (over: Partial<CartLineInput> = {}): CartLineInput => ({
  editionId: "e1", bookId: "b1", title: "T", quantity: 1, listPriceMinor: 10000, salePriceMinor: null, personalisationUnitMinor: 0, ...over,
});
const rule = (over: Partial<DiscountRule> = {}): DiscountRule => ({
  id: "r1", name: "10% off", kind: "percent", value: 1000, minSubtotalMinor: 0, startsAt: null, endsAt: null,
  isActive: true, stackable: false, requiresCoupon: false, bookIds: [], ...over,
});
const ship = { flatMinor: 5000, freeOverMinor: 50000 };
const base = { automaticRules: [] as DiscountRule[], coupon: null, shipping: ship };

describe("priceCart basics", () => {
  it("uses sale price, adds personalisation, adds shipping", () => {
    const c = priceCart({ ...base, lines: [line({ quantity: 2, salePriceMinor: 8000, personalisationUnitMinor: 1500 })] });
    expect(c.lines[0]).toMatchObject({ unitPriceMinor: 8000, grossMinor: 19000, totalMinor: 19000 });
    expect(c.subtotalMinor).toBe(19000);
    expect(c.shippingMinor).toBe(5000);
    expect(c.totalMinor).toBe(24000);
  });
  it("is free shipping at or above the threshold, measured after discounts", () => {
    expect(priceCart({ ...base, lines: [line({ listPriceMinor: 50000 })] }).shippingMinor).toBe(0);
    const discounted = priceCart({ ...base, automaticRules: [rule()], lines: [line({ listPriceMinor: 50000 })] });
    expect(discounted.discountMinor).toBe(5000);
    expect(discounted.shippingMinor).toBe(5000);
    expect(shippingFor(0, { flatMinor: 100, freeOverMinor: null })).toBe(100);
  });
  it("prices an empty cart at zero", () => {
    const c = priceCart({ ...base, lines: [] });
    expect(c).toMatchObject({ subtotalMinor: 0, shippingMinor: 0, totalMinor: 0 });
  });
});

describe("automatic discounts", () => {
  it("applies the single best automatic rule, never several", () => {
    const c = priceCart({ ...base, lines: [line()], automaticRules: [rule({ id: "a", value: 500 }), rule({ id: "b", value: 2000, name: "20%" }), rule({ id: "c", kind: "fixed", value: 300 })] });
    expect(c.applied).toHaveLength(1);
    expect(c.applied[0].ruleId).toBe("b");
    expect(c.discountMinor).toBe(2000);
  });
  it("ignores inactive, expired, future, coupon-only and under-minimum rules", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const rules = [
      rule({ id: "i", isActive: false }),
      rule({ id: "e", endsAt: "2026-01-01T00:00:00Z" }),
      rule({ id: "f", startsAt: "2026-12-01T00:00:00Z" }),
      rule({ id: "c", requiresCoupon: true }),
      rule({ id: "m", minSubtotalMinor: 99999 }),
    ];
    expect(priceCart({ ...base, lines: [line()], automaticRules: rules, now }).discountMinor).toBe(0);
  });
  it("restricts a rule to chosen books", () => {
    const r = rule({ bookIds: ["b2"] });
    const c = priceCart({ ...base, lines: [line({ bookId: "b1" }), line({ editionId: "e2", bookId: "b2" })], automaticRules: [r] });
    expect(c.lines[0].discountMinor).toBe(0);
    expect(c.lines[1].discountMinor).toBe(1000);
  });
  it("never discounts below zero", () => {
    const c = priceCart({ ...base, lines: [line({ listPriceMinor: 200 })], automaticRules: [rule({ kind: "fixed", value: 99999 })] });
    expect(c.discountMinor).toBe(200);
    expect(c.lines[0].totalMinor).toBe(0);
  });
});

describe("coupons", () => {
  const coupon = (r: DiscountRule, valid = true) => ({ code: "SAVE", rule: r, valid });
  it("applies a valid coupon", () => {
    const c = priceCart({ ...base, lines: [line()], coupon: coupon(rule({ requiresCoupon: true })) });
    expect(c.discountMinor).toBe(1000);
    expect(c.couponUsed).toBe("SAVE");
  });
  it("gives the better of automatic and non-stackable coupon, never both", () => {
    const auto = rule({ id: "a", value: 2000, name: "Big sale" });
    const worse = priceCart({ ...base, lines: [line()], automaticRules: [auto], coupon: coupon(rule({ id: "c", requiresCoupon: true, value: 1000 })) });
    expect(worse.discountMinor).toBe(2000);
    expect(worse.couponUsed).toBeNull();
    expect(worse.notices.join(" ")).toContain("saves more");
    const better = priceCart({ ...base, lines: [line()], automaticRules: [rule({ id: "a", value: 500 })], coupon: coupon(rule({ id: "c", requiresCoupon: true, value: 1500 })) });
    expect(better.discountMinor).toBe(1500);
    expect(better.couponUsed).toBe("SAVE");
    expect(better.applied).toHaveLength(1);
  });
  it("stacks a stackable coupon on top of the automatic rule, on the remaining amount", () => {
    const c = priceCart({ ...base, lines: [line()], automaticRules: [rule({ id: "a", value: 1000 })], coupon: coupon(rule({ id: "c", requiresCoupon: true, stackable: true, value: 1000 })) });
    expect(c.applied.map((a) => a.amountMinor)).toEqual([1000, 900]);
    expect(c.discountMinor).toBe(1900);
    expect(c.couponUsed).toBe("SAVE");
  });
  it("explains and ignores invalid, expired or under-minimum coupons", () => {
    expect(priceCart({ ...base, lines: [line()], coupon: coupon(rule({ requiresCoupon: true }), false) }).notices[0]).toContain("not valid");
    expect(priceCart({ ...base, lines: [line()], coupon: coupon(rule({ requiresCoupon: true, endsAt: "2000-01-01T00:00:00Z" })) }).discountMinor).toBe(0);
    const small = priceCart({ ...base, lines: [line()], coupon: coupon(rule({ requiresCoupon: true, minSubtotalMinor: 999999 })) });
    expect(small.discountMinor).toBe(0);
    expect(small.couponUsed).toBeNull();
  });
});

describe("allocation", () => {
  it("sums exactly and stays proportional", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(7, [0, 5, 5])).toEqual([0, 4, 3]);
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
    expect(allocate(5, [0, 0])).toEqual([0, 0]);
  });
  it("keeps line discounts summing to the cart discount for awkward numbers", () => {
    for (const value of [333, 777, 1234, 9999]) {
      const c = priceCart({
        ...base,
        lines: [line({ listPriceMinor: 3333, quantity: 3 }), line({ editionId: "e2", bookId: "b2", listPriceMinor: 4999 }), line({ editionId: "e3", bookId: "b3", listPriceMinor: 101, quantity: 7 })],
        automaticRules: [rule({ value })],
      });
      expect(c.lines.reduce((s, l) => s + l.discountMinor, 0)).toBe(c.discountMinor);
      expect(c.lines.every((l) => l.totalMinor >= 0 && l.discountMinor <= l.grossMinor)).toBe(true);
      expect(c.totalMinor).toBe(c.subtotalMinor - c.discountMinor + c.shippingMinor);
    }
  });
  it("produces integers only", () => {
    const c = priceCart({ ...base, lines: [line({ listPriceMinor: 3333, quantity: 3 })], automaticRules: [rule({ value: 777 })] });
    for (const n of [c.subtotalMinor, c.discountMinor, c.shippingMinor, c.totalMinor, ...c.lines.map((l) => l.discountMinor)]) expect(Number.isInteger(n)).toBe(true);
  });
});
