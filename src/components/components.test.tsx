import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BookCard } from "@/components/book-card";
import { BookSkills } from "@/components/book-skills";
import { PurchaseOptions } from "@/components/purchase-options";
import { VerificationBadges } from "@/components/verification-badges";
import { VerificationPanel } from "@/components/verification-panel";
import { makeBook, makeChannel, makeEdition, makeReview, makeSkillLink } from "@/lib/catalogue/fixtures";
import { purchaseOptionsForBook } from "@/lib/catalogue/purchase";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("verification panel", () => {
  it("says plainly when nothing has been published", () => {
    const out = html(<VerificationPanel reviews={[]} />);
    expect(out).toContain("No review information has been published for this book yet.");
  });

  it("labels author approval as not independent verification", () => {
    const out = html(<VerificationPanel reviews={[makeReview({ review_type: "author_approved" })]} />);
    expect(out).toContain("Author-approved content.");
    expect(out).toContain("not independent verification");
    expect(out).not.toContain("Includes independent review");
    expect(out).not.toContain("Fact-checked");
  });

  it("never renders records that are not public", () => {
    const out = html(
      <VerificationPanel
        reviews={[
          makeReview({ id: "d", review_type: "fact_checked", status: "draft", reviewer_name: "Draft Reviewer" }),
          makeReview({ id: "n", review_type: "expert_reviewed", admin_approved: false, reviewer_name: "Unapproved Expert" }),
        ]}
      />,
    );
    expect(out).not.toContain("Draft Reviewer");
    expect(out).not.toContain("Unapproved Expert");
    expect(out).toContain("No review information");
  });

  it("shows credentials only when verified, and drops unsafe source links", () => {
    const base = {
      review_type: "expert_reviewed" as const,
      reviewer_name: "Dr Example",
      public_credentials: "Professor of Astronomy",
      sources: [
        { title: "Safe source", url: "https://example.org/a" },
        { title: "Unsafe source", url: "javascript:alert(1)" },
      ],
    };
    const unverified = html(<VerificationPanel reviews={[makeReview({ ...base, credentials_verified: false })]} />);
    expect(unverified).not.toContain("Professor of Astronomy");

    const verified = html(<VerificationPanel reviews={[makeReview({ ...base, credentials_verified: true })]} />);
    expect(verified).toContain("Professor of Astronomy");
    expect(verified).toContain('href="https://example.org/a"');
    expect(verified).not.toContain('href="javascript');
    expect(verified).toContain("Unsafe source");
  });

  it("escapes reviewer-supplied text", () => {
    const out = html(<VerificationPanel reviews={[makeReview({ scope: "<img src=x onerror=alert(1)>" })]} />);
    expect(out).not.toContain("<img src=x");
    expect(out).toContain("&lt;img");
  });
});

describe("verification badges", () => {
  it("does not rely on colour alone to separate approval from independent review", () => {
    const out = html(<VerificationBadges types={["fact_checked", "author_approved"]} />);
    expect(out).toContain("badge-independent");
    expect(out).toContain("badge-approval");
    expect(out).toContain("independent review");
    expect(out).toContain("not independent verification");
  });
});

describe("purchase options", () => {
  it("renders sponsored links and the affiliate disclosure", () => {
    const options = purchaseOptionsForBook([makeEdition({ channels: [makeChannel()] })]);
    const out = html(<PurchaseOptions options={options} />);
    expect(out).toContain("Buy on Amazon");
    expect(out).toContain("sponsored");
    expect(out).toContain("may earn a commission");
  });

  it("makes no purchase claims when no link exists", () => {
    const out = html(<PurchaseOptions options={[]} />);
    expect(out).toContain("No purchase links are available");
    expect(out).not.toContain("commission");
  });
});

describe("skills on a book", () => {
  it("shows approved skill notes only", () => {
    const out = html(
      <BookSkills
        links={[
          makeSkillLink({ explanation: "Approved note." }),
          makeSkillLink({
            is_approved: false,
            explanation: "Unapproved note.",
            skill: { id: "x", parent_id: null, name: "Hidden", slug: "hidden" },
          }),
        ]}
      />,
    );
    expect(out).toContain("Approved note.");
    expect(out).not.toContain("Unapproved note.");
    expect(out).toContain("not diagnoses or guaranteed learning outcomes");
  });

  it("renders nothing without approved skills", () => {
    expect(html(<BookSkills links={[makeSkillLink({ is_approved: false })]} />)).toBe("");
  });
});

describe("book card", () => {
  it("shows a typographic placeholder (hidden from assistive tech) when there is no cover", () => {
    const out = html(<BookCard book={makeBook({ title: "No Cover Book" })} />);
    expect(out).toContain("cover-placeholder");
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain('href="/books/example-book"');
  });

  it("uses descriptive alt text for real covers", () => {
    const out = html(<BookCard book={makeBook({ title: "Covered", cover_image_url: "https://example.org/c.jpg" })} />);
    expect(out).toContain('alt="Cover of Covered"');
  });
});
