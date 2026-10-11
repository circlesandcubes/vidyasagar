// LIVE integration test: runs only when a Supabase project with the migrations
// applied is configured. It is skipped otherwise, and skipping is not a pass.
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createBookMetadata } from "@/lib/book-metadata";
import { fetchPublishedBookBySlug, fetchPublishedBooks } from "@/lib/catalogue/queries";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

describe.skipIf(!url || !anonKey)("Supabase public catalogue (live)", () => {
  const client = () => createClient(url!, anonKey!);

  it("keeps seeded drafts private and their metadata non-indexable", async () => {
    const books = await fetchPublishedBooks(client());
    const slugs = books.map((b) => b.slug);
    expect(slugs).not.toContain("how-many-planets");
    expect(slugs).not.toContain("how-many-moons-for-earth");

    const draftLookup = await fetchPublishedBookBySlug(client(), "how-many-planets");
    expect(draftLookup).toBeNull();
    expect(createBookMetadata(draftLookup)).toMatchObject({ robots: { index: false, follow: false } });
  });

  it("cannot read private verification evidence", async () => {
    const { error } = await client().from("verification_evidence").select("*").limit(1);
    expect(error).not.toBeNull();
  });
});
