import { formatAgeRange } from "@/lib/catalogue/ages";
import type { CatalogueBook } from "@/lib/catalogue/types";
import { absoluteUrl } from "@/lib/site";

/**
 * CSV cell escaping with spreadsheet-formula protection: a cell that starts with
 * = + - @ (or tab/CR) is prefixed with an apostrophe so Excel/Sheets never run it.
 */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export const CATALOGUE_CSV_HEADER = ["Title", "Subtitle", "Authors", "Illustrators", "Publisher", "ISBN-13", "Format", "Language", "Availability", "Age range", "Page"];

export function catalogueRows(books: CatalogueBook[]): string[][] {
  const rows: string[][] = [];
  for (const book of books) {
    const names = (role: string) => book.contributors.filter((c) => c.role === role).map((c) => c.author.name).join("; ");
    const editions = book.editions.length > 0 ? book.editions : [null];
    for (const edition of editions) {
      rows.push([
        book.title, book.subtitle ?? "", names("author"), names("illustrator"), edition?.publisher?.name ?? "",
        edition?.isbn13 ?? "", edition?.format ?? "", edition?.language ?? "", edition?.availability ?? "",
        formatAgeRange(book.age_min_months, book.age_max_months) ?? "", absoluteUrl(`/books/${book.slug}`),
      ]);
    }
  }
  return rows;
}

export function buildCatalogueCsv(books: CatalogueBook[]): string {
  const lines = [CATALOGUE_CSV_HEADER, ...catalogueRows(books)].map((row) => row.map(csvCell).join(","));
  // UTF-8 BOM so Excel reads Devanagari and other scripts correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}
