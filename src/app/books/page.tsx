import type { Metadata } from "next";
import { BookCard } from "@/components/book-card";
import { getPublishedBooks } from "@/lib/books";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Books",
  description: "Explore the books in the Vidyasagar catalogue.",
};

export default async function BooksPage() {
  const books = await getPublishedBooks();

  return (
    <main id="main-content">
      <div className="content-wrap">
        <header className="page-intro">
          <p className="eyebrow">The catalogue</p>
          <h1 className="page-heading">Books for curious minds.</h1>
          <p className="page-lede">Questions about our universe, made for sharing out loud.</p>
        </header>
        <section className="catalogue-section" aria-label="Published books">
          <div className="book-grid">
            {books.length ? books.map((book, index) => <BookCard key={book.id} book={book} index={index} />) : (
              <p className="empty-state">No books are available yet. New titles will appear here when they are ready to share.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
