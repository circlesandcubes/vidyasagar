import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookGrid } from "@/components/book-card";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { NOT_INDEXABLE, createPageMetadata, summarise } from "@/lib/book-metadata";
import { getPublishedBooks, getPublishers } from "@/lib/catalogue/data";
import { booksByPublisher } from "@/lib/catalogue/entities";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const [publishers, books] = await Promise.all([getPublishers(), getPublishedBooks()]);
  const publisher = publishers.find((p) => p.slug === slug);
  const publisherBooks = publisher ? booksByPublisher(books, publisher.id) : [];
  return publisher && publisherBooks.length > 0 ? { publisher, books: publisherBooks } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = await load(slug);
  if (!found) return { title: { absolute: "Publisher not found | Vidyasagar" }, robots: NOT_INDEXABLE };
  return createPageMetadata({
    title: found.publisher.name,
    description: found.publisher.description
      ? summarise(found.publisher.description)
      : `Books from ${found.publisher.name} on Vidyasagar.`,
    path: `/publishers/${slug}`,
  });
}

export default async function PublisherPage({ params }: Props) {
  const { slug } = await params;
  const found = await load(slug);
  if (!found) notFound();
  const { publisher, books } = found;

  return (
    <main id="main-content">
      <div className="content-wrap">
        <div className="page-intro">
          <Breadcrumbs
            trail={[
              { name: "Home", path: "/" },
              { name: "Publishers", path: "/publishers" },
              { name: publisher.name, path: `/publishers/${publisher.slug}` },
            ]}
          />
          <h1 className="page-heading">{publisher.name}</h1>
          {publisher.description && <p className="page-lede">{publisher.description}</p>}
          {publisher.website_url && (
            <p>
              <a href={publisher.website_url} rel="noopener noreferrer nofollow" target="_blank">
                Website<span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            </p>
          )}
        </div>
        <section className="catalogue-section" aria-label={`Books from ${publisher.name}`}>
          <BookGrid books={books} empty="" />
        </section>
      </div>
    </main>
  );
}
