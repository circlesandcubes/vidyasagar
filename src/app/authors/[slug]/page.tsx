import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookGrid } from "@/components/book-card";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { NOT_INDEXABLE, createPageMetadata, summarise } from "@/lib/book-metadata";
import { getAuthors, getPublishedBooks } from "@/lib/catalogue/data";
import { booksByAuthor } from "@/lib/catalogue/entities";
import { authorJsonLd } from "@/lib/catalogue/seo";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const [authors, books] = await Promise.all([getAuthors(), getPublishedBooks()]);
  const author = authors.find((a) => a.slug === slug);
  const authorBooks = author ? booksByAuthor(books, author.id) : [];
  return author && authorBooks.length > 0 ? { author, books: authorBooks } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = await load(slug);
  if (!found) return { title: { absolute: "Author not found | Vidyasagar" }, robots: NOT_INDEXABLE };
  return createPageMetadata({
    title: found.author.name,
    description: found.author.bio ? summarise(found.author.bio) : `Books by ${found.author.name} on Vidyasagar.`,
    path: `/authors/${slug}`,
  });
}

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params;
  const found = await load(slug);
  if (!found) notFound();
  const { author, books } = found;

  return (
    <main id="main-content">
      <JsonLd data={authorJsonLd(author)} />
      <div className="content-wrap">
        <div className="page-intro">
          <Breadcrumbs
            trail={[
              { name: "Home", path: "/" },
              { name: "Authors", path: "/authors" },
              { name: author.name, path: `/authors/${author.slug}` },
            ]}
          />
          <h1 className="page-heading">{author.name}</h1>
          {author.bio && <p className="page-lede">{author.bio}</p>}
          {author.website_url && (
            <p>
              <a href={author.website_url} rel="noopener noreferrer nofollow" target="_blank">
                Website<span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            </p>
          )}
        </div>
        <section className="catalogue-section" aria-label={`Books by ${author.name}`}>
          <BookGrid books={books} empty="" />
        </section>
      </div>
    </main>
  );
}
