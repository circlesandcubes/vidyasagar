import { z } from "zod";

export type PersonalisationFieldType = "text" | "textarea" | "choice";

export type PersonalisationField = {
  key: string;
  label: string;
  help_text: string | null;
  field_type: PersonalisationFieldType;
  is_required: boolean;
  min_length: number;
  max_length: number;
  choices: string[] | null;
  display_order: number;
};

export type PersonalisationTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  preview_note: string | null;
  price_adjustment_minor: number;
  lead_time_days: number | null;
  fields: PersonalisationField[];
};

// Letters/marks/digits in any script, spaces and a few name punctuation marks.
// Deliberately excludes < > & quotes and control characters so values are safe
// to print on a cover, put in an email, or render in HTML and CSV.
const SAFE_LINE = /^[\p{L}\p{M}\p{N} '’.\-]+$/u;
const SAFE_MULTILINE = /^[\p{L}\p{M}\p{N} '’.,!?\-\n]+$/u;

export function cleanValue(raw: string, multiline: boolean): string {
  const normalised = raw.normalize("NFC").replace(/\r\n?/g, "\n");
  const squashed = multiline
    ? normalised.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n")
    : normalised.replace(/\s+/g, " ");
  return squashed.trim();
}

/** Builds a validator from the template's own field definitions. */
export function buildPersonalisationSchema(fields: readonly PersonalisationField[]) {
  const shape: Record<string, z.ZodType<string | undefined>> = {};
  for (const f of fields) {
    let base: z.ZodType<string>;
    if (f.field_type === "choice") {
      const choices = f.choices ?? [];
      base = z.string().refine((v) => choices.includes(v), `Choose one of the listed options for ${f.label}.`);
    } else {
      const multiline = f.field_type === "textarea";
      base = z
        .string()
        .transform((v) => cleanValue(v, multiline))
        .pipe(
          z
            .string()
            .min(Math.max(f.min_length, 1), `${f.label} must be at least ${Math.max(f.min_length, 1)} characters.`)
            .max(f.max_length, `${f.label} must be at most ${f.max_length} characters.`)
            .regex(multiline ? SAFE_MULTILINE : SAFE_LINE, `${f.label} contains characters that cannot be printed.`),
        );
    }
    shape[f.key] = f.is_required
      ? base
      : z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), base.optional());
  }
  return z.strictObject(shape);
}

export type PersonalisationResult =
  | { ok: true; values: Record<string, string> }
  | { ok: false; errors: Record<string, string> };

export function validatePersonalisation(fields: readonly PersonalisationField[], input: Record<string, unknown>): PersonalisationResult {
  // Unknown keys are dropped (not errors) so extra form fields cannot smuggle data into a snapshot.
  const known: Record<string, unknown> = {};
  for (const f of fields) known[f.key] = input[f.key] ?? "";
  const parsed = buildPersonalisationSchema(fields).safeParse(known);
  if (parsed.success) {
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.data)) if (typeof v === "string") values[k] = v;
    return { ok: true, values };
  }
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "_")] ??= issue.message;
  return { ok: false, errors };
}

/**
 * The immutable record stored on an order line (Phase 4). It copies the field
 * definitions as they were at purchase time, so later template edits never
 * change what was ordered.
 */
export type PersonalisationSnapshot = {
  template_id: string;
  template_slug: string;
  template_name: string;
  price_adjustment_minor: number;
  fields: { key: string; label: string; value: string }[];
};

export function snapshotPersonalisation(template: PersonalisationTemplate, values: Record<string, string>): PersonalisationSnapshot {
  return {
    template_id: template.id,
    template_slug: template.slug,
    template_name: template.name,
    price_adjustment_minor: template.price_adjustment_minor,
    fields: [...template.fields]
      .sort((a, b) => a.display_order - b.display_order)
      .filter((f) => values[f.key] !== undefined)
      .map((f) => ({ key: f.key, label: f.label, value: values[f.key] })),
  };
}
