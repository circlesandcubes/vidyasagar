import Link from "next/link";
import {
  VERIFICATION_TYPES,
  displayCredentials,
  safeSourceUrl,
  summariseVerification,
} from "@/lib/catalogue/verification";
import type { VerificationReview } from "@/lib/catalogue/types";

const LEVEL_HEADING = {
  independent: "Independent review",
  approval: "Approval by the author or publisher — not independent verification",
  classification: "Classification",
} as const;

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function ReviewRecord({ review }: { review: VerificationReview }) {
  const info = VERIFICATION_TYPES[review.review_type];
  const credentials = displayCredentials(review);
  const date = formatDate(review.reviewed_on);
  const party = [review.reviewer_name, review.reviewer_organisation].filter(Boolean).join(", ");

  return (
    <article className={`review-record review-${info.level}`}>
      <h3>{info.statement}</h3>
      <p className="review-level">{LEVEL_HEADING[info.level]}</p>
      <p>{info.summary}</p>

      <dl className="review-facts">
        {party && (
          <>
            <dt>{info.level === "approval" ? "Approved by" : "Reviewer"}</dt>
            <dd>
              {party}
              {review.approval_authority ? ` (${review.approval_authority})` : ""}
              {credentials ? ` — ${credentials}` : ""}
            </dd>
          </>
        )}
        <dt>Scope</dt>
        <dd>{review.scope}</dd>
        {review.claims_covered && (
          <>
            <dt>Claims or sections covered</dt>
            <dd>{review.claims_covered}</dd>
          </>
        )}
        {review.version_reviewed && (
          <>
            <dt>Version reviewed</dt>
            <dd>{review.version_reviewed}</dd>
          </>
        )}
        {date && (
          <>
            <dt>Date</dt>
            <dd>{date}</dd>
          </>
        )}
        {review.sources.length > 0 && (
          <>
            <dt>Sources</dt>
            <dd>
              <ul className="plain-list">
                {review.sources.map((source, index) => {
                  const href = safeSourceUrl(source.url);
                  return (
                    <li key={`${index}-${source.title}`}>
                      {href ? (
                        <a href={href} rel="noopener noreferrer nofollow" target="_blank">
                          {source.title}
                        </a>
                      ) : (
                        source.title
                      )}
                    </li>
                  );
                })}
              </ul>
            </dd>
          </>
        )}
        <dt>Limitations</dt>
        <dd>
          {review.limitations ? `${review.limitations} ` : ""}
          {info.limitation}
        </dd>
      </dl>
    </article>
  );
}

/** Always visible on a book page, so absence of review is as clear as presence. */
export function VerificationPanel({ reviews }: { reviews: VerificationReview[] }) {
  const summary = summariseVerification(reviews);

  return (
    <section className="panel" aria-labelledby="verification-heading">
      <h2 id="verification-heading">Verified Knowledge</h2>
      <p className={`verification-notice notice-${summary.kind}`} role="note">
        {summary.notice}
      </p>
      {summary.reviews.map((review) => (
        <ReviewRecord key={review.id} review={review} />
      ))}
      <p className="panel-footnote">
        <Link href="/verified-knowledge/how-it-works">How Vidyasagar describes review, and what each label does not mean</Link>
      </p>
    </section>
  );
}
