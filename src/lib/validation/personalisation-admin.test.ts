import { describe, expect, it } from "vitest";
import { fieldSchema, parseChoices, templateSchema } from "@/lib/validation/personalisation-admin";

describe("personalisation admin validation", () => {
  it("converts the price to paise", () => {
    expect(templateSchema.parse({ name: "N", slug: "n", price: "149.50" }).price).toBe(14950);
    expect(templateSchema.parse({ name: "N", slug: "n", price: "" }).price).toBe(0);
    expect(templateSchema.safeParse({ name: "N", slug: "n", price: "-1" }).success).toBe(false);
    expect(templateSchema.safeParse({ name: "N", slug: "Bad Slug" }).success).toBe(false);
  });
  it("requires choices for choice fields and sane lengths", () => {
    expect(fieldSchema.safeParse({ key: "c", label: "C", fieldType: "choice" }).success).toBe(false);
    expect(fieldSchema.safeParse({ key: "c", label: "C", fieldType: "choice", choices: "Red, Blue" }).success).toBe(true);
    expect(fieldSchema.safeParse({ key: "n", label: "N", fieldType: "text", minLength: "9", maxLength: "3" }).success).toBe(false);
    expect(fieldSchema.safeParse({ key: "Bad", label: "N", fieldType: "text" }).success).toBe(false);
  });
  it("de-duplicates choices", () => {
    expect(parseChoices("Red, Red , Blue,, ")).toEqual(["Red", "Blue"]);
  });
});
