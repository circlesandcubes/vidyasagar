import { z } from "zod";
import { isAllowedRetailerUrl } from "@/lib/catalogue/purchase";
import { isValidIsbn13, normaliseIsbn13 } from "@/lib/catalogue/isbn";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalText = (max: number) => z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());
const optionalInt = (min: number, max: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().min(min).max(max).optional());

export const CONTRIBUTOR_ROLES = ["author", "illustrator", "editor", "translator"] as const;
export const BOOK_FORMATS = ["paperback", "hardcover", "board_book", "ebook", "other"] as const;

// ---- line-based proposal fields -------------------------------------------

export type ProposedCredit = { name: string; role: (typeof CONTRIBUTOR_ROLES)[number] };
export type ProposedSkill = { skill: string; explanation: string };
export type ProposedLink = { channel: "amazon" | "flipkart"; url: string };

const lines = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

export type LineResult<T> = { items: T[]; errors: string[] };

/** "Name | role" per line; role defaults to author. */
export function parseCredits(text: string): LineResult<ProposedCredit> {
  const items: ProposedCredit[] = [];
  const errors: string[] = [];
  for (const line of lines(text)) {
    const [name, role = "author"] = line.split("|").map((p) => p.trim());
    if (!name || name.length > 160) errors.push(`Credit "${line.slice(0, 40)}" needs a name.`);
    else if (!(CONTRIBUTOR_ROLES as readonly string[]).includes(role.toLowerCase()))
      errors.push(`Credit role "${role}" must be one of ${CONTRIBUTOR_ROLES.join(", ")}.`);
    else items.push({ name, role: role.toLowerCase() as ProposedCredit["role"] });
  }
  if (items.length > 20) errors.push("At most 20 credits.");
  return { items: items.slice(0, 20), errors };
}

/** "Skill name | why this book supports it" — the explanation is mandatory. */
export function parseSkills(text: string): LineResult<ProposedSkill> {
  const items: ProposedSkill[] = [];
  const errors: string[] = [];
  for (const line of lines(text)) {
    const [skill, ...rest] = line.split("|");
    const explanation = rest.join("|").trim();
    if (!skill.trim() || explanation.length < 10)
      errors.push(`Skill "${line.slice(0, 40)}" needs "name | explanation" (explanation at least 10 characters).`);
    else if (explanation.length > 500) errors.push(`Explanation for "${skill.trim()}" is too long.`);
    else items.push({ skill: skill.trim().slice(0, 100), explanation });
  }
  if (items.length > 12) errors.push("At most 12 skills.");
  return { items: items.slice(0, 12), errors };
}

/** "amazon https://…" or "flipkart https://…" per line; host-checked. */
export function parseLinks(text: string): LineResult<ProposedLink> {
  const items: ProposedLink[] = [];
  const errors: string[] = [];
  for (const line of lines(text)) {
    const match = /^(amazon|flipkart)\s+(\S+)$/i.exec(line);
    if (!match) {
      errors.push(`Link "${line.slice(0, 40)}" must look like: amazon https://…`);
      continue;
    }
    const channel = match[1].toLowerCase() as ProposedLink["channel"];
    if (!isAllowedRetailerUrl(channel, match[2])) errors.push(`${channel} link is not an https URL on the retailer's own domain.`);
    else items.push({ channel, url: match[2] });
  }
  if (items.length > 6) errors.push("At most 6 links.");
  return { items: items.slice(0, 6), errors };
}

export function parsePersonalisation(text: string): LineResult<{ idea: string }> {
  const ls = lines(text);
  const errors = ls.some((l) => l.length > 300) ? ["Each personalisation idea must be under 300 characters."] : [];
  if (ls.length > 10) errors.push("At most 10 personalisation ideas.");
  return { items: ls.slice(0, 10).map((idea) => ({ idea: idea.slice(0, 300) })), errors };
}

export function formatLines<T>(items: unknown, render: (item: T) => string): string {
  return Array.isArray(items) ? (items as T[]).map(render).join("\n") : "";
}

// ---- book draft ------------------------------------------------------------

export const bookDraftSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required.").max(200),
    subtitle: optionalText(200),
    description: optionalText(5000),
    publicationDate: z.preprocess(emptyToUndefined, z.iso.date().optional()),
    ageMinMonths: optionalInt(0, 216),
    ageMaxMonths: optionalInt(0, 216),
    coverImageUrl: z.preprocess(emptyToUndefined, z.url({ protocol: /^https$/ }).max(500).optional()),
    coverImageAlt: optionalText(300),
    rightsConfirmed: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
    rightsStatement: optionalText(4000),
  })
  .refine((v) => v.ageMinMonths === undefined || v.ageMaxMonths === undefined || v.ageMinMonths <= v.ageMaxMonths, {
    message: "Minimum age must not exceed maximum age.",
    path: ["ageMaxMonths"],
  })
  .refine((v) => !v.coverImageUrl || Boolean(v.coverImageAlt), {
    message: "Describe the cover image for people who cannot see it.",
    path: ["coverImageAlt"],
  });

export function slugifyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");
  return base || "book";
}

export const editionSchema = z.object({
  format: z.enum(BOOK_FORMATS),
  language: z.string().trim().regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/, "Use a language code such as en or hi.").default("en"),
  isbn13: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? normaliseIsbn13(v) : v),
    z.string().refine(isValidIsbn13, "That is not a valid ISBN-13.").optional(),
  ),
  pageCount: optionalInt(1, 5000),
});

// ---- seller application ----------------------------------------------------

export const sellerApplicationSchema = z.object({
  kind: z.enum(["author", "publisher"]),
  displayName: z.string().trim().min(1).max(160),
  bio: optionalText(4000),
  websiteUrl: z.preprocess(emptyToUndefined, z.url({ protocol: /^https$/ }).max(300).optional()),
});

// ---- note on a status change -----------------------------------------------

export const reviewDecisionSchema = z.object({
  to: z.enum(["editorial_review", "changes_requested", "approved", "rejected", "published", "archived", "withdrawn"]),
  note: optionalText(2000),
});
