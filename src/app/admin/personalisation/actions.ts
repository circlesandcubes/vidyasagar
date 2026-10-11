"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorCode } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { formDataToObject } from "@/lib/validation/auth";
import { attachSchema, fieldSchema, parseChoices, templateSchema } from "@/lib/validation/personalisation-admin";

const PATH = "/admin/personalisation";

async function ctx() {
  await requireRole(["admin", "curator"], PATH);
  const client = await createUserClient();
  if (!client) redirect(`${PATH}?error=not_configured`);
  return client;
}
function done(error: string | null): never {
  revalidatePath(PATH);
  redirect(`${PATH}?${error ? `error=${error}` : "notice=saved"}`);
}

export async function createTemplateAction(formData: FormData) {
  const client = await ctx();
  const p = templateSchema.safeParse(formDataToObject(formData));
  if (!p.success) return done("invalid_input");
  const { error } = await client.from("personalisation_templates").insert({
    name: p.data.name, slug: p.data.slug, description: p.data.description ?? null, preview_note: p.data.previewNote ?? null,
    price_adjustment_minor: p.data.price, lead_time_days: p.data.leadTimeDays ?? null,
  });
  done(error ? dbErrorCode(error.message) : null);
}

export async function addFieldAction(templateId: string, formData: FormData) {
  const client = await ctx();
  const p = fieldSchema.safeParse(formDataToObject(formData));
  if (!p.success) return done("invalid_input");
  const { count } = await client.from("personalisation_fields").select("key", { count: "exact", head: true }).eq("template_id", templateId);
  const { error } = await client.from("personalisation_fields").insert({
    template_id: templateId, key: p.data.key, label: p.data.label, help_text: p.data.helpText ?? null,
    field_type: p.data.fieldType, is_required: p.data.isRequired, min_length: p.data.minLength, max_length: p.data.maxLength,
    choices: p.data.fieldType === "choice" ? parseChoices(p.data.choices) : null, display_order: count ?? 0,
  });
  done(error ? dbErrorCode(error.message) : null);
}

export async function removeFieldAction(templateId: string, key: string) {
  const client = await ctx();
  const { error } = await client.from("personalisation_fields").delete().eq("template_id", templateId).eq("key", key);
  done(error ? dbErrorCode(error.message) : null);
}

export async function setTemplateActiveAction(templateId: string, active: boolean) {
  const client = await ctx();
  if (active) {
    const { count } = await client.from("personalisation_fields").select("key", { count: "exact", head: true }).eq("template_id", templateId);
    if (!count) return done("invalid_input"); // a template with no fields cannot go live
  }
  const { error } = await client.from("personalisation_templates").update({ is_active: active }).eq("id", templateId);
  done(error ? dbErrorCode(error.message) : null);
}

export async function attachTemplateAction(formData: FormData) {
  const client = await ctx();
  const p = attachSchema.safeParse(formDataToObject(formData));
  if (!p.success) return done("invalid_input");
  const { data: book } = await client.from("books").select("id").eq("slug", p.data.bookSlug).maybeSingle();
  if (!book) return done("invalid_input");
  const { error } = await client.from("book_personalisation").upsert({ book_id: book.id, template_id: p.data.templateId, is_enabled: formData.get("enabled") === "on" });
  done(error ? dbErrorCode(error.message) : null);
}
