import Link from "next/link";
import { BookGrid } from "@/components/book-card";
import { JsonLd } from "@/components/json-ld";
import {
  getAgeGroups,
  getAuthors,
  getCollections,
  getPublishedBooks,
  getSkillTree,
} from "@/lib/catalogue/data";
import { bookMatchesAgeGroup } from "@/lib/catalogue/ages";
import { parseFilters, sortBooks } from "@/lib/catalogue/filters";
import { organisationJsonLd, websiteJsonLd } from "@/lib/catalogue/seo";
import { AGE_DISCLAIMER, SITE_TAGLINE } from "@/lib/site";

export const revalidate = 60;

const WHY_VIDYASAGAR = [
  {
    title: "Transparent content review",
    body: "Every book shows who has approved or reviewed it, and what that review covers. Approval by an author or publisher is never presented as independent verification.",
  },
  {
    title: "Skill-based discovery",
    body: "Browse by what a book offers, such as counting, vocabulary or observation, with a note explaining how each book supports that skill.",
  },
  {
    title: "A curated catalogue",
    body: "Books are listed only after editorial review. Each listing records its authors, illustrators and publisher.",
  },
  {
    title: "Choose where to buy",
    body: "Where a book is available from Amazon or Flipkart, the links are shown clearly with an affiliate disclosure.",
  },
];

export default async function HomePage() {
  const [books, ageGroups, skillTree, collections, authors] = await Promise.all([
    getPublishedBooks(),
    getAgeGroups(),
    getSkillTree(),
    getCollections(),
    getAuthors(),
  ]);

  const newest = sortBooks(books, parseFilters({ sort: "newest" })).slice(0, 4);
  const picks = books.filter((b) => b.is_featured).slice(0, 4);

  const collectionWithBooks = [...collections]
    .sort((a, b) => Number(b.is_featured) - Number(a.is_featured) || a.display_order - b.display_order)
    .map((collection) => ({
      collection,
      books: collection.books.flatMap((ref) => books.filter((b) => b.id === ref.book_id)),
    }))
    .find((entry) => entry.books.length > 0);

  const spotlight = authors
    .map((author) => ({
      author,
      books: books.filter((b) => b.contributors.some((c) => c.author.id === author.id)),
    }))
    .filter((entry) => entry.books.length > 0)
    .slice(0, 3);

  return (
    <main id="main-content">
      <JsonLd data={[websiteJsonLd(), organisationJsonLd()]} />

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="eyebrow">A curated children&apos;s bookstore</p>
            <h1 id="hero-title">
              Every Book.
              <br />
              <em>A World of Discovery.</em>
            </h1>
            <p className="hero-intro">
              Find stories that inspire, books that build skills, and discoveries that grow with your child.
            </p>
            <div className="hero-actions">
              <Link className="button button-light" href="/books">
                Explore Books
              </Link>
              <Link className="text-link" href="/skills">
                Discover Books by Skill <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
          <div className="orbit-art" role="img" aria-label="An illustrated planet and moon in orbit">
            <span className="orbit orbit-one" />
            <span className="orbit orbit-two" />
            <span className="orbit orbit-three" />
            <span className="planet" />
            <span className="moon" />
            <span className="star star-one" />
            <span className="star star-two" />
            <span className="star star-three" />
            <span className="orbit-caption">somewhere, a question</span>
          </div>
        </div>
        <span className="visually-hidden">{SITE_TAGLINE}</span>
      </section>

      <section className="section" aria-labelledby="ages-heading">
        <div className="content-wrap mx-auto">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Discover by age</p>
              <h2 id="ages-heading">Books for every stage of childhood.</h2>
            </div>
            <p className="section-note">{AGE_DISCLAIMER}</p>
          </div>
          <ul className="card-row">
            {ageGroups.map((group) => {
              const count = books.filter((b) => bookMatchesAgeGroup(b, group)).length;
              return (
                <li key={group.id}>
                  <Link className="info-card" href={`/ages/${group.slug}`}>
                    <span className="info-card-title">{group.name}</span>
                    {count > 0 && <span className="info-card-meta">{count} {count === 1 ? "book" : "books"}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="section section-tint" aria-labelledby="skills-heading">
        <div className="content-wrap mx-auto">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Discover by skill</p>
              <h2 id="skills-heading">See what each book offers.</h2>
            </div>
            <Link className="text-link text-link-dark" href="/skills">
              All skills <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <ul className="card-row card-row-wide">
            {skillTree.map((skill) => (
              <li key={skill.id}>
                <Link className="info-card" href={`/skills/${skill.slug}`}>
                  <span className="info-card-title">{skill.name}</span>
                  {skill.children.length > 0 && (
                    <span className="info-card-meta">
                      {skill.children
                        .slice(0, 3)
                        .map((c) => c.name)
                        .join(" · ")}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {collectionWithBooks && (
        <section className="section" aria-labelledby="collection-heading">
          <div className="content-wrap mx-auto">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Featured collection</p>
                <h2 id="collection-heading">{collectionWithBooks.collection.title}</h2>
                {collectionWithBooks.collection.description && (
                  <p className="section-lede">{collectionWithBooks.collection.description}</p>
                )}
              </div>
              <Link className="text-link text-link-dark" href={`/collections/${collectionWithBooks.collection.slug}`}>
                View collection <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <BookGrid books={collectionWithBooks.books.slice(0, 4)} empty="" />
          </div>
        </section>
      )}

      {picks.length > 0 && (
        <section className="section" aria-labelledby="picks-heading">
          <div className="content-wrap mx-auto">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Curator&apos;s picks</p>
                <h2 id="picks-heading">Chosen by hand.</h2>
              </div>
              <Link className="text-link text-link-dark" href="/featured">
                More picks <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <BookGrid books={picks} empty="" />
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="books-heading">
        <div className="content-wrap mx-auto">
          <div className="section-heading">
            <div>
              <p className="eyebrow">From the catalogue</p>
              <h2 id="books-heading">Curiosity, in print.</h2>
            </div>
            <Link className="text-link text-link-dark" href="/books">
              View all books <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <BookGrid
            books={newest}
            empty="The catalogue is taking shape. Check back for the first published titles."
          />
        </div>
      </section>

      {spotlight.length > 0 && (
        <section className="section section-tint" aria-labelledby="authors-heading">
          <div className="content-wrap mx-auto">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Author spotlight</p>
                <h2 id="authors-heading">The people behind the pages.</h2>
              </div>
              <Link className="text-link text-link-dark" href="/authors">
                All authors <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <ul className="card-row card-row-wide">
              {spotlight.map(({ author, books: authorBooks }) => (
                <li key={author.id}>
                  <Link className="info-card" href={`/authors/${author.slug}`}>
                    <span className="info-card-title">{author.name}</span>
                    <span className="info-card-meta">
                      {authorBooks.length} {authorBooks.length === 1 ? "book" : "books"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="quiet-section" aria-labelledby="why-heading">
        <div className="content-wrap">
          <h2 id="why-heading" className="why-heading">Why Vidyasagar?</h2>
          <ul className="why-grid">
            {WHY_VIDYASAGAR.map((item) => (
              <li key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
