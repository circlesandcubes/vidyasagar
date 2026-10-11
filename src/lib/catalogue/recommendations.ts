import { bookMatchesAgeGroup } from "@/lib/catalogue/ages";
import type { AgeGroup, CatalogueBook } from "@/lib/catalogue/types";

export type Interests = {
  skillIds: ReadonlySet<string>;
  ageGroups: readonly AgeGroup[];
};

export type Recommendation = {
  book: CatalogueBook;
  score: number;
  /** Plain-language reasons. A recommendation without reasons is never returned. */
  reasons: string[];
};

const RELATION_WEIGHT = { practised: 3, supported: 2, incidental: 1 } as const;

/**
 * Transparent, rule-based recommendations: a book scores for approved skill
 * links that match a chosen interest (a link to a child skill also matches its
 * parent) and for an age range that overlaps a chosen age group. No behavioural
 * tracking, no hidden weighting — every point comes with a stated reason.
 */
export function recommendBooks(
  books: readonly CatalogueBook[],
  interests: Interests,
  options: { excludeBookIds?: ReadonlySet<string>; limit?: number } = {},
): Recommendation[] {
  const exclude = options.excludeBookIds ?? new Set<string>();
  const results: Recommendation[] = [];

  for (const book of books) {
    if (exclude.has(book.id)) continue;
    let score = 0;
    const reasons: string[] = [];

    const seen = new Set<string>();
    for (const link of book.skills) {
      if (!link.is_approved) continue;
      const matchedId = interests.skillIds.has(link.skill.id)
        ? link.skill.id
        : link.skill.parent_id && interests.skillIds.has(link.skill.parent_id)
          ? link.skill.parent_id
          : null;
      if (!matchedId || seen.has(matchedId)) continue;
      seen.add(matchedId);
      score += RELATION_WEIGHT[link.relation];
      reasons.push(`Supports your interest in ${link.skill.name} (${link.relation}).`);
    }

    const group = interests.ageGroups.find((g) => bookMatchesAgeGroup(book, g));
    if (group) {
      score += 2;
      reasons.push(`Suggested for ${group.name} (age guidance is indicative).`);
    }

    // Age alone is not enough when the customer also chose skills: it would
    // recommend unrelated books purely by age.
    const hasSkillMatch = seen.size > 0;
    if (interests.skillIds.size > 0 && !hasSkillMatch) continue;
    if (reasons.length > 0) results.push({ book, score, reasons });
  }

  results.sort((a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title));
  return options.limit ? results.slice(0, options.limit) : results;
}
