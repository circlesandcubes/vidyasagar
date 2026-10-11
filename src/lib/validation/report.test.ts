import { describe, expect, it } from "vitest";
import { reportSchema, safeReportPath } from "@/lib/validation/report";

describe("report validation", () => {
  const ok = { category: "factual_error", description: "The page says Mars has 3 moons." };
  it("accepts a valid report with optional email", () => {
    expect(reportSchema.safeParse(ok).success).toBe(true);
    expect(reportSchema.safeParse({ ...ok, contactEmail: "" }).success).toBe(true);
    expect(reportSchema.safeParse({ ...ok, contactEmail: "bad" }).success).toBe(false);
  });
  it("rejects short descriptions, unknown categories and honeypot fills", () => {
    expect(reportSchema.safeParse({ ...ok, description: "bad" }).success).toBe(false);
    expect(reportSchema.safeParse({ ...ok, category: "spam" }).success).toBe(false);
    expect(reportSchema.safeParse({ ...ok, website: "http://spam" }).success).toBe(false);
  });
  it("only keeps same-site paths", () => {
    expect(safeReportPath("/books/x")).toBe("/books/x");
    expect(safeReportPath("//evil.example")).toBeNull();
    expect(safeReportPath("https://evil.example")).toBeNull();
    expect(safeReportPath("/a b")).toBeNull();
  });
});
