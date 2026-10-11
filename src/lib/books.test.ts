import { describe, expect, it, vi } from "vitest";
import { BOOK_COLUMNS, queryPublishedBookBySlug, queryPublishedBooks } from "@/lib/books";
import type { Book } from "@/lib/books";
import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

function makeBook(status: Book["status"]): Book {
  return {
    id: "book-id",
    title: "How Many Planets?",
    slug: "how-many-planets",
    subtitle: null,
    description: "A published description.",
    author: null,
    cover_image_url: null,
    isbn: null,
    price_cents: null,
    currency: null,
    publication_date: null,
    status,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function makeClient(data: Book[] | Book | null = [] as Book[]) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockResolvedValue({ data, error: null });
  query.maybeSingle.mockResolvedValue({ data, error: null });
  const client = { from: vi.fn(() => query) } as unknown as SupabaseClient<Database>;
  return { client, query };
}

describe("published book queries", () => {
  it("reads only published books and orders them by title", async () => {
    const publishedBook = makeBook("published");
    const { client, query } = makeClient([publishedBook]);

    await expect(queryPublishedBooks(client)).resolves.toEqual([publishedBook]);

    expect(client.from).toHaveBeenCalledWith("books");
    expect(query.select).toHaveBeenCalledWith(BOOK_COLUMNS);
    expect(query.eq).toHaveBeenCalledWith("status", "published");
    expect(query.order).toHaveBeenCalledWith("title", { ascending: true });
  });

  it("filters draft books from slug lookups", async () => {
    const { client, query } = makeClient(null);

    await expect(queryPublishedBookBySlug(client, "how-many-planets")).resolves.toBeNull();

    expect(query.eq).toHaveBeenNthCalledWith(1, "status", "published");
    expect(query.eq).toHaveBeenNthCalledWith(2, "slug", "how-many-planets");
    expect(query.maybeSingle).toHaveBeenCalledOnce();
  });

  it("propagates database errors instead of presenting a false empty catalogue", async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockResolvedValue({ data: null, error: new Error("database unavailable") });
    const client = { from: vi.fn(() => query) } as unknown as SupabaseClient<Database>;

    await expect(queryPublishedBooks(client)).rejects.toThrow("database unavailable");
  });
});
