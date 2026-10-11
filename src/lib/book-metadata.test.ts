import { describe, expect, it } from "vitest";
import { createBookMetadata } from "@/lib/book-metadata";
import type { Book } from "@/lib/books";

const publishedBook: Book = {
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
  status: "published",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("book metadata", () => {
  it("generates title and description from published catalogue data", () => {
    expect(createBookMetadata(publishedBook)).toMatchObject({
      title: { absolute: "How Many Planets? | Vidyasagar" },
      description: "A published description.",
      openGraph: {
        title: "How Many Planets? | Vidyasagar",
        description: "A published description.",
      },
    });
  });

  it("marks unavailable and draft slugs as non-indexable", () => {
    expect(createBookMetadata(null)).toMatchObject({
      title: { absolute: "Book not found | Vidyasagar" },
      robots: { index: false, follow: false },
    });
  });
});
