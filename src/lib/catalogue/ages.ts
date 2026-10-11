import type { AgeGroup, CatalogueBook } from "@/lib/catalogue/types";

/** "Ages 3–6", "Ages 8+", or "0–18 months" for very young ranges. */
export function formatAgeRange(minMonths: number | null, maxMonths: number | null): string | null {
  if (minMonths === null || maxMonths === null) return null;
  if (maxMonths < 24) return `${minMonths}–${maxMonths} months`;
  const minYears = Math.floor(minMonths / 12);
  const maxYears = Math.floor(maxMonths / 12);
  if (maxYears >= 17) return `Ages ${minYears}+`;
  return minYears === maxYears ? `Age ${minYears}` : `Ages ${minYears}–${maxYears}`;
}

/** A book belongs to an age group when its recommended range overlaps the group's range. */
export function bookMatchesAgeGroup(book: Pick<CatalogueBook, "age_min_months" | "age_max_months">, group: AgeGroup): boolean {
  if (book.age_min_months === null || book.age_max_months === null) return false;
  return book.age_min_months <= group.max_months && book.age_max_months >= group.min_months;
}
