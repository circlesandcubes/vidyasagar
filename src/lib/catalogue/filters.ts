import { z } from "zod";
import { bookMatchesAgeGroup } from "@/lib/catalogue/ages";
import { hasExternalPurchaseOption } from "@/lib/catalogue/purchase";
import { findSkillNode, skillIdsWithDescendants } from "@/lib/catalogue/skills";
import type { SkillNode } from "@/lib/catalogue/skills";
import { VERIFICATION_TYPES, summariseVerification } from "@/lib/catalogue/verification";
import type {
  AgeGroup,
  BookFormat,
  CatalogueBook,
  EditionAvailability,
  VerificationType,
} from "@/lib/catalogue/types";

export const PAGE_SIZE = 12;

// Only sorts backed by real data are offered. Price sorting arrives with pricing.
export const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "title", label: "Title" },
] as const;

export const FORMAT_LABELS: Record<BookFormat, string> = {
  paperback: "Paperback",
  hardcover: "Hardcover",
  board_book: "Board book",
  ebook: "E-book",
  other: "Other format",
};

export const AVAILABILITY_LABELS: Record<EditionAvailability, string> = {
  available: "Available",
  preorder: "Pre-order",
  out_of_print: "Out of print",
  unavailable: "Currently unavailable",
};

export const CHANNEL_FILTERS = [
  { value: "amazon", label: "Available on Amazon" },
  { value: "flipkart", label: "Available on Flipkart" },
] as const;

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);
const optionalText = z.preprocess((value) => {
  const v = firstValue(value);
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : undefined;
}, z.string().optional());
// preprocess() erases the enum type, so it is restored explicitly: an invalid
// value becomes undefined (i.e. "no filter") rather than an error.
function optionalEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(firstValue, z.enum(values).optional().catch(undefined)) as unknown as z.ZodType<
    T[number] | undefined
  >;
}

const filtersSchema = z.object({
  q: optionalText,
  age: optionalText,
  skill: optionalText,
  author: optionalText,
  publisher: optionalText,
  language: optionalText,
  format: optionalEnum(["paperback", "hardcover", "board_book", "ebook", "other"]),
  verification: optionalEnum([
    "author_approved",
    "publisher_approved",
    "fact_checked",
    "expert_reviewed",
    "educator_reviewed",
    "story_and_imagination",
  ]),
  channel: optionalEnum(["amazon", "flipkart"]),
  availability: optionalEnum(["available", "preorder", "out_of_print", "unavailable"]),
  sort: z.preprocess(firstValue, z.enum(["relevance", "newest", "title"]).catch("relevance")),
  page: z.preprocess((value) => Number(firstValue(value)), z.number().int().min(1).max(1000).catch(1)),
});

export type CatalogueFilters = z.infer<typeof filtersSchema>;

export type SearchParams = Record<string, string | string[] | undefined>;

/** Parses untrusted query-string input; anything invalid falls back to a default. */
export function parseFilters(params: SearchParams): CatalogueFilters {
  return filtersSchema.parse(params);
}

export interface FilterContext {
  ageGroups: AgeGroup[];
  skillTree: SkillNode[];
}

