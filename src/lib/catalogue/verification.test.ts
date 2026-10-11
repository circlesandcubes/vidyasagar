import { describe, expect, it } from "vitest";
import { makeReview } from "@/lib/catalogue/fixtures";
import {
  displayCredentials,
  isPubliclyVisibleReview,
  safeSourceUrl,
  summariseVerification,
} from "@/lib/catalogue/verification";

describe("verification badge eligibility", () => {
  it("shows a record only when published, permitted and admin-approved", () => {
    expect(isPubliclyVisibleReview(makeReview())).toBe(true);
    expect(isPubliclyVisibleReview(makeReview({ status: "draft" }))).toBe(false);
    expect(isPubliclyVisibleReview(makeReview({ status: "pending_approval" }))).toBe(false);
    expect(isPubliclyVisibleReview(makeReview({ status: "withdrawn" }))).toBe(false);
    expect(isPubliclyVisibleReview(makeReview({ publication_permission: false }))).toBe(false);
    expect(isPubliclyVisibleReview(makeReview({ admin_approved: false }))).toBe(false);
  });

  it("reports no review information when nothing is visible", () => {
    const summary = summariseVerification([makeReview({ admin_approved: false })]);
    expect(summary.kind).toBe("none");
    expect(summary.types).toEqual([]);
    expect(summary.notice).toMatch(/No review information/);
  });

  it("never presents author approval as independent verification", () => {
    const summary = summariseVerification([makeReview({ review_type: "author_approved" })]);
    expect(summary.hasApproval).toBe(true);
    expect(summary.hasIndependentReview).toBe(false);
    expect(summary.kind).toBe("approval_only");
    expect(summary.notice).toMatch(/not independent verification/i);
  });

  it("never presents publisher approval as independent verification", () => {
    const summary = summariseVerification([makeReview({ review_type: "publisher_approved" })]);
    expect(summary.hasIndependentReview).toBe(false);
    expect(summary.kind).toBe("approval_only");
  });

  it.each(["fact_checked", "expert_reviewed", "educator_reviewed"] as const)(
    "treats %s as independent review",
    (review_type) => {
      const summary = summariseVerification([makeReview({ review_type })]);
      expect(summary.hasIndependentReview).toBe(true);
      expect(summary.kind).toBe("independent");
    },
  );

  it("does not treat a story classification as any kind of verification", () => {
    const summary = summariseVerification([makeReview({ review_type: "story_and_imagination" })]);
    expect(summary.hasApproval).toBe(false);
    expect(summary.hasIndependentReview).toBe(false);
    expect(summary.kind).toBe("story_only");
  });

  it("keeps approval and independent review distinct when a book has both", () => {
    const summary = summariseVerification([
      makeReview({ id: "a", review_type: "author_approved" }),
      makeReview({ id: "b", review_type: "fact_checked" }),
    ]);
    expect(summary.hasApproval).toBe(true);
    expect(summary.hasIndependentReview).toBe(true);
    expect(summary.types).toEqual(["fact_checked", "author_approved"]);
  });

  it("ignores records that are not public even if a policy mistake returned them", () => {
    const summary = summariseVerification([
      makeReview({ id: "a", review_type: "fact_checked", status: "draft" }),
      makeReview({ id: "b", review_type: "author_approved" }),
    ]);
    expect(summary.hasIndependentReview).toBe(false);
    expect(summary.reviews.map((r) => r.id)).toEqual(["b"]);
  });
});

describe("reviewer credentials", () => {
  it("shows credentials only when they were verified", () => {
    const unverified = makeReview({ public_credentials: "Professor of Astronomy", credentials_verified: false });
    const verified = makeReview({ public_credentials: "Professor of Astronomy", credentials_verified: true });
    expect(displayCredentials(unverified)).toBeNull();
    expect(displayCredentials(verified)).toBe("Professor of Astronomy");
  });

  it("returns nothing for blank credentials", () => {
    expect(displayCredentials(makeReview({ public_credentials: "  ", credentials_verified: true }))).toBeNull();
  });
});

describe("source links", () => {
  it("allows only http(s) URLs", () => {
    expect(safeSourceUrl("https://example.org/paper")).toBe("https://example.org/paper");
    expect(safeSourceUrl("javascript:alert(1)")).toBeNull();
    expect(safeSourceUrl("data:text/html,<script>")).toBeNull();
    expect(safeSourceUrl("not a url")).toBeNull();
    expect(safeSourceUrl(null)).toBeNull();
  });
});
