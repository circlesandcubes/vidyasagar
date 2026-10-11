import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createBookMetadata } from "@/lib/book-metadata";
import { getPublishedBookBySlug } from "@/lib/books";

export const dynamic = "force-dynamic";

type BookPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const { slug } = await params;
  return createBookMetadata(await getPublishedBookBySlug(slug));
}

export default async function BookPage({ params }: BookPageProps) {
  const { slug } = await params;
  const book = await getPublishedBookBySlug(slug);

  if (!book) notFound();

  return (
    <main id="main-content" className="detail-main">
      <article className="detail-shell">
        <Link className="back-link" href="/books">← All books</Link>
        <p className="eyebrow">From the catalogue</p>
        <h1 className="detail-title">{book.title}</h1>
        {book.subtitle && <p className="detail-subtitle">{book.subtitle}</p>}
        <hr className="detail-rule" />
        {book.description && <p className="detail-description">{book.description}</p>}
        <div className="detail-facts">
          {book.author && <span>Words by {book.author}</span>}
          {book.publication_date && <time dateTime={book.publication_date}>{book.publication_date}</time>}
          {book.isbn && <span>ISBN {book.isbn}</span>}
        </div>
      </article>
    </main>
  );
}
