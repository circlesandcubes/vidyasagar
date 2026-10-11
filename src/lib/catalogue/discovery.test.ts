import { describe, expect, it } from "vitest";
import { bookMatchesAgeGroup, formatAgeRange } from "@/lib/catalogue/ages";
import { makeAgeGroup, makeBook, makeSkill, makeSkillLink } from "@/lib/catalogue/fixtures";
import { buildSkillTree, findSkillNode, groupBookSkills, skillIdsWithDescendants } from "@/lib/catalogue/skills";

describe("skills taxonomy", () => {
  const skills = [
    makeSkill({ id: "num", slug: "numeracy", name: "Numeracy", display_order: 2 }),
    makeSkill({ id: "lang", slug: "language", name: "Language", display_order: 1 }),
    makeSkill({ id: "count", slug: "counting", name: "Counting", parent_id: "num", display_order: 1 }),
    makeSkill({ id: "shapes", slug: "shapes", name: "Shapes", parent_id: "num", display_order: 2 }),
    makeSkill({ id: "orphan", slug: "orphan", name: "Orphan", parent_id: "missing-unpublished-parent", display_order: 3 }),
  ];

  it("builds an ordered hierarchy", () => {
    const tree = buildSkillTree(skills);
    expect(tree.map((n) => n.slug)).toEqual(["language", "numeracy", "orphan"]);
    expect(findSkillNode(tree, "numeracy")?.children.map((n) => n.slug)).toEqual(["counting", "shapes"]);
  });

  it("keeps a skill visible at top level when its parent is unpublished", () => {
    expect(buildSkillTree(skills).map((n) => n.slug)).toContain("orphan");
  });

  it("includes descendants when matching a parent skill", () => {
    const node = findSkillNode(buildSkillTree(skills), "numeracy")!;
    expect([...skillIdsWithDescendants(node)].sort()).toEqual(["count", "num", "shapes"]);
  });

  it("groups only approved skill links, from most to least direct", () => {
    const groups = groupBookSkills([
      makeSkillLink({ relation: "incidental", skill: { id: "a", parent_id: null, name: "A", slug: "a" } }),
      makeSkillLink({ relation: "practised", skill: { id: "b", parent_id: null, name: "B", slug: "b" } }),
      makeSkillLink({ relation: "supported", is_approved: false, skill: { id: "c", parent_id: null, name: "C", slug: "c" } }),
    ]);
    expect(groups.map((g) => g.relation)).toEqual(["practised", "incidental"]);
  });
});

describe("age groups", () => {
  const twoToFour = makeAgeGroup();

  it("matches books whose recommended range overlaps the group", () => {
    expect(bookMatchesAgeGroup(makeBook({ age_min_months: 36, age_max_months: 72 }), twoToFour)).toBe(true);
    expect(bookMatchesAgeGroup(makeBook({ age_min_months: 60, age_max_months: 96 }), twoToFour)).toBe(false);
    expect(bookMatchesAgeGroup(makeBook({ age_min_months: 0, age_max_months: 24 }), twoToFour)).toBe(true);
  });

  it("does not guess an age for books without a recommended range", () => {
    expect(bookMatchesAgeGroup(makeBook(), twoToFour)).toBe(false);
  });

  it("formats ranges for display", () => {
    expect(formatAgeRange(null, null)).toBeNull();
    expect(formatAgeRange(0, 18)).toBe("0–18 months");
    expect(formatAgeRange(36, 72)).toBe("Ages 3–6");
    expect(formatAgeRange(48, 59)).toBe("Age 4");
    expect(formatAgeRange(96, 216)).toBe("Ages 8+");
  });
});
