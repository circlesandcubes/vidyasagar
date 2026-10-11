import type { BookEditorDefaults } from "@/components/book-editor-form";
import { formatLines } from "@/lib/validation/submission";

export type SellerBookRow = {
  id: string; title: string; subtitle: string | null; description: string | null; status: string;
  publication_date: string | null; age_min_months: number | null; age_max_months: number | null;
  cover_image_url: string | null; cover_image_alt: string | null; rights_confirmed: boolean;
  rights_statement: string | null; submitted_credits: unknown; proposed_skills: unknown;
  proposed_links: unknown; proposed_personalisation: unknown;
};

export function bookRowToDefaults(row: SellerBookRow): BookEditorDefaults {
  return {
    title: row.title,
    subtitle: row.subtitle ?? "",
    description: row.description ?? "",
    publicationDate: row.publication_date ?? "",
    ageMinMonths: row.age_min_months?.toString() ?? "",
    ageMaxMonths: row.age_max_months?.toString() ?? "",
    coverImageUrl: row.cover_image_url ?? "",
    coverImageAlt: row.cover_image_alt ?? "",
    rightsConfirmed: row.rights_confirmed,
    rightsStatement: row.rights_statement ?? "",
    credits: formatLines<{ name: string; role: string }>(row.submitted_credits, (c) => `${c.name} | ${c.role}`),
    skills: formatLines<{ skill: string; explanation: string }>(row.proposed_skills, (s) => `${s.skill} | ${s.explanation}`),
    links: formatLines<{ channel: string; url: string }>(row.proposed_links, (l) => `${l.channel} ${l.url}`),
    personalisation: formatLines<{ idea: string }>(row.proposed_personalisation, (p) => p.idea),
  };
}

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  editorial_review: "In editorial review",
  changes_requested: "Changes requested",
  approved: "Approved (not yet published)",
  published: "Published",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  archived: "Archived",
};
