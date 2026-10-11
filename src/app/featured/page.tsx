import { BookGrid } from "@/components/book-card";
import { PageIntro } from "@/components/page-intro";
import { getPublishedBooks } from "@/lib/catalogue/data";
import { createPageMetadata } from "@/lib/book-metadata";

export const revalidate = 60;

export const metadata = createPageMetadata({
  title: "Curator's picks",
  description: "Books chosen by hand by the Vidyasagar catalogue team.",
  path: "/featured",
});

export default async function FeaturedPage() {
  const books = (await getPublishedBooks()).filter((b) => b.is_featured);
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Curator's picks" title="Chosen by hand." />
        <section className="catalogue-section">
          <BookGrid books={books} empty="No featured books have been chosen yet." />
        </section>
      </div>
    </main>
  );
}
