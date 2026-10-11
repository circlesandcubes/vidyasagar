import { describe, expect, it } from "vitest";
import { isValidIsbn13, normaliseIsbn13 } from "@/lib/catalogue/isbn";

describe("isbn13", () => {
  it("accepts a valid number with or without separators", () => {
    expect(isValidIsbn13("9780306406157")).toBe(true);
    expect(isValidIsbn13("978-0-306-40615-7")).toBe(true);
    expect(normaliseIsbn13("978 0 306 40615 7")).toBe("9780306406157");
  });
  it("rejects bad check digits, prefixes and lengths", () => {
    expect(isValidIsbn13("9780306406158")).toBe(false);
    expect(isValidIsbn13("9770306406157")).toBe(false);
    expect(isValidIsbn13("978030640615")).toBe(false);
    expect(isValidIsbn13("")).toBe(false);
  });
});
