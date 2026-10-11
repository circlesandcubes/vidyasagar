import { describe, expect, it } from "vitest";
import { friendlyOrderError } from "@/lib/commerce/errors";

describe("friendlyOrderError", () => {
  it("maps known database messages", () => {
    expect(friendlyOrderError("Prices changed. Please review your cart.")).toContain("prices changed");
    expect(friendlyOrderError("Not enough stock for Moons")).toContain("stock");
    expect(friendlyOrderError("This coupon is not valid")).toContain("coupon");
    expect(friendlyOrderError("Direct sales are not enabled")).toContain("not open");
  });
  it("never leaks unknown internals", () => {
    const out = friendlyOrderError('duplicate key value violates unique constraint "orders_pkey" (SQLSTATE 23505)');
    expect(out).not.toContain("orders_pkey");
    expect(out).toContain("Nothing was charged");
    expect(friendlyOrderError(undefined)).toContain("Nothing was charged");
  });
});
