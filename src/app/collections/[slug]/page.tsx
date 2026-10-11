import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookGrid } from "@/components/book-card";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { NOT_INDEXABLE, createPageMetadata, summarise } from "@/lib/book-metadata";
import { getCollections, getPublishedBooks } from "@/lib/catalogue/data";
import { booksInCollection } from "@/lib/catalogue/entities";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const [collections, books] = await Promise.all([getCollections(), getPublishedBooks()]);
  const collection = collections.find((c) => c.slug === slug);
  const inCollection = collection ? booksInCollection(collection, books) : [];
  return collection && inCollection.length > 0 ? { collection, books: inCollection } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = await load(slug);
  if (!found) return { title: { absolute: "Collection not found | Vidyasagar" }, robots: NOT_INDEXABLE };
  return createPageMetadata({
    title: found.collection.title,
    description: found.collection.description
      ? summarise(found.collection.description)
      : `${found.collection.title}: a collection of children's books on Vidyasagar.`,
    path: `/collections/${slug}`,
  });
}

export default async function CollectionPage({ params }: Props) {
  const { slug } = await params;
  const found = await load(slug);
  if (!found) notFound();
  const { collection, books } = found;
  return (
    <main id="main-content">
      <div className="content-wrap">
        <div className="page-intro">
          <Breadcrumbs
            trail={[
              { name: "Home", path: "/" },
              { name: "Collections", path: "/collections" },
              { name: collection.title, path: `/collections/${collection.slug}` },
            ]}
          />
          <h1 className="page-heading">{collection.title}</h1>
          {collection.description && <p className="page-lede">{collection.description}</p>}
        </div>
        <section className="catalogue-section" aria-label={collection.title}>
          <BookGrid books={books} empty="" />
        </section>
      </div>
    </main>
  );
}
