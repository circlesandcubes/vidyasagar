import { describe, expect, it } from "vitest";
import { collectionBookSchema, collectionSchema, skillSchema } from "@/lib/validation/taxonomy";

describe("taxonomy validation", () => {
  it("accepts a valid skill and defaults the order", () => {
    const r = skillSchema.parse({ name: "Counting", slug: "counting" });
    expect(r.displayOrder).toBe(0);
    expect(r.isPublished).toBe(false);
  });
  it("rejects malformed slugs", () => {
    for (const bad of ["Has Space", "UPPER", "-lead", "trail-", "a--b", ""]) expect(skillSchema.safeParse({ name: "x", slug: bad }).success, bad).toBe(false);
  });
  it("keeps collections unpublished unless asked", () => {
    expect(collectionSchema.parse({ title: "Monsoon reads", slug: "monsoon" }).isPublished).toBe(false);
    expect(collectionSchema.parse({ title: "t", slug: "t", isPublished: "on" }).isPublished).toBe(true);
  });
  it("requires a real book id for collection entries", () => {
    expect(collectionBookSchema.safeParse({ bookId: "nope" }).success).toBe(false);
    expect(collectionBookSchema.parse({ bookId: "7c9e6679-7425-40de-944b-e07fc1f90ae7" }).position).toBe(0);
  });
});
