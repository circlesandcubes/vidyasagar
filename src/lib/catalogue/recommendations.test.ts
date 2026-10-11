import { describe, expect, it } from "vitest";
import { makeAgeGroup, makeBook, makeSkillLink } from "@/lib/catalogue/fixtures";
import { recommendBooks } from "@/lib/catalogue/recommendations";

const counting = { id: "count", parent_id: "num", name: "Counting", slug: "counting" };
const numeracy = { id: "num", parent_id: null, name: "Numeracy", slug: "numeracy" };

describe("recommendBooks", () => {
  const a = makeBook({ id: "a", title: "A", skills: [makeSkillLink({ relation: "practised", skill: counting })], age_min_months: 36, age_max_months: 72 });
  const b = makeBook({ id: "b", title: "B", skills: [makeSkillLink({ relation: "incidental", skill: counting })] });
  const c = makeBook({ id: "c", title: "C", skills: [makeSkillLink({ skill: { id: "other", parent_id: null, name: "Other", slug: "other" } })] });

  it("ranks by relation strength and states a reason for each match", () => {
    const out = recommendBooks([b, a, c], { skillIds: new Set(["count"]), ageGroups: [] });
    expect(out.map((r) => r.book.id)).toEqual(["a", "b"]);
    expect(out[0].reasons[0]).toContain("Counting");
    expect(out.every((r) => r.reasons.length > 0)).toBe(true);
  });

  it("matches a parent interest through a child skill link", () => {
    const out = recommendBooks([a], { skillIds: new Set(["num"]), ageGroups: [] });
    expect(out[0].reasons[0]).toContain("Counting");
  });

  it("ignores unapproved skill links", () => {
    const hidden = makeBook({ id: "h", skills: [makeSkillLink({ is_approved: false, skill: counting })] });
    expect(recommendBooks([hidden], { skillIds: new Set(["count"]), ageGroups: [] })).toEqual([]);
  });

  it("adds age matches, but does not recommend by age alone when skills were chosen", () => {
    const ageOnly = makeBook({ id: "age", age_min_months: 30, age_max_months: 60 });
    const group = makeAgeGroup();
    expect(recommendBooks([ageOnly], { skillIds: new Set(), ageGroups: [group] })).toHaveLength(1);
    expect(recommendBooks([ageOnly], { skillIds: new Set(["count"]), ageGroups: [group] })).toHaveLength(0);
    const out = recommendBooks([a], { skillIds: new Set(["count"]), ageGroups: [group] });
    expect(out[0].reasons).toHaveLength(2);
  });

  it("excludes saved books, honours the limit, and returns nothing without interests", () => {
    expect(recommendBooks([a, b], { skillIds: new Set(["count"]), ageGroups: [] }, { excludeBookIds: new Set(["a"]) }).map((r) => r.book.id)).toEqual(["b"]);
    expect(recommendBooks([a, b], { skillIds: new Set(["count"]), ageGroups: [] }, { limit: 1 })).toHaveLength(1);
    expect(recommendBooks([a, b], { skillIds: new Set(), ageGroups: [] })).toEqual([]);
    void numeracy;
  });
});
