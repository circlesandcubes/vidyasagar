import { describe, expect, it } from "vitest";
import { formatMinor, parseRupeesToMinor, percentOfMinor } from "@/lib/money";

describe("money", () => {
  it("parses rupee strings exactly", () => {
    expect(parseRupeesToMinor("149")).toBe(14900);
    expect(parseRupeesToMinor("149.5")).toBe(14950);
    expect(parseRupeesToMinor("0.07")).toBe(7);
    expect(parseRupeesToMinor("1,000")).toBeNull();
    expect(parseRupeesToMinor("-5")).toBeNull();
    expect(parseRupeesToMinor("1.234")).toBeNull();
    expect(parseRupeesToMinor("abc")).toBeNull();
  });
  it("formats Indian rupees", () => {
    expect(formatMinor(14900)).toBe("₹149");
    expect(formatMinor(14950)).toBe("₹149.50");
    expect(formatMinor(12345600)).toBe("₹1,23,456");
    expect(() => formatMinor(1.5)).toThrow();
  });
  it("computes basis-point percentages with half-up rounding", () => {
    expect(percentOfMinor(10000, 1000)).toBe(1000);
    expect(percentOfMinor(999, 1000)).toBe(100);
    expect(percentOfMinor(995, 1000)).toBe(100);
    expect(percentOfMinor(0, 500)).toBe(0);
  });
});
