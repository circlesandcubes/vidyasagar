import type { MetadataRoute } from "next";
import { bookMatchesAgeGroup } from "@/lib/catalogue/ages";
import {
  getAgeGroups,
  getAuthors,
  getCollections,
  getPublishedBooks,
  getPublishers,
  getSkillTree,
} from "@/lib/catalogue/data";
import { booksByAuthor, booksByPublisher, booksForSkill, booksInCollection } from "@/lib/catalogue/entities";
import type { SkillNode } from "@/lib/catalogue/skills";
import { absoluteUrl } from "@/lib/site";

export const revalidate = 3600;

const flatten = (nodes: SkillNode[]): SkillNode[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);

// Only published, public records appear. Drafts, accounts, admin, checkout and
// orders are never listed, and thin pages (no books) are left out.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [books, authors, publishers, collections, ageGroups, skillTree] = await Promise.all([
    getPublishedBooks(),
    getAuthors(),
    getPublishers(),
    getCollections(),
    getAgeGroups(),
    getSkillTree(),
  ]);

  const staticPaths = [
    "/",
    "/books",
    "/skills",
    "/ages",
    "/collections",
    "/authors",
    "/publishers",
    "/new-releases",
    "/featured",
    "/verified-knowledge",
    "/verified-knowledge/how-it-works",
    "/content-standards",
    "/institutions",
  ];

  return [
    ...staticPaths.map((path) => ({ url: absoluteUrl(path) })),
    ...books.map((b) => ({ url: absoluteUrl(`/books/${b.slug}`) })),
    ...authors.filter((a) => booksByAuthor(books, a.id).length > 0).map((a) => ({ url: absoluteUrl(`/authors/${a.slug}`) })),
    ...publishers
      .filter((p) => booksByPublisher(books, p.id).length > 0)
      .map((p) => ({ url: absoluteUrl(`/publishers/${p.slug}`) })),
    ...collections
      .filter((c) => booksInCollection(c, books).length > 0)
      .map((c) => ({ url: absoluteUrl(`/collections/${c.slug}`) })),
    ...flatten(skillTree)
      .filter((s) => booksForSkill(books, s).length > 0)
      .map((s) => ({ url: absoluteUrl(`/skills/${s.slug}`) })),
    ...ageGroups.filter((g) => books.some((b) => bookMatchesAgeGroup(b, g))).map((g) => ({ url: absoluteUrl(`/ages/${g.slug}`) })),
  ];
}
