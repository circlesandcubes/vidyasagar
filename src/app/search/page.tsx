import type { Metadata } from "next";
import { CatalogueResults } from "@/components/catalogue-results";
import { PageIntro } from "@/components/page-intro";
import type { SearchParams } from "@/lib/catalogue/filters";

type Props = { searchParams: Promise<SearchParams> };

// Search results are never indexed: they are infinite, thin variations of /books.
export const metadata: Metadata = {
  title: "Search",
  description: "Search the Vidyasagar catalogue.",
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Search" title="Find a book." lede="Search by title, author or topic, then narrow by age, skill and more." />
        <section className="catalogue-section" aria-label="Search results">
          <CatalogueResults params={params} basePath="/search" emptyMessage="Search for a title, author or topic to begin." />
        </section>
      </div>
    </main>
  );
}
