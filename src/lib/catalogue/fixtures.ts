// Test fixtures only. Never imported by application code.
import type {
  AgeGroup,
  BookSkillLink,
  CatalogueBook,
  Edition,
  PurchaseChannelRecord,
  Skill,
  VerificationReview,
} from "@/lib/catalogue/types";

export function makeBook(overrides: Partial<CatalogueBook> = {}): CatalogueBook {
  return {
    id: "book-1",
    title: "Example Book",
    slug: "example-book",
    subtitle: null,
    description: "An example description.",
    cover_image_url: null,
    cover_image_alt: null,
    age_min_months: null,
    age_max_months: null,
    is_featured: false,
    publication_date: null,
    created_at: "2026-01-01T00:00:00Z",
    contributors: [],
    editions: [],
    skills: [],
    subjects: [],
    reviews: [],
    ...overrides,
  };
}

export function makeChannel(overrides: Partial<PurchaseChannelRecord> = {}): PurchaseChannelRecord {
  return {
    id: "channel-1",
    channel: "amazon",
    region: "IN",
    is_enabled: true,
    fulfilment: "external",
    destination_url: "https://www.amazon.in/dp/EXAMPLE",
    last_validated_on: null,
    ...overrides,
  };
}

export function makeEdition(overrides: Partial<Edition> = {}): Edition {
  return {
    id: "edition-1",
    format: "paperback",
    language: "en",
    isbn13: null,
    publication_date: null,
    page_count: null,
    availability: "available",
    is_primary: true,
    publisher: null,
    channels: [],
    ...overrides,
  };
}

export function makeReview(overrides: Partial<VerificationReview> = {}): VerificationReview {
  return {
    id: "review-1",
    edition_id: null,
    review_type: "author_approved",
    reviewer_name: "A. Author",
    reviewer_organisation: null,
    approval_authority: null,
    scope: "Whole text",
    claims_covered: null,
    sources: [],
    limitations: null,
    reviewed_on: "2026-01-01",
    version_reviewed: null,
    public_credentials: null,
    credentials_verified: false,
    publication_permission: true,
    admin_approved: true,
    status: "published",
    ...overrides,
  };
}

export function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "skill-1",
    parent_id: null,
    name: "Numeracy",
    slug: "numeracy",
    description: null,
    age_guidance: null,
    icon: null,
    display_order: 0,
    ...overrides,
  };
}

export function makeSkillLink(overrides: Partial<BookSkillLink> = {}): BookSkillLink {
  return {
    relation: "practised",
    explanation: "Counts objects one by one.",
    rationale: null,
    attribution_source: null,
    is_approved: true,
    skill: { id: "skill-1", parent_id: null, name: "Numeracy", slug: "numeracy" },
    ...overrides,
  };
}

export function makeAgeGroup(overrides: Partial<AgeGroup> = {}): AgeGroup {
  return {
    id: "age-1",
    name: "Ages 2–4",
    slug: "ages-2-4",
    min_months: 24,
    max_months: 59,
    display_order: 1,
    ...overrides,
  };
}
