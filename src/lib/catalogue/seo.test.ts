import { describe, expect, it } from "vitest";
import { createBookMetadata, summarise } from "@/lib/book-metadata";
import { makeBook, makeEdition } from "@/lib/catalogue/fixtures";
import { bookJsonLd, jsonLdString } from "@/lib/catalogue/seo";

describe("book metadata", () => {
  const book = makeBook({ title: "How Many Planets?", slug: "how-many-planets", description: "A published description." });

  it("generates title, description and canonical URL from catalogue data", () => {
    expect(createBookMetadata(book)).toMatchObject({
      title: { absolute: "How Many Planets? | Vidyasagar" },
      description: "A published description.",
      alternates: { canonical: "/books/how-many-planets" },
      openGraph: { title: "How Many Planets? | Vidyasagar", type: "book" },
      twitter: { card: "summary" },
    });
  });

  it("uses the real cover for social previews only when one exists", () => {
    const withCover = createBookMetadata({ ...book, cover_image_url: "https://example.org/cover.jpg" });
    expect(withCover.twitter).toMatchObject({ card: "summary_large_image" });
    expect(withCover.openGraph).toMatchObject({ images: [{ url: "https://example.org/cover.jpg" }] });
    expect(createBookMetadata(book).openGraph).not.toHaveProperty("images");
  });

  it("marks missing and unpublished slugs as non-indexable", () => {
    expect(createBookMetadata(null)).toMatchObject({
      title: { absolute: "Book not found | Vidyasagar" },
      robots: { index: false, follow: false },
    });
  });

  it("shortens long descriptions on a word boundary", () => {
    const long = "word ".repeat(100);
    const short = summarise(long, 100);
    expect(short.length).toBeLessThanOrEqual(100);
    expect(short.endsWith("…")).toBe(true);
  });
});

describe("structured data", () => {
  it("includes only recorded facts", () => {
    const data = bookJsonLd(makeBook({ title: "Bare Book", slug: "bare-book", description: null, editions: [makeEdition()] }));
    expect(data["@type"]).toBe("Book");
    expect(data).not.toHaveProperty("isbn");
    expect(data).not.toHaveProperty("offers");
    expect(data).not.toHaveProperty("aggregateRating");
    expect(data).not.toHaveProperty("description");
  });

  it("adds authors and ISBN when recorded", () => {
    const data = bookJsonLd(
      makeBook({
        contributors: [
          { role: "author", display_order: 0, author: { id: "a", name: "Ojas", slug: "ojas" } },
          { role: "illustrator", display_order: 1, author: { id: "i", name: "Ila", slug: "ila" } },
        ],
        editions: [makeEdition({ isbn13: "9780306406157", language: "en" })],
      }),
    );
    expect(data.isbn).toBe("9780306406157");
    expect(data.author).toEqual([expect.objectContaining({ name: "Ojas" })]);
    expect(data.illustrator).toEqual([expect.objectContaining({ name: "Ila" })]);
  });

  it("escapes script-closing sequences", () => {
    const output = jsonLdString({ name: "</script><script>alert(1)</script>" });
    expect(output).not.toContain("</script>");
    expect(JSON.parse(output).name).toBe("</script><script>alert(1)</script>");
  });
});
