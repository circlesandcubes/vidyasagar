import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SkillBookList } from "@/components/skill-book-list";
import { NOT_INDEXABLE, createPageMetadata } from "@/lib/book-metadata";
import { getPublishedBooks, getSkillTree } from "@/lib/catalogue/data";
import { booksForSkill } from "@/lib/catalogue/entities";
import { findSkillNode } from "@/lib/catalogue/skills";
import type { SkillNode } from "@/lib/catalogue/skills";
import { SKILL_DISCLAIMER } from "@/lib/site";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

function pathTo(tree: SkillNode[], slug: string, trail: SkillNode[] = []): SkillNode[] | null {
  for (const node of tree) {
    if (node.slug === slug) return [...trail, node];
    const found = pathTo(node.children, slug, [...trail, node]);
    if (found) return found;
  }
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [tree, books] = await Promise.all([getSkillTree(), getPublishedBooks()]);
  const node = findSkillNode(tree, slug);
  if (!node) return { title: { absolute: "Skill not found | Vidyasagar" }, robots: NOT_INDEXABLE };
  const base = createPageMetadata({
    title: `${node.name} books`,
    description: node.description ?? `Children's books that offer ${node.name.toLowerCase()}, with a note on how each one supports the skill.`,
    path: `/skills/${slug}`,
  });
  // A skill with no books yet is a thin page, so it stays out of search results.
  return booksForSkill(books, node).length === 0 ? { ...base, robots: { index: false, follow: true } } : base;
}

export default async function SkillPage({ params }: Props) {
  const { slug } = await params;
  const [tree, books] = await Promise.all([getSkillTree(), getPublishedBooks()]);
  const trail = pathTo(tree, slug);
  if (!trail) notFound();
  const node = trail[trail.length - 1];
  const entries = booksForSkill(books, node);

  return (
    <main id="main-content">
      <div className="content-wrap">
        <div className="page-intro">
          <Breadcrumbs
            trail={[
              { name: "Home", path: "/" },
              { name: "Skills", path: "/skills" },
              ...trail.map((n) => ({ name: n.name, path: `/skills/${n.slug}` })),
            ]}
          />
          <h1 className="page-heading">{node.name}</h1>
          {node.description && <p className="page-lede">{node.description}</p>}
          {node.age_guidance && <p className="muted">{node.age_guidance}</p>}
          {node.children.length > 0 && (
            <ul className="chip-list">
              {node.children.map((child) => (
                <li key={child.id}>
                  <Link className="chip" href={`/skills/${child.slug}`}>
                    {child.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <section className="catalogue-section" aria-label={`Books for ${node.name}`}>
          <SkillBookList entries={entries} empty="No books have been linked to this skill yet." />
          <p className="muted small">{SKILL_DISCLAIMER}</p>
        </section>
      </div>
    </main>
  );
}
