import { describe, expect, it, vi } from "vitest";
import { normaliseBook } from "@/lib/catalogue/normalise";
import { fetchPublishedBookBySlug, fetchPublishedBooks } from "@/lib/catalogue/queries";
import type { CatalogueClient } from "@/lib/catalogue/queries";

function makeClient(result: { data: unknown; error: { message: string } | null }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockResolvedValue(result);
  query.maybeSingle.mockResolvedValue(result);
  const client = { from: vi.fn(() => query) } as unknown as CatalogueClient;
  return { client, query };
}

const rawBook = {
  id: "b1",
  title: "How Many Planets?",
  slug: "how-many-planets",
  subtitle: null,
  description: "A description.",
  cover_image_url: null,
  cover_image_alt: null,
  age_min_months: null,
  age_max_months: null,
  is_featured: false,
  publication_date: null,
  created_at: "2026-01-01T00:00:00Z",
  book_contributors: [
    // An author hidden by row-level security arrives as null and must be dropped.
    { role: "author", display_order: 0, authors: null },
    { role: "author", display_order: 1, authors: { id: "a1", name: "Ojas", slug: "ojas" } },
  ],
  book_editions: [
    {
      id: "e1",
      format: "paperback",
      language: "en",
      isbn13: null,
      publication_date: null,
      page_count: null,
      availability: "available",
      is_primary: true,
      publishers: null,
      edition_purchase_channels: [],
    },
  ],
  book_skills: [{ relation: "practised", explanation: "x", is_approved: true, skills: null }],
  book_subjects: [{ subjects: null }],
  verification_reviews: [],
};

describe("published book queries", () => {
  it("reads only published books and orders them by title", async () => {
    const { client, query } = makeClient({ data: [rawBook], error: null });

    const books = await fetchPublishedBooks(client);

    expect(client.from).toHaveBeenCalledWith("books");
    expect(query.eq).toHaveBeenCalledWith("status", "published");
    expect(query.order).toHaveBeenCalledWith("title", { ascending: true });
    expect(books).toHaveLength(1);
    expect(books[0].title).toBe("How Many Planets?");
  });

  it("filters drafts out of slug lookups", async () => {
    const { client, query } = makeClient({ data: null, error: null });

    await expect(fetchPublishedBookBySlug(client, "how-many-planets")).resolves.toBeNull();

    expect(query.eq).toHaveBeenNthCalledWith(1, "status", "published");
    expect(query.eq).toHaveBeenNthCalledWith(2, "slug", "how-many-planets");
    expect(query.maybeSingle).toHaveBeenCalledOnce();
  });

  it("propagates database errors instead of presenting a false empty catalogue", async () => {
    const { client } = makeClient({ data: null, error: { message: "database unavailable" } });
    await expect(fetchPublishedBooks(client)).rejects.toThrow("database unavailable");
  });
});

describe("normalising embedded rows", () => {
  it("drops embedded rows the public cannot see", () => {
    const book = normaliseBook(rawBook);
    expect(book.contributors.map((c) => c.author.name)).toEqual(["Ojas"]);
    expect(book.editions[0].publisher).toBeNull();
    expect(book.skills).toEqual([]);
    expect(book.subjects).toEqual([]);
  });

  it("drops verification sources without a title and keeps others", () => {
    const book = normaliseBook({
      ...rawBook,
      verification_reviews: [
        {
          id: "r1",
          review_type: "fact_checked",
          scope: "Planet counts",
          sources: [{ title: "", url: "https://x.org" }, { title: "IAU", url: "https://iau.org" }],
          credentials_verified: false,
          publication_permission: true,
          admin_approved: true,
          status: "published",
        },
      ],
    });
    expect(book.reviews[0].sources).toEqual([{ title: "IAU", url: "https://iau.org" }]);
  });
});
