import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { createPageMetadata } from "@/lib/book-metadata";
import { getPublishedBooks, getSkillTree } from "@/lib/catalogue/data";
import { booksForSkill } from "@/lib/catalogue/entities";
import { SKILL_DISCLAIMER } from "@/lib/site";

export const revalidate = 60;

export const metadata = createPageMetadata({
  title: "Discover books by skill",
  description:
    "Browse children's books by the skills they offer, from vocabulary and counting to observation and empathy, each with a note on how the book supports the skill.",
  path: "/skills",
});

export default async function SkillsPage() {
  const [tree, books] = await Promise.all([getSkillTree(), getPublishedBooks()]);
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro
          eyebrow="Skills"
          title="Discover books by skill."
          lede="Every skill link comes with an explanation of how the book supports it."
        />
        <p className="muted small">{SKILL_DISCLAIMER}</p>
        <section className="catalogue-section" aria-label="Skill categories">
          {tree.length === 0 ? (
            <p className="empty-state">Skill categories are not available yet.</p>
          ) : (
            <ul className="skill-tree">
              {tree.map((parent) => {
                const parentCount = booksForSkill(books, parent).length;
                return (
                  <li key={parent.id} className="skill-tree-group">
                    <h2>
                      <Link href={`/skills/${parent.slug}`}>{parent.name}</Link>
                    </h2>
                    {parent.description && <p className="muted">{parent.description}</p>}
                    <p className="small muted">
                      {parentCount > 0 ? `${parentCount} ${parentCount === 1 ? "book" : "books"}` : "No books yet"}
                    </p>
                    {parent.children.length > 0 && (
                      <ul className="chip-list">
                        {parent.children.map((child) => {
                          const count = booksForSkill(books, child).length;
                          return (
                            <li key={child.id}>
                              <Link className={count > 0 ? "chip" : "chip chip-quiet"} href={`/skills/${child.slug}`}>
                                {child.name}
                                {count > 0 && <span className="chip-count">{count}</span>}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
