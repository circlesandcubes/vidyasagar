import type {
  AgeGroup,
  Author,
  BookSkillLink,
  CatalogueBook,
  Collection,
  Contributor,
  Edition,
  Publisher,
  ReviewSource,
  Skill,
  Subject,
  VerificationReview,
} from "@/lib/catalogue/types";

// PostgREST returns embedded rows as loosely typed JSON, and an embedded row the
// caller may not see (hidden by row-level security) comes back as null. These
// helpers turn that into the strict domain types and drop anything incomplete.

type Raw = Record<string, unknown>;

const asArray = (value: unknown): Raw[] => (Array.isArray(value) ? (value as Raw[]) : []);
const asObject = (value: unknown): Raw | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null;
const asString = (value: unknown): string | null => (typeof value === "string" ? value : null);
const asNumber = (value: unknown, fallback = 0): number => (typeof value === "number" ? value : fallback);

export const BOOK_SELECT = [
  "id,title,slug,subtitle,description,cover_image_url,cover_image_alt,age_min_months,age_max_months,is_featured,publication_date,created_at",
  "book_contributors(role,display_order,authors(id,name,slug))",
  "book_editions(id,format,language,isbn13,publication_date,page_count,availability,is_primary,publishers(id,name,slug),edition_purchase_channels(id,channel,region,is_enabled,fulfilment,destination_url,last_validated_on))",
  "book_skills(relation,explanation,rationale,attribution_source,is_approved,skills(id,parent_id,name,slug))",
  "book_subjects(subjects(id,name,slug,description))",
  "verification_reviews(id,edition_id,review_type,reviewer_name,reviewer_organisation,approval_authority,scope,claims_covered,sources,limitations,reviewed_on,version_reviewed,public_credentials,credentials_verified,publication_permission,admin_approved,status)",
].join(",");

function normaliseSources(value: unknown): ReviewSource[] {
  return asArray(value)
    .map((item) => ({ title: asString(item.title) ?? "", url: asString(item.url) }))
    .filter((source) => source.title.trim().length > 0);
}

function normaliseContributor(raw: Raw): Contributor | null {
  const author = asObject(raw.authors);
  if (!author) return null;
  return {
    role: raw.role as Contributor["role"],
    display_order: asNumber(raw.display_order),
    author: { id: String(author.id), name: String(author.name), slug: String(author.slug) },
  };
}

function normaliseEdition(raw: Raw): Edition {
  const publisher = asObject(raw.publishers);
  return {
    id: String(raw.id),
    format: raw.format as Edition["format"],
    language: asString(raw.language) ?? "en",
    isbn13: asString(raw.isbn13),
    publication_date: asString(raw.publication_date),
    page_count: typeof raw.page_count === "number" ? raw.page_count : null,
    availability: raw.availability as Edition["availability"],
    is_primary: raw.is_primary === true,
    publisher: publisher
      ? { id: String(publisher.id), name: String(publisher.name), slug: String(publisher.slug) }
      : null,
    channels: asArray(raw.edition_purchase_channels).map((c) => ({
      id: String(c.id),
      channel: c.channel as Edition["channels"][number]["channel"],
      region: asString(c.region) ?? "IN",
      is_enabled: c.is_enabled === true,
      fulfilment: c.fulfilment as Edition["channels"][number]["fulfilment"],
      destination_url: asString(c.destination_url),
      last_validated_on: asString(c.last_validated_on),
    })),
  };
}

function normaliseBookSkill(raw: Raw): BookSkillLink | null {
  const skill = asObject(raw.skills);
  if (!skill) return null;
  return {
    relation: raw.relation as BookSkillLink["relation"],
    explanation: asString(raw.explanation) ?? "",
    rationale: asString(raw.rationale),
    attribution_source: asString(raw.attribution_source),
    is_approved: raw.is_approved === true,
    skill: {
      id: String(skill.id),
      parent_id: asString(skill.parent_id),
      name: String(skill.name),
      slug: String(skill.slug),
    },
  };
}

