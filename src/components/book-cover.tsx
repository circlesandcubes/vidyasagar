import type { CatalogueBook } from "@/lib/catalogue/types";

/**
 * Shows the real cover when one exists. Otherwise a typographic placeholder is
 * drawn — it is decorative (aria-hidden) so the title is not announced twice.
 *
 * A plain <img> is used because cover hosts are not fixed yet; move to
 * next/image once the storage host is configured in next.config.ts.
 */
export function BookCover({ book, priority = false }: { book: CatalogueBook; priority?: boolean }) {
  if (book.cover_image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="cover-image"
        src={book.cover_image_url}
        alt={book.cover_image_alt ?? `Cover of ${book.title}`}
        width={300}
        height={400}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
      />
    );
  }
  return (
    <div className="cover-placeholder" aria-hidden="true">
      <span>{book.title}</span>
    </div>
  );
}
