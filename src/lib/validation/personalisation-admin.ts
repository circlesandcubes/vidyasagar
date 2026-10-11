import { z } from "zod";
import { parseRupeesToMinor } from "@/lib/money";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());
const intOpt = (min: number, max: number) => z.preprocess(blank, z.coerce.number().int().min(min).max(max).optional());

export const templateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens."),
  description: z.preprocess(blank, z.string().trim().max(1000).optional()),
  previewNote: z.preprocess(blank, z.string().trim().max(500).optional()),
  price: z.preprocess(blank, z.string().optional()).transform((v, ctx) => {
    if (v === undefined) return 0;
    const minor = parseRupeesToMinor(v);
    if (minor === null) { ctx.addIssue({ code: "custom", message: "Enter the extra charge in rupees, e.g. 150 or 149.50." }); return z.NEVER; }
    return minor;
  }),
  leadTimeDays: intOpt(0, 365),
});

export const fieldSchema = z
  .object({
    key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/, "Key: lowercase letters, numbers and underscores."),
    label: z.string().trim().min(1).max(120),
    helpText: z.preprocess(blank, z.string().trim().max(300).optional()),
    fieldType: z.enum(["text", "textarea", "choice"]),
    isRequired: checkbox,
    minLength: z.preprocess(blank, z.coerce.number().int().min(0).max(500).default(0)),
    maxLength: z.preprocess(blank, z.coerce.number().int().min(1).max(500).default(30)),
    choices: z.preprocess(blank, z.string().max(2000).optional()),
  })
  .superRefine((v, ctx) => {
    if (v.minLength > v.maxLength) ctx.addIssue({ code: "custom", path: ["minLength"], message: "Minimum length cannot exceed maximum." });
    if (v.fieldType === "choice" && parseChoices(v.choices).length === 0) ctx.addIssue({ code: "custom", path: ["choices"], message: "Give at least one choice (comma-separated)." });
  });

export function parseChoices(text: string | undefined): string[] {
  if (!text) return [];
  return [...new Set(text.split(",").map((c) => c.trim()).filter((c) => c && c.length <= 60))].slice(0, 30);
}

export const attachSchema = z.object({
  bookSlug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  templateId: z.string().uuid(),
});