function searchTokens(q: string | undefined): string[] {
  return (q ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function searchScore(book: CatalogueBook, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const title = book.title.toLowerCase();
  const subtitle = (book.subtitle ?? "").toLowerCase();
  const people = book.contributors.map((c) => c.author.name.toLowerCase()).join(" ");
  const topics = [
    ...book.skills.filter((s) => s.is_approved).map((s) => s.skill.name),
    ...book.subjects.map((s) => s.name),
  ]
    .join(" ")
    .toLowerCase();
  const description = (book.description ?? "").toLowerCase();

  let score = 0;
  for (const token of tokens) {
    const tokenScore =
      (title.includes(token) ? 4 : 0) +
      (subtitle.includes(token) ? 2 : 0) +
      (people.includes(token) ? 2 : 0) +
      (topics.includes(token) ? 1 : 0) +
      (description.includes(token) ? 1 : 0);
    // Every word must match somewhere.
    if (tokenScore === 0) return 0;
    score += tokenScore;
  }
  return score;
}

export function applyFilters(books: CatalogueBook[], filters: CatalogueFilters, ctx: FilterContext): CatalogueBook[] {
  const tokens = searchTokens(filters.q);
  const ageGroup = filters.age ? ctx.ageGroups.find((g) => g.slug === filters.age) : undefined;
  const skillNode = filters.skill ? findSkillNode(ctx.skillTree, filters.skill) : null;
  const skillIds = skillNode ? skillIdsWithDescendants(skillNode) : null;

  return books.filter((book) => {
    if (tokens.length > 0 && searchScore(book, tokens) === 0) return false;
    // An unknown age group or skill slug matches nothing rather than everything.
    if (filters.age && (!ageGroup || !bookMatchesAgeGroup(book, ageGroup))) return false;
    if (filters.skill && (!skillIds || !book.skills.some((s) => s.is_approved && skillIds.has(s.skill.id)))) {
      return false;
    }
    if (filters.author && !book.contributors.some((c) => c.author.slug === filters.author)) return false;
    if (filters.publisher && !book.editions.some((e) => e.publisher?.slug === filters.publisher)) return false;
    if (filters.language && !book.editions.some((e) => e.language === filters.language)) return false;
    if (filters.format && !book.editions.some((e) => e.format === filters.format)) return false;
    if (filters.availability && !book.editions.some((e) => e.availability === filters.availability)) return false;
    if (filters.channel && !hasExternalPurchaseOption(book.editions, filters.channel)) return false;
    if (filters.verification && !summariseVerification(book.reviews).types.includes(filters.verification)) {
      return false;
    }
    return true;
  });
}

export function sortBooks(books: CatalogueBook[], filters: CatalogueFilters): CatalogueBook[] {
  const tokens = searchTokens(filters.q);
  const sorted = [...books];
  const byTitle = (a: CatalogueBook, b: CatalogueBook) => a.title.localeCompare(b.title);

  if (filters.sort === "newest") {
    return sorted.sort(
      (a, b) =>
        (b.publication_date ?? "").localeCompare(a.publication_date ?? "") ||
        b.created_at.localeCompare(a.created_at) ||
        byTitle(a, b),
    );
  }
  if (filters.sort === "relevance" && tokens.length > 0) {
    return sorted.sort((a, b) => searchScore(b, tokens) - searchScore(a, tokens) || byTitle(a, b));
  }
  return sorted.sort(byTitle);
}

export interface Page<T> {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
}

export function paginate<T>(items: T[], page: number, pageSize = PAGE_SIZE): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  return { items: items.slice((current - 1) * pageSize, current * pageSize), page: current, pageCount, total };
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
  depth?: number;
}

export interface Facets {
  ages: FacetOption[];
  skills: FacetOption[];
  authors: FacetOption[];
  publishers: FacetOption[];
  formats: FacetOption[];
  languages: FacetOption[];
  verification: FacetOption[];
  channels: FacetOption[];
  availability: FacetOption[];
}

function languageLabel(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function countBy<T>(books: CatalogueBook[], valuesOf: (book: CatalogueBook) => T[], label: (value: T) => [string, string]) {
  const counts = new Map<string, FacetOption>();
  for (const book of books) {
    const seen = new Set<string>();
    for (const value of valuesOf(book)) {
      const [key, text] = label(value);
      if (seen.has(key)) continue;
      seen.add(key);
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { value: key, label: text, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Filter options are derived from real published data, so a filter only
 * appears when at least one book can match it.
 */
export function buildFacets(books: CatalogueBook[], ctx: FilterContext): Facets {
  const ages = ctx.ageGroups
    .map((group) => ({
      value: group.slug,
      label: group.name,
      count: books.filter((b) => bookMatchesAgeGroup(b, group)).length,
    }))
    .filter((option) => option.count > 0);

  const skills: FacetOption[] = [];
  const walk = (nodes: SkillNode[], depth: number) => {
    for (const node of nodes) {
      const ids = skillIdsWithDescendants(node);
      const count = books.filter((b) => b.skills.some((s) => s.is_approved && ids.has(s.skill.id))).length;
      if (count > 0) skills.push({ value: node.slug, label: node.name, count, depth });
      walk(node.children, depth + 1);
    }
  };
  walk(ctx.skillTree, 0);

  const channelOptions: FacetOption[] = CHANNEL_FILTERS.map((channel) => ({
    value: channel.value,
    label: channel.label,
    count: books.filter((b) => hasExternalPurchaseOption(b.editions, channel.value)).length,
  })).filter((option) => option.count > 0);

  return {
    ages,
    skills,
    authors: countBy(books, (b) => b.contributors, (c) => [c.author.slug, c.author.name]),
    publishers: countBy(
      books,
      (b) => b.editions.flatMap((e) => (e.publisher ? [e.publisher] : [])),
      (p) => [p.slug, p.name],
    ),
    formats: countBy(books, (b) => b.editions, (e) => [e.format, FORMAT_LABELS[e.format]]),
    languages: countBy(books, (b) => b.editions, (e) => [e.language, languageLabel(e.language)]),
    verification: countBy(
      books,
      (b) => summariseVerification(b.reviews).types,
      (type: VerificationType) => [type, VERIFICATION_TYPES[type].label],
    ),
    channels: channelOptions,
    availability: countBy(books, (b) => b.editions, (e) => [e.availability, AVAILABILITY_LABELS[e.availability]]),
  };
}

const DEFAULT_SORT = "relevance";

/** Builds a query string for links, omitting defaults so URLs stay clean. */
export function filtersToQuery(filters: Partial<CatalogueFilters>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") continue;
    if (key === "sort" && value === DEFAULT_SORT) continue;
    if (key === "page" && value === 1) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
