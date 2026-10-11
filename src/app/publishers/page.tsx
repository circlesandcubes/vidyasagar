import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { createPageMetadata } from "@/lib/book-metadata";
import { getPublishedBooks, getPublishers } from "@/lib/catalogue/data";
import { booksByPublisher, listedPublishers } from "@/lib/catalogue/entities";

export const revalidate = 60;

export const metadata = createPageMetadata({
  title: "Publishers",
  description: "The publishers whose books appear in the Vidyasagar catalogue.",
  path: "/publishers",
});

export default async function PublishersPage() {
  const [publishers, books] = await Promise.all([getPublishers(), getPublishedBooks()]);
  const listed = listedPublishers(publishers, books);
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Publishers" title="Where the books come from." />
        <section className="catalogue-section">
          {listed.length === 0 ? (
            <p className="empty-state">Publisher profiles will appear here as books are published.</p>
          ) : (
            <ul className="card-row card-row-wide">
              {listed.map((publisher) => {
                const count = booksByPublisher(books, publisher.id).length;
                return (
                  <li key={publisher.id}>
                    <Link className="info-card" href={`/publishers/${publisher.slug}`}>
                      <span className="info-card-title">{publisher.name}</span>
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