function normaliseReview(raw: Raw): VerificationReview {
  return {
    id: String(raw.id),
    edition_id: asString(raw.edition_id),
    review_type: raw.review_type as VerificationReview["review_type"],
    reviewer_name: asString(raw.reviewer_name),
    reviewer_organisation: asString(raw.reviewer_organisation),
    approval_authority: asString(raw.approval_authority),
    scope: asString(raw.scope) ?? "",
    claims_covered: asString(raw.claims_covered),
    sources: normaliseSources(raw.sources),
    limitations: asString(raw.limitations),
    reviewed_on: asString(raw.reviewed_on),
    version_reviewed: asString(raw.version_reviewed),
    public_credentials: asString(raw.public_credentials),
    credentials_verified: raw.credentials_verified === true,
    publication_permission: raw.publication_permission === true,
    admin_approved: raw.admin_approved === true,
    status: raw.status as VerificationReview["status"],
  };
}

export function normaliseBook(raw: Raw): CatalogueBook {
  return {
    id: String(raw.id),
    title: String(raw.title),
    slug: String(raw.slug),
    subtitle: asString(raw.subtitle),
    description: asString(raw.description),
    cover_image_url: asString(raw.cover_image_url),
    cover_image_alt: asString(raw.cover_image_alt),
    age_min_months: typeof raw.age_min_months === "number" ? raw.age_min_months : null,
    age_max_months: typeof raw.age_max_months === "number" ? raw.age_max_months : null,
    is_featured: raw.is_featured === true,
    publication_date: asString(raw.publication_date),
    created_at: String(raw.created_at),
    contributors: asArray(raw.book_contributors)
      .map(normaliseContributor)
      .filter((c): c is Contributor => c !== null)
      .sort((a, b) => a.display_order - b.display_order || a.author.name.localeCompare(b.author.name)),
    editions: asArray(raw.book_editions)
      .map(normaliseEdition)
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary)),
    skills: asArray(raw.book_skills)
      .map(normaliseBookSkill)
      .filter((s): s is BookSkillLink => s !== null),
    subjects: asArray(raw.book_subjects)
      .map((row) => asObject(row.subjects))
      .filter((s): s is Raw => s !== null)
      .map((s) => ({
        id: String(s.id),
        name: String(s.name),
        slug: String(s.slug),
        description: asString(s.description),
      })),
    reviews: asArray(raw.verification_reviews).map(normaliseReview),
  };
}

export const normaliseAuthor = (raw: Raw): Author => ({
  id: String(raw.id),
  name: String(raw.name),
  slug: String(raw.slug),
  bio: asString(raw.bio),
  image_url: asString(raw.image_url),
  image_alt: asString(raw.image_alt),
  website_url: asString(raw.website_url),
});

export const normalisePublisher = (raw: Raw): Publisher => ({
  id: String(raw.id),
  name: String(raw.name),
  slug: String(raw.slug),
  description: asString(raw.description),
  logo_url: asString(raw.logo_url),
  logo_alt: asString(raw.logo_alt),
  website_url: asString(raw.website_url),
});

export const normaliseSkill = (raw: Raw): Skill => ({
  id: String(raw.id),
  parent_id: asString(raw.parent_id),
  name: String(raw.name),
  slug: String(raw.slug),
  description: asString(raw.description),
  age_guidance: asString(raw.age_guidance),
  icon: asString(raw.icon),
  display_order: asNumber(raw.display_order),
});

export const normaliseAgeGroup = (raw: Raw): AgeGroup => ({
  id: String(raw.id),
  name: String(raw.name),
  slug: String(raw.slug),
  min_months: asNumber(raw.min_months),
  max_months: asNumber(raw.max_months),
  display_order: asNumber(raw.display_order),
});

export const normaliseSubject = (raw: Raw): Subject => ({
  id: String(raw.id),
  name: String(raw.name),
  slug: String(raw.slug),
  description: asString(raw.description),
});

export const normaliseCollection = (raw: Raw): Collection => ({
  id: String(raw.id),
  title: String(raw.title),
  slug: String(raw.slug),
  description: asString(raw.description),
  is_featured: raw.is_featured === true,
  display_order: asNumber(raw.display_order),
  books: asArray(raw.collection_books)
    .map((row) => ({
      book_id: String(row.book_id),
      position: asNumber(row.position),
      curator_note: asString(row.curator_note),
    }))
    .sort((a, b) => a.position - b.position),
});
