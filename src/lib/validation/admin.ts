import { z } from "zod";
import { isAllowedRetailerUrl } from "@/lib/catalogue/purchase";
import { CONTRIBUTOR_ROLES, reviewDecisionSchema } from "@/lib/validation/submission";

const uuid = z.string().uuid();
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());
const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());

export { reviewDecisionSchema };

export const creditSchema = z
  .object({
    authorId: z.preprocess(blank, uuid.optional()),
    newAuthorName: text(160),
    role: z.enum(CONTRIBUTOR_ROLES),
  })
  .refine((v) => Boolean(v.authorId) !== Boolean(v.newAuthorName), {
    message: "Choose an existing person or enter a new name, not both.",
  });

export const skillLinkSchema = z.object({
  skillId: uuid,
  relation: z.enum(["practised", "supported", "incidental"]),
  explanation: z.string().trim().min(10, "Explain how the book supports the skill (10+ characters).").max(500),
  isApproved: checkbox,
});

export const channelSchema = z
  .object({
    channel: z.enum(["amazon", "flipkart"]),
    url: z.string().trim().url().max(1000),
    isEnabled: checkbox,
  })
  .refine((v) => isAllowedRetailerUrl(v.channel, v.url), {
    message: "The link must be https on the retailer's own domain.",
    path: ["url"],
  });

export const editionAdminSchema = z.object({
  availability: z.enum(["available", "unavailable", "preorder", "out_of_print"]),
  isPrimary: checkbox,
});

export const assignReviewerSchema = z.object({ reviewerId: uuid });
export const noteSchema = z.object({ body: z.string().trim().min(1).max(4000) });

export const reportTriageSchema = z.object({
  status: z.enum(["open", "triaged", "resolved", "dismissed"]),
  resolutionNote: text(2000),
});

export const correctionSchema = z.object({
  summary: z.string().trim().min(5).max(1000),
  isPublished: checkbox,
});

export const verificationDraftSchema = z.object({
  reviewType: z.enum(["author_approved", "publisher_approved", "fact_checked", "expert_reviewed", "educator_reviewed", "story_and_imagination"]),
  reviewerName: text(160),
  reviewerOrganisation: text(160),
  approvalAuthority: text(160),
  scope: z.string().trim().min(1).max(1000),
  claimsCovered: text(2000),
  limitations: text(2000),
  reviewedOn: z.preprocess(blank, z.iso.date().optional()),
  versionReviewed: text(120),
  publicCredentials: text(300),
  sources: z.string().default(""),
});

/** "Title | https://…" per line; non-http(s) URLs are rejected, not stored. */
export function parseSources(textValue: string): { items: { title: string; url: string }[]; errors: string[] } {
  const items: { title: string; url: string }[] = [];
  const errors: string[] = [];
  for (const line of textValue.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [title, url] = line.split("|").map((p) => p.trim());
    if (!title || !url || !/^https?:\/\/\S+$/i.test(url)) errors.push(`Source "${line.slice(0, 40)}" must look like: Title | https://…`);
    else items.push({ title: title.slice(0, 200), url: url.slice(0, 500) });
  }
  return { items: items.slice(0, 20), errors };
}

export const verificationPublishSchema = z.object({
  publicationPermission: checkbox,
  credentialsVerified: checkbox,
  reviewedOn: z.iso.date(),
});
