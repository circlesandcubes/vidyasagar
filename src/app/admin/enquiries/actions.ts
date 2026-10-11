"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dbErrorCode } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { sendEmail } from "@/lib/commerce/server";
import { createUserClient } from "@/lib/supabase/server";
import { parseRupeesToMinor } from "@/lib/money";
import { formDataToObject } from "@/lib/validation/auth";
import { noteSchema } from "@/lib/validation/enquiry";

const STATUSES = ["new", "in_progress", "quoted", "accepted", "declined", "closed"] as const;

async function ctx(reference: string) {
  const path = `/admin/enquiries/${reference}`;
  const { user } = await requireRole(["admin"], path);
  const client = await createUserClient();
  if (!client) redirect(`${path}?error=not_configured`);
  return { client, path, userId: user.id };
}
function done(path: string, error: string | null): never {
  revalidatePath(path);
  redirect(`${path}?${error ? `error=${error}` : "notice=saved"}`);
}

export async function setEnquiryStatusAction(enquiryId: string, reference: string, formData: FormData) {
  const { client, path, userId } = await ctx(reference);
  const status = z.enum(STATUSES).safeParse(formData.get("status"));
  if (!status.success) return done(path, "invalid_input");
  const assign = formData.get("assign") === "me";
  const { error } = await client.from("bulk_enquiries").update({ status: status.data, ...(assign ? { assigned_to: userId } : {}) }).eq("id", enquiryId);
  return done(path, error ? dbErrorCode(error.message) : null);
}

export async function addNoteAction(enquiryId: string, reference: string, formData: FormData) {
  const { client, path, userId } = await ctx(reference);
  const p = noteSchema.safeParse(formDataToObject(formData));
  if (!p.success) return done(path, "invalid_input");
  const { error } = await client.from("bulk_enquiry_notes").insert({ enquiry_id: enquiryId, author_id: userId, body: p.data.body });
  return done(path, error ? dbErrorCode(error.message) : null);
}

export async function createQuotationAction(enquiryId: string, reference: string) {
  const { client, path, userId } = await ctx(reference);
  const { error } = await client.from("quotations").insert({ enquiry_id: enquiryId, created_by: userId });
  return done(path, error ? dbErrorCode(error.message) : null);
}

const lineSchema = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  unit: z.string().trim().transform((v, ctx) => {
    const minor = parseRupeesToMinor(v);
    if (minor === null) { ctx.addIssue({ code: "custom", message: "Enter the unit price in rupees." }); return z.NEVER; }
    return minor;
  }),
  editionId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
});

export async function addQuotationLineAction(quotationId: string, reference: string, formData: FormData) {
  const { client, path } = await ctx(reference);
  const p = lineSchema.safeParse(formDataToObject(formData));
  if (!p.success) return done(path, "invalid_input");
  const { error } = await client.from("quotation_lines").insert({
    quotation_id: quotationId, description: p.data.description, quantity: p.data.quantity, unit_price_minor: p.data.unit,
    line_total_minor: p.data.quantity * p.data.unit, edition_id: p.data.editionId ?? null,
  });
  return done(path, error ? dbErrorCode(error.message) : null);
}

export async function removeQuotationLineAction(lineId: string, reference: string) {
  const { client, path } = await ctx(reference);
  const { error } = await client.from("quotation_lines").delete().eq("id", lineId);
  return done(path, error ? dbErrorCode(error.message) : null);
}

const termsSchema = z.object({
  shipping: z.string().trim().transform((v, ctx) => { const m = parseRupeesToMinor(v || "0"); if (m === null) { ctx.addIssue({ code: "custom" }); return z.NEVER; } return m; }),
  discount: z.string().trim().transform((v, ctx) => { const m = parseRupeesToMinor(v || "0"); if (m === null) { ctx.addIssue({ code: "custom" }); return z.NEVER; } return m; }),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  terms: z.string().trim().max(4000).optional(),
});

export async function saveQuotationTermsAction(quotationId: string, reference: string, formData: FormData) {
  const { client, path } = await ctx(reference);
  const p = termsSchema.safeParse(formDataToObject(formData));
  if (!p.success) return done(path, "invalid_input");
  const { error } = await client.from("quotations").update({
    shipping_minor: p.data.shipping, discount_minor: p.data.discount, valid_until: p.data.validUntil || null, terms: p.data.terms || null,
  }).eq("id", quotationId);
  return done(path, error ? dbErrorCode(error.message) : null);
}

export async function issueQuotationAction(quotationId: string, reference: string) {
  const { client, path } = await ctx(reference);
  const { error } = await client.from("quotations").update({ status: "issued" }).eq("id", quotationId);
  if (error) return done(path, /validity/i.test(error.message) ? "validity_required" : /at least one line/i.test(error.message) ? "lines_required" : dbErrorCode(error.message));
  const { data: q } = await client.from("quotations").select("reference, total_minor, valid_until, enquiry:bulk_enquiries(email)").eq("id", quotationId).maybeSingle();
  const enquiry = Array.isArray(q?.enquiry) ? q?.enquiry[0] : q?.enquiry;
  if (q && enquiry?.email) await sendEmail(`quotation-issued:${q.reference}`, enquiry.email, { kind: "quotation_ready", reference: q.reference, totalMinor: q.total_minor, validUntil: q.valid_until });
  await client.from("bulk_enquiries").update({ status: "quoted" }).eq("reference", reference);
  return done(path, null);
}

export async function respondQuotationAction(quotationId: string, reference: string, status: "accepted" | "declined" | "expired") {
  const { client, path } = await ctx(reference);
  const { error } = await client.from("quotations").update({ status }).eq("id", quotationId);
  return done(path, error ? dbErrorCode(error.message) : null);
}
