import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createBookMetadata } from "@/lib/book-metadata";
import { queryPublishedBookBySlug } from "@/lib/books";
import type { Database } from "@/lib/database.types";

vi.mock("server-only", () => ({}));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

describe.skipIf(!supabaseConfigured)("Supabase public catalogue integration", () => {
  it("keeps seeded drafts private and their metadata non-indexable", async () => {
    const client = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
    const { data, error } = await client.from("books").select("slug,status");

    expect(error).toBeNull();
    expect(data?.every((book) => book.status === "published")).toBe(true);
    expect(data?.map((book) => book.slug)).not.toContain("how-many-planets");
    expect(data?.map((book) => book.slug)).not.toContain("how-many-moons-for-earth");

    const draftLookup = await queryPublishedBookBySlug(client, "how-many-planets");
    expect(draftLookup).toBeNull();
    expect(createBookMetadata(draftLookup)).toMatchObject({
      robots: { index: false, follow: false },
    });
  });
});
