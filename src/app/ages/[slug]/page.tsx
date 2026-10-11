import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookGrid } from "@/components/book-card";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { NOT_INDEXABLE, createPageMetadata } from "@/lib/book-metadata";
import { bookMatchesAgeGroup } from "@/lib/catalogue/ages";
import { getAgeGroups, getPublishedBooks } from "@/lib/catalogue/data";
import { AGE_DISCLAIMER } from "@/lib/site";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const [groups, books] = await Promise.all([getAgeGroups(), getPublishedBooks()]);
  const group = groups.find((g) => g.slug === slug);
  return group ? { group, books: books.filter((b) => bookMatchesAgeGroup(b, group)) } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = await load(slug);
  if (!found) return { title: { absolute: "Age group not found | Vidyasagar" }, robots: NOT_INDEXABLE };
  const base = createPageMetadata({
    title: `Books for ${found.group.name.toLowerCase()}`,
    description: `Children's books recommended for ${found.group.name.toLowerCase()}. Age ranges are indicative.`,
    path: `/ages/${slug}`,
  });
  return found.books.length === 0 ? { ...base, robots: { index: false, follow: true } } : base;
}

export default async function AgeGroupPage({ params }: Props) {
  const { slug } = await params;
  const found = await load(slug);
  if (!found) notFound();
  const { group, books } = found;
  return (
    <main id="main-content">
      <div className="content-wrap">
        <div className="page-intro">
          <Breadcrumbs
            trail={[
              { name: "Home", path: "/" },
              { name: "Ages", path: "/ages" },
              { name: group.name, path: `/ages/${group.slug}` },
            ]}
          />
          <h1 className="page-heading">{group.name}</h1>
          <p className="page-lede">{AGE_DISCLAIMER}</p>
        </div>
        <section className="catalogue-section" aria-label={`Books for ${group.name}`}>
          <BookGrid books={books} empty="No books have been recommended for this age group yet." />
        </section>
      </div>
    </main>
  );
}
