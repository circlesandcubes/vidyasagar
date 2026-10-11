import Link from "next/link";
import type { Book } from "@/lib/books";

export function BookCard({ book, index }: { book: Book; index: number }) {
  return (
    <article className="book-card">
      <Link className="book-card-link" href={`/books/${book.slug}`}>
        <span className="book-card-index" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="book-card-copy">
          <span className="book-card-title">{book.title}</span>
          {book.subtitle && <span className="book-card-subtitle">{book.subtitle}</span>}
          {book.description && <span className="book-card-description">{book.description}</span>}
        </span>
        <span className="book-card-arrow" aria-hidden="true">↗</span>
      </Link>
    </article>
  );
}
