import { describe, expect, it } from "vitest";
import { makeAgeGroup, makeBook, makeChannel, makeEdition, makeReview, makeSkill, makeSkillLink } from "@/lib/catalogue/fixtures";
import { applyFilters, buildFacets, filtersToQuery, paginate, parseFilters, sortBooks } from "@/lib/catalogue/filters";
import type { FilterContext } from "@/lib/catalogue/filters";
import { buildSkillTree } from "@/lib/catalogue/skills";

const skills = [
  makeSkill({ id: "num", slug: "numeracy", name: "Numeracy" }),
  makeSkill({ id: "count", slug: "counting", name: "Counting", parent_id: "num" }),
  makeSkill({ id: "space", slug: "space-and-astronomy", name: "Space and astronomy" }),
];

const ctx: FilterContext = {
  ageGroups: [
    makeAgeGroup(),
    makeAgeGroup({ id: "age-2", name: "Ages 6–8", slug: "ages-6-8", min_months: 72, max_months: 107 }),
  ],
  skillTree: buildSkillTree(skills),
};

const planets = makeBook({
  id: "planets",
  title: "How Many Planets?",
  slug: "how-many-planets",
  description: "Counting the planets of the solar system.",
  age_min_months: 36,
  age_max_months: 72,
  publication_date: "2026-03-01",
  contributors: [{ role: "author", display_order: 0, author: { id: "a1", name: "Ojas", slug: "ojas" } }],
  editions: [
    makeEdition({
      format: "paperback",
      language: "en",
      publisher: { id: "p1", name: "Example Press", slug: "example-press" },
      channels: [makeChannel()],
    }),
  ],
  skills: [
    makeSkillLink({ skill: { id: "count", parent_id: "num", name: "Counting", slug: "counting" }, explanation: "Counts planets." }),
  ],
  reviews: [makeReview({ review_type: "fact_checked", sources: [{ title: "NASA", url: null }] })],
});

const moons = makeBook({
  id: "moons",
  title: "A Book About Moons",
  slug: "moons",
  description: "Moons of many worlds.",
  age_min_months: 84,
  age_max_months: 120,
  publication_date: "2025-01-01",
  editions: [makeEdition({ id: "e2", format: "hardcover", language: "hi", availability: "preorder" })],
  skills: [
    makeSkillLink({
      relation: "supported",
      is_approved: false,
      skill: { id: "space", parent_id: null, name: "Space and astronomy", slug: "space-and-astronomy" },
    }),
  ],
});

const books = [planets, moons];
const run = (params: Record<string, string>) => applyFilters(books, parseFilters(params), ctx).map((b) => b.id);

describe("parsing untrusted filters", () => {
  it("falls back to safe defaults for invalid input", () => {
    const filters = parseFilters({ sort: "price_asc", page: "-3", format: "<script>", verification: "bogus" });
    expect(filters.sort).toBe("relevance");
    expect(filters.page).toBe(1);
    expect(filters.format).toBeUndefined();
    expect(filters.verification).toBeUndefined();
  });

  it("uses the first value of repeated parameters and trims text", () => {
    expect(parseFilters({ q: ["  moons ", "ignored"] }).q).toBe("moons");
    expect(parseFilters({ q: "   " }).q).toBeUndefined();
    expect(parseFilters({ q: "x".repeat(500) }).q).toHaveLength(100);
  });
});

describe("catalogue filtering", () => {
  it("returns everything when no filter is set", () => {
    expect(run({})).toEqual(["planets", "moons"]);
  });

  it("searches titles, descriptions and contributor names, requiring every word", () => {
    expect(run({ q: "planets" })).toEqual(["planets"]);
    expect(run({ q: "ojas" })).toEqual(["planets"]);
    expect(run({ q: "moons many" })).toEqual(["moons"]);
    expect(run({ q: "planets moons" })).toEqual([]);
  });

  it("filters by age group using range overlap", () => {
    expect(run({ age: "ages-2-4" })).toEqual(["planets"]);
    expect(run({ age: "ages-6-8" })).toEqual(["planets", "moons"]);
  });

  it("matches nothing for an unknown age or skill slug instead of everything", () => {
    expect(run({ age: "does-not-exist" })).toEqual([]);
    expect(run({ skill: "does-not-exist" })).toEqual([]);
  });

  it("filters by skill, including parent skills, and ignores unapproved links", () => {
    expect(run({ skill: "counting" })).toEqual(["planets"]);
    expect(run({ skill: "numeracy" })).toEqual(["planets"]);
    expect(run({ skill: "space-and-astronomy" })).toEqual([]);
  });

  it("filters by author, publisher, format, language and availability", () => {
    expect(run({ author: "ojas" })).toEqual(["planets"]);
    expect(run({ publisher: "example-press" })).toEqual(["planets"]);
    expect(run({ format: "hardcover" })).toEqual(["moons"]);
    expect(run({ language: "hi" })).toEqual(["moons"]);
    expect(run({ availability: "preorder" })).toEqual(["moons"]);
  });

  it("filters by verification type and purchase channel", () => {
    expect(run({ verification: "fact_checked" })).toEqual(["planets"]);
    expect(run({ verification: "author_approved" })).toEqual([]);
    expect(run({ channel: "amazon" })).toEqual(["planets"]);
    expect(run({ channel: "flipkart" })).toEqual([]);
  });
});

describe("sorting and pagination", () => {
  it("sorts by title and by newest", () => {
    expect(sortBooks(books, parseFilters({ sort: "title" })).map((b) => b.id)).toEqual(["moons", "planets"]);
    expect(sortBooks(books, parseFilters({ sort: "newest" })).map((b) => b.id)).toEqual(["planets", "moons"]);
  });

  it("ranks title matches above description matches when searching", () => {
    const inTitle = makeBook({ id: "t", title: "Stars Above", description: "Night sky." });
    const inDescription = makeBook({ id: "d", title: "Night Walk", description: "We look at the stars." });
    const sorted = sortBooks([inDescription, inTitle], parseFilters({ q: "stars" }));
    expect(sorted.map((b) => b.id)).toEqual(["t", "d"]);
  });

  it("paginates and clamps out-of-range pages", () => {
    const many = Array.from({ length: 25 }, (_, i) => i);
    expect(paginate(many, 1, 12)).toMatchObject({ page: 1, pageCount: 3, total: 25 });
    expect(paginate(many, 3, 12).items).toHaveLength(1);
    expect(paginate(many, 99, 12).page).toBe(3);
    expect(paginate([], 1)).toMatchObject({ page: 1, pageCount: 1, total: 0 });
  });
});

describe("filter facets", () => {
  it("offers only options backed by real data", () => {
    const facets = buildFacets(books, ctx);
    expect(facets.formats.map((o) => o.value)).toEqual(["hardcover", "paperback"]);
    expect(facets.channels.map((o) => o.value)).toEqual(["amazon"]);
    expect(facets.verification.map((o) => o.value)).toEqual(["fact_checked"]);
    expect(facets.skills.map((o) => o.value)).toEqual(["numeracy", "counting"]);
    expect(facets.skills.find((o) => o.value === "space-and-astronomy")).toBeUndefined();
  });

  it("offers no filters for an empty catalogue", () => {
    const facets = buildFacets([], ctx);
    expect(Object.values(facets).every((options) => options.length === 0)).toBe(true);
  });
});

describe("filter links", () => {
  it("omits defaults so URLs stay clean", () => {
    expect(filtersToQuery({ sort: "relevance", page: 1 })).toBe("");
    expect(filtersToQuery({ q: "moons", page: 2, sort: "title" })).toBe("?q=moons&page=2&sort=title");
  });
});
