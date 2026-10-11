import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { createPageMetadata } from "@/lib/book-metadata";
import { getAuthors, getPublishedBooks } from "@/lib/catalogue/data";
import { booksByAuthor, listedAuthors } from "@/lib/catalogue/entities";

export const revalidate = 60;

export const metadata = createPageMetadata({
  title: "Authors",
  description: "The authors and illustrators behind the books in the Vidyasagar catalogue.",
  path: "/authors",
});

export default async function AuthorsPage() {
  const [authors, books] = await Promise.all([getAuthors(), getPublishedBooks()]);
  const listed = listedAuthors(authors, books);
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Authors" title="The people behind the pages." />
        <section className="catalogue-section">
          {listed.length === 0 ? (
            <p className="empty-state">Author profiles will appear here as books are published.</p>
          ) : (
            <ul className="card-row card-row-wide">
              {listed.map((author) => {
                const count = booksByAuthor(books, author.id).length;
                return (
                  <li key={author.id}>
                    <Link className="info-card" href={`/authors/${author.slug}`}>
                      <span className="info-card-title">{author.name}</span>
                      <span className="info-card-meta">{count} {count === 1 ? "book" : "books"}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
