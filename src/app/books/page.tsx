import type { Metadata } from "next";
import { CatalogueResults } from "@/components/catalogue-results";
import { PageIntro } from "@/components/page-intro";
import { createPageMetadata } from "@/lib/book-metadata";
import type { SearchParams } from "@/lib/catalogue/filters";
import { hasQueryParams } from "@/lib/search-params";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const base = createPageMetadata({
    title: "Books",
    description: "Browse children's books by age, skill, author and more in the Vidyasagar catalogue.",
    path: "/books",
  });
  // Filtered and paginated views are not separate pages for search engines.
  return hasQueryParams(params) ? { ...base, robots: { index: false, follow: true } } : base;
}

export default async function BooksPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro
          eyebrow="The catalogue"
          title="Books for curious minds."
          lede="Browse by age, skill, author or format. Every listing shows who has reviewed it."
        />
        <section className="catalogue-section" aria-label="Published books">
          <CatalogueResults
            params={params}
            basePath="/books"
            emptyMessage="No books are available yet. New titles will appear here when they are ready to share."
          />
        </section>
      </div>
    </main>
  );
}
