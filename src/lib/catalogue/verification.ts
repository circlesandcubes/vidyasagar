import type { VerificationReview, VerificationType } from "@/lib/catalogue/types";

/**
 * Vidyasagar Verified Knowledge Framework.
 *
 * The key rule: approval by the people who made a book (author, publisher) is
 * NOT independent verification. Each type therefore carries a `level`, and the
 * UI must always show which level a book actually has.
 */
export type VerificationLevel = "approval" | "independent" | "classification";

export interface VerificationTypeInfo {
  type: VerificationType;
  label: string;
  /** Short statement shown on book pages. */
  statement: string;
  level: VerificationLevel;
  summary: string;
  limitation: string;
}

export const VERIFICATION_TYPES: Record<VerificationType, VerificationTypeInfo> = {
  author_approved: {
    type: "author_approved",
    label: "Author-approved",
    statement: "Author-approved content.",
    level: "approval",
    summary: "The author has attested to the accuracy or appropriateness of the content named in the scope.",
    limitation: "This is the author's own approval. It is not independent fact-checking or review.",
  },
  publisher_approved: {
    type: "publisher_approved",
    label: "Publisher-approved",
    statement: "Publisher-approved content.",
    level: "approval",
    summary: "The publisher has approved the content under its own editorial process.",
    limitation: "This reflects the publisher's editorial process. It does not imply independent fact-checking.",
  },
  fact_checked: {
    type: "fact_checked",
    label: "Fact-checked",
    statement: "Fact-checked content.",
    level: "independent",
    summary: "Specific factual claims were checked against appropriate sources. The claims, sources and date are recorded.",
    limitation: "Only the claims and sections named in the scope were checked.",
  },
  expert_reviewed: {
    type: "expert_reviewed",
    label: "Expert-reviewed",
    statement: "Expert-reviewed content.",
    level: "independent",
    summary: "A suitably qualified reviewer has reviewed the content named in the scope.",
    limitation: "Credentials are shown only when they have been checked and the reviewer has agreed to disclosure.",
  },
  educator_reviewed: {
    type: "educator_reviewed",
    label: "Educator-reviewed",
    statement: "Educator-reviewed content.",
    level: "independent",
    summary: "An educator has reviewed the book's educational suitability within a documented scope.",
    limitation: "This covers educational suitability within the stated scope, not every factual claim.",
  },
  story_and_imagination: {
    type: "story_and_imagination",
    label: "Story and imagination",
    statement: "Story and imagination.",
    level: "classification",
    summary: "The book is primarily fictional or imaginative.",
    limitation:
      "Factual elements may appear, but the narrative should not be read as wholly factual because it touches on an educational topic.",
  },
};

/** Display order: independent review first, then approvals, then classification. */
const DISPLAY_ORDER: VerificationType[] = [
  "fact_checked",
  "expert_reviewed",
  "educator_reviewed",
  "publisher_approved",
  "author_approved",
  "story_and_imagination",
];

/**
 * Defence in depth: row-level security already hides everything that fails this
 * test, but the UI re-checks so a policy mistake cannot create a false badge.
 */
export function isPubliclyVisibleReview(review: VerificationReview): boolean {
  return review.status === "published" && review.publication_permission && review.admin_approved;
}

/** Credentials are shown only when they were verified. */
export function displayCredentials(review: VerificationReview): string | null {
  if (!review.credentials_verified) return null;
  const value = review.public_credentials?.trim();
  return value ? value : null;
}

export function sortReviews(reviews: VerificationReview[]): VerificationReview[] {
  return [...reviews].sort((a, b) => {
    const byType = DISPLAY_ORDER.indexOf(a.review_type) - DISPLAY_ORDER.indexOf(b.review_type);
    if (byType !== 0) return byType;
    return (b.reviewed_on ?? "").localeCompare(a.reviewed_on ?? "");
  });
}

export type VerificationNoticeKind = "none" | "independent" | "approval_only" | "story_only";

export interface VerificationSummary {
  reviews: VerificationReview[];
  types: VerificationType[];
  hasApproval: boolean;
  hasIndependentReview: boolean;
  kind: VerificationNoticeKind;
  notice: string;
}

export function summariseVerification(allReviews: VerificationReview[]): VerificationSummary {
  const reviews = sortReviews(allReviews.filter(isPubliclyVisibleReview));
  const types = [...new Set(reviews.map((r) => r.review_type))];
  const levels = new Set(types.map((t) => VERIFICATION_TYPES[t].level));
  const hasApproval = levels.has("approval");
  const hasIndependentReview = levels.has("independent");

  let kind: VerificationNoticeKind;
  let notice: string;
  if (hasIndependentReview) {
    kind = "independent";
    notice = "Includes independent review. Each record below states exactly what was covered and what was not.";
  } else if (hasApproval) {
    kind = "approval_only";
    notice =
      "Approved by the author or publisher. This is not independent verification, and no independent review has been published for this book.";
  } else if (types.length > 0) {
    kind = "story_only";
    notice = "This is a story. No independent review of any factual content has been published.";
  } else {
    kind = "none";
    notice = "No review information has been published for this book yet.";
  }

  return { reviews, types, hasApproval, hasIndependentReview, kind, notice };
}

/** Only http(s) links are ever rendered from reviewer-supplied sources. */
export function safeSourceUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
