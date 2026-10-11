import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { createPageMetadata } from "@/lib/book-metadata";
import { getCollections, getPublishedBooks } from "@/lib/catalogue/data";
import { booksInCollection } from "@/lib/catalogue/entities";

export const revalidate = 60;

export const metadata = createPageMetadata({
  title: "Collections",
  description: "Hand-picked collections of children's books from the Vidyasagar catalogue team.",
  path: "/collections",
});

export default async function CollectionsPage() {
  const [collections, books] = await Promise.all([getCollections(), getPublishedBooks()]);
  const listed = collections
    .map((collection) => ({ collection, count: booksInCollection(collection, books).length }))
    .filter((entry) => entry.count > 0);

  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Collections" title="Books, gathered by theme." />
        <section className="catalogue-section">
          {listed.length === 0 ? (
            <p className="empty-state">Collections will appear here once they contain published books.</p>
          ) : (
            <ul className="card-row card-row-wide">
              {listed.map(({ collection, count }) => (
                <li key={collection.id}>
                  <Link className="info-card" href={`/collections/${collection.slug}`}>
                    <span className="info-card-title">{collection.title}</span>
                    <span className="info-card-meta">{count} {count === 1 ? "book" : "books"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
