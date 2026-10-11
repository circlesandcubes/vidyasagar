import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { bookMatchesAgeGroup, formatAgeRange } from "@/lib/catalogue/ages";
import { createPageMetadata } from "@/lib/book-metadata";
import { getAgeGroups, getPublishedBooks } from "@/lib/catalogue/data";
import { AGE_DISCLAIMER } from "@/lib/site";

export const revalidate = 60;

export const metadata = createPageMetadata({
  title: "Books by age",
  description: "Browse children's books by indicative age group, from babies and toddlers to ages 8 and above.",
  path: "/ages",
});

export default async function AgesPage() {
  const [groups, books] = await Promise.all([getAgeGroups(), getPublishedBooks()]);
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Ages" title="Books for every stage." lede={AGE_DISCLAIMER} />
        <section className="catalogue-section">
          <ul className="card-row card-row-wide">
            {groups.map((group) => {
              const count = books.filter((b) => bookMatchesAgeGroup(b, group)).length;
              return (
                <li key={group.id}>
                  <Link className="info-card" href={`/ages/${group.slug}`}>
                    <span className="info-card-title">{group.name}</span>
                    <span className="info-card-meta">
                      {formatAgeRange(group.min_months, group.max_months)} ·{" "}
                      {count > 0 ? `${count} ${count === 1 ? "book" : "books"}` : "No books yet"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
