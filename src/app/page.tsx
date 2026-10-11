import Link from "next/link";
import { BookCard } from "@/components/book-card";
import { getPublishedBooks } from "@/lib/books";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const books = (await getPublishedBooks()).slice(0, 2);

  return (
    <main id="main-content">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="eyebrow">A little room for wonder</p>
            <h1 id="hero-title">Big questions.<br /><em>Small readers.</em></h1>
            <p className="hero-intro">Books that turn looking up into the beginning of something.</p>
            <Link className="text-link" href="/books">Explore the books <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="orbit-art" role="img" aria-label="An illustrated planet and moon in orbit">
            <span className="orbit orbit-one" />
            <span className="orbit orbit-two" />
            <span className="orbit orbit-three" />
            <span className="planet" />
            <span className="moon" />
            <span className="star star-one" />
            <span className="star star-two" />
            <span className="star star-three" />
            <span className="orbit-caption">somewhere, a question</span>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="books-heading">
          <div className="content-wrap mx-auto">
          <div className="section-heading">
            <div>
              <p className="eyebrow">From the catalogue</p>
              <h2 id="books-heading">Curiosity, in print.</h2>
            </div>
            <Link className="text-link" href="/books">View all books <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="book-grid">
            {books.length ? books.map((book, index) => <BookCard key={book.id} book={book} index={index} />) : (
              <p className="empty-state">The catalogue is taking shape. Check back for the first published titles.</p>
            )}
          </div>
        </div>
      </section>

      <section className="quiet-section">
        <div className="content-wrap quiet-inner">
          <h2>Wonder is a good place to start.</h2>
          <p>Every great expedition begins with a question. Here, the questions are about the sky above us and the worlds beyond.</p>
        </div>
      </section>
    </main>
  );
}
