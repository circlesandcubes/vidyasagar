"use server";

import { getPersonalisationForBook, getPublishedBookBySlug } from "@/lib/catalogue/data";
import { validatePersonalisation } from "@/lib/personalisation";
import { formDataToObject } from "@/lib/validation/auth";

export type PreviewState =
  | { status: "idle" }
  | { status: "invalid"; errors: Record<string, string>; input: Record<string, string> }
  | { status: "ok"; values: Record<string, string> };

/**
 * Validates against the template as stored in the database (never against
 * field definitions sent by the browser). POST, so names do not end up in URLs
 * or access logs.
 */
export async function previewPersonalisationAction(slug: string, templateSlug: string, _prev: PreviewState, formData: FormData): Promise<PreviewState> {
  const book = await getPublishedBookBySlug(slug);
  if (!book) return { status: "idle" };
  const template = (await getPersonalisationForBook(book.id)).find((t) => t.slug === templateSlug);
  if (!template) return { status: "idle" };
  const input = formDataToObject(formData);
  const result = validatePersonalisation(template.fields, input);
  return result.ok ? { status: "ok", values: result.values } : { status: "invalid", errors: result.errors, input };
}
