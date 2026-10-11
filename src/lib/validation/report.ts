import { z } from "zod";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const REPORT_CATEGORIES = [
  ["factual_error", "A fact in the book or listing is wrong"],
  ["skill_mapping", "A skill note does not fit the book"],
  ["age_suitability", "The age guidance seems wrong"],
  ["broken_link", "A purchase link is broken or wrong"],
  ["rights_or_safety", "A rights or safety concern"],
  ["other", "Something else"],
] as const;

export const reportSchema = z.object({
  category: z.enum(REPORT_CATEGORIES.map((c) => c[0]) as [string, ...string[]]),
  description: z.string().trim().min(10, "Please describe the problem in at least 10 characters.").max(4000),
  contactEmail: z.preprocess(blank, z.string().trim().toLowerCase().email().max(254).optional()),
  bookSlug: z.preprocess(blank, z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(120).optional()),
  // Honeypot: real people never fill this in.
  website: z.string().max(0).optional().default(""),
});

export function safeReportPath(value: string | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\s\\]/.test(value) || value.length > 300) return null;
  return value;
}
