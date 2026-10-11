import Link from "next/link";
import { BookCover } from "@/components/book-cover";
import { VerificationBadges } from "@/components/verification-badges";
import { formatAgeRange } from "@/lib/catalogue/ages";
import { summariseVerification } from "@/lib/catalogue/verification";
import type { CatalogueBook } from "@/lib/catalogue/types";

export function bylineFor(book: CatalogueBook): string | null {
  const authors = book.contributors.filter((c) => c.role === "author").map((c) => c.author.name);
  return authors.length ? authors.join(", ") : null;
}

export function BookCard({ book, priority = false }: { book: CatalogueBook; priority?: boolean }) {
  const byline = bylineFor(book);
  const age = formatAgeRange(book.age_min_months, book.age_max_months);
  const verification = summariseVerification(book.reviews);
  const skills = book.skills.filter((s) => s.is_approved).slice(0, 2);

  return (
    <article className="book-tile">
      <Link className="book-tile-link" href={`/books/${book.slug}`}>
        <span className="book-tile-cover">
          <BookCover book={book} priority={priority} />
        </span>
        <span className="book-tile-copy">
          <span className="book-tile-title">{book.title}</span>
          {book.subtitle && <span className="book-tile-meta">{book.subtitle}</span>}
          {byline && <span className="book-tile-meta">by {byline}</span>}
          {age && <span className="book-tile-age">{age}</span>}
        </span>
      </Link>
      {(verification.types.length > 0 || skills.length > 0) && (
        <div className="book-tile-extras">
          <VerificationBadges types={verification.types} />
          {skills.length > 0 && (
            <ul className="chip-list" aria-label="Skills">
              {skills.map((s) => (
                <li key={s.skill.id}>
                  <Link className="chip" href={`/skills/${s.skill.slug}`}>
                    {s.skill.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

export function BookGrid({ books, empty }: { books: CatalogueBook[]; empty: string }) {
  if (books.length === 0) return <p className="empty-state">{empty}</p>;
  return (
    <div className="tile-grid">
      {books.map((book, index) => (
        <BookCard key={book.id} book={book} priority={index < 2} />
      ))}
    </div>
  );
}
