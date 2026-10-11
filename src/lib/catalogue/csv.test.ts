import { describe, expect, it } from "vitest";
import { buildCatalogueCsv, csvCell } from "@/lib/catalogue/csv";
import type { CatalogueBook } from "@/lib/catalogue/types";

describe("csvCell", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('A "big", day')).toBe('"A ""big"", day"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });
  it("neutralises spreadsheet formulas", () => {
    for (const evil of ["=HYPERLINK(\"http://x\")", "+1+1", "-2", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      expect(csvCell(evil).replace(/^"/, "")).toMatch(/^'/);
    }
  });
  it("renders null and numbers plainly", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(42)).toBe("42");
  });
});

const book = {
  id: "1", title: "=Moons", slug: "moons", subtitle: null, description: null, cover_image_url: null, cover_image_alt: null,
  age_min_months: 36, age_max_months: 72, is_featured: false, publication_date: null, created_at: "", skills: [], subjects: [], reviews: [],
  contributors: [{ role: "author", display_order: 0, author: { id: "a", name: "Asha Rao", slug: "asha" } }],
  editions: [
    { id: "e1", format: "paperback", language: "en", isbn13: "9780306406157", publication_date: null, page_count: null, availability: "available", is_primary: true, publisher: { id: "p", name: "Pub", slug: "pub" }, channels: [] },
  ],
} as unknown as CatalogueBook;

describe("buildCatalogueCsv", () => {
  it("emits a header, one row per edition, a BOM and no prices", () => {
    const csv = buildCatalogueCsv([book]);
    expect(csv.startsWith("﻿Title,")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("'=Moons");
    expect(lines[1]).toContain("9780306406157");
    expect(lines[0].toLowerCase()).not.toContain("price");
  });
});
