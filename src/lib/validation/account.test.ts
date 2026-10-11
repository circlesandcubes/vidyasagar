import { describe, expect, it } from "vitest";
import { addressSchema, interestsSchema, newsletterSchema, reviewSchema } from "@/lib/validation/account";

const base = { recipientName: "A B", line1: "1 Road", city: "Pune", state: "Maharashtra", postalCode: "411001" };

describe("account validation", () => {
  it("accepts a valid address and normalises phone numbers", () => {
    expect(addressSchema.parse({ ...base, phone: "98765 43210" }).phone).toBe("9876543210");
    expect(addressSchema.parse({ ...base, phone: "+91-9876543210" }).phone).toBe("+919876543210");
    expect(addressSchema.parse(base).phone).toBeUndefined();
  });
  it("rejects bad PIN codes and phones", () => {
    expect(addressSchema.safeParse({ ...base, postalCode: "012345" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...base, postalCode: "4110" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
  });
  it("validates interests, reviews and newsletter input", () => {
    expect(interestsSchema.safeParse({ skillIds: ["nope"], ageGroupIds: [] }).success).toBe(false);
    expect(reviewSchema.safeParse({ rating: "6", body: "A fine long review" }).success).toBe(false);
    expect(reviewSchema.safeParse({ rating: "5", body: "short" }).success).toBe(false);
    expect(newsletterSchema.safeParse({ email: "A@B.co", website: "spam" }).success).toBe(false);
    expect(newsletterSchema.parse({ email: " A@B.co " }).email).toBe("a@b.co");
  });
});
