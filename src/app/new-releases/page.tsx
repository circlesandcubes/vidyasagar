import { BookGrid } from "@/components/book-card";
import { PageIntro } from "@/components/page-intro";
import { getPublishedBooks } from "@/lib/catalogue/data";
import { parseFilters, sortBooks } from "@/lib/catalogue/filters";
import { createPageMetadata } from "@/lib/book-metadata";

export const revalidate = 60;

export const metadata = createPageMetadata({
  title: "New releases",
  description: "The most recently published children's books in the Vidyasagar catalogue.",
  path: "/new-releases",
});

export default async function NewReleasesPage() {
  const books = sortBooks(await getPublishedBooks(), parseFilters({ sort: "newest" })).slice(0, 24);
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="New releases" title="Newly on the shelf." />
        <section className="catalogue-section">
          <BookGrid books={books} empty="No books have been published yet." />
        </section>
      </div>
    </main>
  );
}
