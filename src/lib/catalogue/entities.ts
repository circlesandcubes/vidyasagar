import { skillIdsWithDescendants } from "@/lib/catalogue/skills";
import type { SkillNode } from "@/lib/catalogue/skills";
import type { Author, BookSkillLink, CatalogueBook, Collection, Publisher } from "@/lib/catalogue/types";

// An author or publisher page exists only while at least one published book
// credits them, so the site never has thin or empty profile pages.

export const booksByAuthor = (books: CatalogueBook[], authorId: string) =>
  books.filter((b) => b.contributors.some((c) => c.author.id === authorId));

export const booksByPublisher = (books: CatalogueBook[], publisherId: string) =>
  books.filter((b) => b.editions.some((e) => e.publisher?.id === publisherId));

export const listedAuthors = (authors: Author[], books: CatalogueBook[]) =>
  authors.filter((a) => booksByAuthor(books, a.id).length > 0);

export const listedPublishers = (publishers: Publisher[], books: CatalogueBook[]) =>
  publishers.filter((p) => booksByPublisher(books, p.id).length > 0);

export const booksInCollection = (collection: Collection, books: CatalogueBook[]) =>
  collection.books.flatMap((ref) => books.filter((b) => b.id === ref.book_id));

export interface SkillBookEntry {
  book: CatalogueBook;
  /** The approved link that put the book on this skill's page. */
  link: BookSkillLink;
}

/** Books with an approved link to this skill or any of its sub-skills. */
export function booksForSkill(books: CatalogueBook[], node: SkillNode): SkillBookEntry[] {
  const ids = skillIdsWithDescendants(node);
  return books.flatMap((book) => {
    const links = book.skills.filter((s) => s.is_approved && ids.has(s.skill.id));
    // Prefer the most direct relationship for the note shown beside the book.
    const order = ["practised", "supported", "incidental"];
    const link = [...links].sort((a, b) => order.indexOf(a.relation) - order.indexOf(b.relation))[0];
    return link ? [{ book, link }] : [];
  });
}
