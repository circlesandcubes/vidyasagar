import { describe, expect, it } from "vitest";
import { hasAnyRole, isAppRole, isSeller, isStaff } from "@/lib/auth/roles";

describe("roles", () => {
  it("treats only admin and curator as staff, matching the database", () => {
    expect(isStaff(["admin"])).toBe(true);
    expect(isStaff(["curator"])).toBe(true);
    expect(isStaff(["reviewer", "author", "customer"])).toBe(false);
  });
  it("identifies sellers", () => {
    expect(isSeller(["publisher"])).toBe(true);
    expect(isSeller(["customer"])).toBe(false);
  });
  it("validates role names", () => {
    expect(isAppRole("admin")).toBe(true);
    expect(isAppRole("root")).toBe(false);
    expect(hasAnyRole([], ["admin"])).toBe(false);
  });
});
