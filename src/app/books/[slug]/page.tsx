import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookCover } from "@/components/book-cover";
import { BookSkills } from "@/components/book-skills";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PurchaseOptions } from "@/components/purchase-options";
import { DirectPurchase } from "@/components/direct-purchase";
import { ShareLinks } from "@/components/share-links";
import { VerificationBadges } from "@/components/verification-badges";
import { VerificationPanel } from "@/components/verification-panel";
import { saveBookAction } from "@/app/account/actions";
import { createBookMetadata } from "@/lib/book-metadata";
import { formatAgeRange } from "@/lib/catalogue/ages";
import { getCorrectionsForBook, getDirectOffers, getPersonalisationForBook, getPublishedBookBySlug, getPublishedReviews } from "@/lib/catalogue/data";
import { AVAILABILITY_LABELS, FORMAT_LABELS } from "@/lib/catalogue/filters";
import { purchaseOptionsForBook } from "@/lib/catalogue/purchase";
import { bookJsonLd } from "@/lib/catalogue/seo";
import { summariseVerification } from "@/lib/catalogue/verification";
import type { ContributorRole } from "@/lib/catalogue/types";
import { AGE_DISCLAIMER, absoluteUrl } from "@/lib/site";

// Short revalidation keeps unpublished books from lingering in the cache.
export const revalidate = 60;

type BookPageProps = {
  params: Promise<{ slug: string }>;
};

const ROLE_LABELS: Record<ContributorRole, string> = {
  author: "Words by",
  illustrator: "Illustrated by",
  editor: "Edited by",
  translator: "Translated by",
};
const ROLE_ORDER: ContributorRole[] = ["author", "illustrator", "translator", "editor"];

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const { slug } = await params;
  return createBookMetadata(await getPublishedBookBySlug(slug));
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export default async function BookPage({ params }: BookPageProps) {
  const { slug } = await params;
  const book = await getPublishedBookBySlug(slug);

  if (!book) notFound();

  const age = formatAgeRange(book.age_min_months, book.age_max_months);
  const verification = summariseVerification(book.reviews);
  const options = purchaseOptionsForBook(book.editions);
  const path = `/books/${book.slug}`;
  const [corrections, personalisation, reviews, offers] = await Promise.all([
    getCorrectionsForBook(book.id),
    getPersonalisationForBook(book.id),
    getPublishedReviews(book.id),
    getDirectOffers(book.id),
  ]);

  return (
    <main id="main-content" className="detail-main">
      <JsonLd data={bookJsonLd(book)} />
      <article className="book-detail">
        <Breadcrumbs
          trail={[
            { name: "Home", path: "/" },
            { name: "Books", path: "/books" },
            { name: book.title, path },
          ]}
        />

        <div className="book-detail-top">
          <div className="book-detail-cover">
            <BookCover book={book} priority />
          </div>
          <div className="book-detail-summary">
            <p className="eyebrow">From the catalogue</p>
            <h1 className="detail-title">{book.title}</h1>
            {book.subtitle && <p className="detail-subtitle">{book.subtitle}</p>}

            <ul className="credits">
              {ROLE_ORDER.map((role) => {
                const people = book.contributors.filter((c) => c.role === role);
                if (people.length === 0) return null;
                return (
                  <li key={role}>
                    {ROLE_LABELS[role]}{" "}
                    {people.map((person, index) => (
                      <span key={person.author.id}>
                        {index > 0 && ", "}
                        <Link href={`/authors/${person.author.slug}`}>{person.author.name}</Link>
                      </span>
                    ))}
                  </li>
                );
              })}
            </ul>

            {age && (
              <p className="age-line">
                <strong>{age}</strong> <span className="muted">· indicative</span>
              </p>
            )}
            <VerificationBadges types={verification.types} />

            {book.description && <p className="detail-description">{book.description}</p>}
            {age && <p className="muted small">{AGE_DISCLAIMER}</p>}
          </div>
        </div>

        <div className="book-detail-body">
          <BookSkills links={book.skills} />
          <VerificationPanel reviews={book.reviews} />
          <DirectPurchase offers={offers} returnTo={path} title={book.title} />
          <PurchaseOptions options={options} />

          {personalisation.length > 0 && (
            <section className="panel" aria-labelledby="personalise-heading">
              <h2 id="personalise-heading">Personalise this book</h2>
              <p>{personalisation.map((t) => t.name).join(", ")} available.</p>
              <p><Link className="button" href={`/books/${book.slug}/personalise`}>Preview personalisation</Link></p>
            </section>
          )}

          {book.editions.length > 0 && (
            <section className="panel" aria-labelledby="editions-heading">
              <h2 id="editions-heading">{book.editions.length === 1 ? "Edition" : "Editions"}</h2>
              <ul className="edition-list">
                {book.editions.map((edition) => {
                  const published = formatDate(edition.publication_date);
                  return (
                    <li key={edition.id}>
                      <h3>
                        {FORMAT_LABELS[edition.format]} · {edition.language.toUpperCase()}
                      </h3>
                      <dl className="review-facts">
                        <dt>Availability</dt>
                        <dd>{AVAILABILITY_LABELS[edition.availability]}</dd>
                        {edition.publisher && (
                          <>
                            <dt>Publisher</dt>
                            <dd>
                              <Link href={`/publishers/${edition.publisher.slug}`}>{edition.publisher.name}</Link>
                            </dd>
                          </>
                        )}
                        {edition.isbn13 && (
                          <>
                            <dt>ISBN-13</dt>
                            <dd>{edition.isbn13}</dd>
                          </>
                        )}
                        {published && (
                          <>
                            <dt>Published</dt>
                            <dd>{published}</dd>
                          </>
                        )}
                        {edition.page_count && (
                          <>
                            <dt>Pages</dt>
                            <dd>{edition.page_count}</dd>
                          </>
                        )}
                      </dl>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {reviews.length > 0 && (
            <section className="panel" aria-labelledby="reviews-heading">
              <h2 id="reviews-heading">Reader reviews</h2>
              <p className="panel-footnote">Opinions from readers, checked before publishing. Not part of Vidyasagar’s review records.</p>
              <ul className="plain-list">
                {reviews.map((r) => (
                  <li key={r.id}>
                    <strong>{r.rating} out of 5</strong> — {r.display_name ?? "A reader"}
                    <p>{r.body}</p>
                  </li>
                ))}
              </ul>
              <p className="small"><Link href={`/books/${book.slug}/review`}>Write a review</Link></p>
            </section>
          )}

          {corrections.length > 0 && (
            <section className="panel" aria-labelledby="corrections-heading">
              <h2 id="corrections-heading">Corrections</h2>
              <ul className="plain-list">
                {corrections.map((c) => (
                  <li key={c.id}>
                    <strong>{formatDate(c.corrected_on)}:</strong> {c.summary}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <form action={saveBookAction.bind(null, book.id, book.slug)}>
            <button className="button" type="submit">Save this book</button>
          </form>

          <p className="small">
            <Link href={`/report-error?book=${encodeURIComponent(book.slug)}&path=${encodeURIComponent(path)}`}>
              Report an error in this listing
            </Link>
          </p>

          <ShareLinks url={absoluteUrl(path)} title={book.title} />
        </div>
      </article>
    </main>
  );
}
