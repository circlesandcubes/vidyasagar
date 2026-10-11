import { describe, expect, it } from "vitest";
import {
  bookDraftSchema,
  editionSchema,
  parseCredits,
  parseLinks,
  parsePersonalisation,
  parseSkills,
  sellerApplicationSchema,
  slugifyTitle,
} from "@/lib/validation/submission";

describe("proposal line parsers", () => {
  it("parses credits and defaults the role", () => {
    expect(parseCredits("Asha Rao\nBen Lee | Illustrator")).toEqual({
      items: [{ name: "Asha Rao", role: "author" }, { name: "Ben Lee", role: "illustrator" }],
      errors: [],
    });
    expect(parseCredits("X | wizard").errors).toHaveLength(1);
  });

  it("requires an explanation for every skill", () => {
    expect(parseSkills("Counting | Children count the moons on every page.").items).toHaveLength(1);
    expect(parseSkills("Counting").errors).toHaveLength(1);
    expect(parseSkills("Counting | short").errors).toHaveLength(1);
  });

  it("only accepts retailer links on the retailer's own domain", () => {
    expect(parseLinks("amazon https://www.amazon.in/dp/B000000000").items).toHaveLength(1);
    expect(parseLinks("amazon https://amazon.in.evil.example/dp/1").errors).toHaveLength(1);
    expect(parseLinks("amazon http://www.amazon.in/dp/1").errors).toHaveLength(1);
    expect(parseLinks("flipkart javascript:alert(1)").errors).toHaveLength(1);
    expect(parseLinks("ebay https://ebay.com/x").errors).toHaveLength(1);
  });

  it("limits personalisation ideas", () => {
    expect(parsePersonalisation("Name on cover\n").items).toEqual([{ idea: "Name on cover" }]);
    expect(parsePersonalisation("x".repeat(301)).errors).toHaveLength(1);
  });
});

describe("book draft schema", () => {
  const base = { title: "Moons", rightsConfirmed: "on" };
  it("accepts a minimal draft", () => {
    expect(bookDraftSchema.safeParse(base).success).toBe(true);
  });
  it("rejects inverted age ranges and cover without alt text", () => {
    expect(bookDraftSchema.safeParse({ ...base, ageMinMonths: "60", ageMaxMonths: "24" }).success).toBe(false);
    expect(bookDraftSchema.safeParse({ ...base, coverImageUrl: "https://example.org/c.jpg" }).success).toBe(false);
    expect(bookDraftSchema.safeParse({ ...base, coverImageUrl: "https://example.org/c.jpg", coverImageAlt: "A moon" }).success).toBe(true);
  });
  it("rejects non-https covers and empty titles", () => {
    expect(bookDraftSchema.safeParse({ ...base, coverImageUrl: "http://example.org/c.jpg", coverImageAlt: "x" }).success).toBe(false);
    expect(bookDraftSchema.safeParse({ title: "  " }).success).toBe(false);
  });
  it("treats rights as false unless explicitly ticked", () => {
    expect(bookDraftSchema.parse({ title: "T" }).rightsConfirmed).toBe(false);
  });
});

describe("other schemas", () => {
  it("validates editions", () => {
    expect(editionSchema.safeParse({ format: "paperback", isbn13: "978-0-306-40615-7" }).success).toBe(true);
    expect(editionSchema.safeParse({ format: "paperback", isbn13: "9780306406158" }).success).toBe(false);
    expect(editionSchema.safeParse({ format: "scroll" }).success).toBe(false);
  });
  it("validates seller applications", () => {
    expect(sellerApplicationSchema.safeParse({ kind: "author", displayName: "A", websiteUrl: "http://x.org" }).success).toBe(false);
    expect(sellerApplicationSchema.safeParse({ kind: "publisher", displayName: "Pub" }).success).toBe(true);
  });
  it("slugifies titles safely", () => {
    expect(slugifyTitle("How Many Moons? (2nd ed.)")).toBe("how-many-moons-2nd-ed");
    expect(slugifyTitle("???")).toBe("book");
  });
});
