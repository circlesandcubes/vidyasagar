// Domain types for the public catalogue. These describe what the public site is
// allowed to see; private columns (evidence, admin notes) are never selected.

export type ContributorRole = "author" | "illustrator" | "editor" | "translator";
export type BookFormat = "paperback" | "hardcover" | "board_book" | "ebook" | "other";
export type EditionAvailability = "available" | "preorder" | "out_of_print" | "unavailable";
export type SkillRelation = "practised" | "supported" | "incidental";
export type PurchaseChannel = "direct" | "amazon" | "flipkart" | "bulk_enquiry";
export type FulfilmentParty = "vidyasagar" | "publisher" | "external";

export type VerificationType =
  | "author_approved"
  | "publisher_approved"
  | "fact_checked"
  | "expert_reviewed"
  | "educator_reviewed"
  | "story_and_imagination";

export type VerificationStatus = "draft" | "pending_approval" | "published" | "withdrawn";

export interface Author {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  image_url: string | null;
  image_alt: string | null;
  website_url: string | null;
}

export interface Publisher {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  logo_alt: string | null;
  website_url: string | null;
}

export interface Contributor {
  role: ContributorRole;
  display_order: number;
  author: Pick<Author, "id" | "name" | "slug">;
}

export interface PurchaseChannelRecord {
  id: string;
  channel: PurchaseChannel;
  region: string;
  is_enabled: boolean;
  fulfilment: FulfilmentParty;
  destination_url: string | null;
  last_validated_on: string | null;
}

export interface Edition {
  id: string;
  format: BookFormat;
  language: string;
  isbn13: string | null;
  publication_date: string | null;
  page_count: number | null;
  availability: EditionAvailability;
  is_primary: boolean;
  publisher: Pick<Publisher, "id" | "name" | "slug"> | null;
  channels: PurchaseChannelRecord[];
}

export interface Skill {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  age_guidance: string | null;
  icon: string | null;
  display_order: number;
}

export interface BookSkillLink {
  relation: SkillRelation;
  explanation: string;
  rationale: string | null;
  attribution_source: string | null;
  is_approved: boolean;
  skill: Pick<Skill, "id" | "parent_id" | "name" | "slug">;
}

export interface Subject {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface ReviewSource {
  title: string;
  url: string | null;
}

export interface VerificationReview {
  id: string;
  edition_id: string | null;
  review_type: VerificationType;
  reviewer_name: string | null;
  reviewer_organisation: string | null;
  approval_authority: string | null;
  scope: string;
  claims_covered: string | null;
  sources: ReviewSource[];
  limitations: string | null;
  reviewed_on: string | null;
  version_reviewed: string | null;
  public_credentials: string | null;
  credentials_verified: boolean;
  publication_permission: boolean;
  admin_approved: boolean;
  status: VerificationStatus;
}

export interface AgeGroup {
  id: string;
  name: string;
  slug: string;
  min_months: number;
  max_months: number;
  display_order: number;
}

export interface CatalogueBook {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  age_min_months: number | null;
  age_max_months: number | null;
  is_featured: boolean;
  publication_date: string | null;
  created_at: string;
  contributors: Contributor[];
  editions: Edition[];
  skills: BookSkillLink[];
  subjects: Subject[];
  reviews: VerificationReview[];
}

export interface CollectionBookRef {
  book_id: string;
  position: number;
  curator_note: string | null;
}

export interface Collection {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  is_featured: boolean;
  display_order: number;
  books: CollectionBookRef[];
}
