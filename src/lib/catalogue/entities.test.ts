import { describe, expect, it } from "vitest";
import { booksForSkill, booksInCollection, listedAuthors, listedPublishers } from "@/lib/catalogue/entities";
import { makeBook, makeEdition, makeSkill, makeSkillLink } from "@/lib/catalogue/fixtures";
import { buildSkillTree, findSkillNode } from "@/lib/catalogue/skills";

const author = (id: string) => ({ id, name: id, slug: id, bio: null, image_url: null, image_alt: null, website_url: null });
const publisher = (id: string) => ({ id, name: id, slug: id, description: null, logo_url: null, logo_alt: null, website_url: null });

describe("public entity listing", () => {
  const book = makeBook({
    id: "b1",
    contributors: [{ role: "author", display_order: 0, author: { id: "a1", name: "A1", slug: "a1" } }],
    editions: [makeEdition({ publisher: { id: "p1", name: "P1", slug: "p1" } })],
  });

  it("lists authors and publishers only while a published book credits them", () => {
    expect(listedAuthors([author("a1"), author("a2")], [book]).map((a) => a.id)).toEqual(["a1"]);
    expect(listedPublishers([publisher("p1"), publisher("p2")], [book]).map((p) => p.id)).toEqual(["p1"]);
    expect(listedAuthors([author("a1")], [])).toEqual([]);
  });

  it("includes only published books in a collection", () => {
    const collection = {
      id: "c",
      title: "C",
      slug: "c",
      description: null,
      is_featured: false,
      display_order: 0,
      books: [
        { book_id: "b1", position: 1, curator_note: null },
        { book_id: "unpublished", position: 0, curator_note: null },
      ],
    };
    expect(booksInCollection(collection, [book]).map((b) => b.id)).toEqual(["b1"]);
  });
});

describe("books for a skill page", () => {
  const tree = buildSkillTree([
    makeSkill({ id: "num", slug: "numeracy" }),
    makeSkill({ id: "count", slug: "counting", parent_id: "num" }),
  ]);

  it("includes sub-skill links on the parent page and picks the most direct relationship", () => {
    const book = makeBook({
      skills: [
        makeSkillLink({
          relation: "incidental",
          explanation: "Weak.",
          skill: { id: "count", parent_id: "num", name: "Counting", slug: "counting" },
        }),
        makeSkillLink({
          relation: "practised",
          explanation: "Strong.",
          skill: { id: "num", parent_id: null, name: "Numeracy", slug: "numeracy" },
        }),
      ],
    });
    const entries = booksForSkill([book], findSkillNode(tree, "numeracy")!);
    expect(entries).toHaveLength(1);
    expect(entries[0].link.explanation).toBe("Strong.");
  });

  it("ignores unapproved links", () => {
    const book = makeBook({
      skills: [
        makeSkillLink({
          is_approved: false,
          skill: { id: "count", parent_id: "num", name: "Counting", slug: "counting" },
        }),
      ],
    });
    expect(booksForSkill([book], findSkillNode(tree, "counting")!)).toEqual([]);
  });
});
