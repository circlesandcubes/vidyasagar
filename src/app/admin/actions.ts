"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorCode } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { formDataToObject } from "@/lib/validation/auth";
import {
  assignReviewerSchema, channelSchema, correctionSchema, creditSchema, editionAdminSchema, noteSchema,
  reportTriageSchema, reviewDecisionSchema, skillLinkSchema, verificationPublishSchema,
} from "@/lib/validation/admin";
import { slugifyTitle } from "@/lib/validation/submission";

type Fail = string | null;

async function staffClient(next: string) {
  await requireRole(["admin", "curator"], next);
  const client = await createUserClient();
  if (!client) redirect(`${next}?error=not_configured`);
  return client;
}

function done(path: string, failure: Fail, ok = "saved"): never {
  revalidatePath(path);
  redirect(`${path}?${failure ? `error=${failure}` : `notice=${ok}`}`);
}

export async function reviewApplicationAction(applicationId: string, approve: boolean, formData: FormData) {
  const client = await staffClient("/admin/applications");
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000) || null;
  const { error } = await client.rpc("review_seller_application", { p_id: applicationId, p_approve: approve, p_note: note });
  done("/admin/applications", error ? (/note is required/i.test(error.message) ? "note_required" : dbErrorCode(error.message)) : null, "decided");
}

export async function transitionBookAction(bookId: string, formData: FormData) {
  const path = `/admin/books/${bookId}`;
  const client = await staffClient(path);
  const parsed = reviewDecisionSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) done(path, "invalid_input");
  else {
    const { error } = await client.from("books").update({ status: parsed.data.to, status_note: parsed.data.note ?? null }).eq("id", bookId);
    done(path, error ? dbErrorCode(error.message) : null, "decided");
  }
}

export async function addCreditAction(bookId: string, formData: FormData) {
  const path = `/admin/books/${bookId}`;
  const client = await staffClient(path);
  const parsed = creditSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return done(path, "invalid_input");
  let authorId = parsed.data.authorId;
  if (!authorId && parsed.data.newAuthorName) {
    const slug = `${slugifyTitle(parsed.data.newAuthorName)}-${crypto.randomUUID().slice(0, 6)}`;
    const created = await client.from("authors").insert({ name: parsed.data.newAuthorName, slug }).select("id").single();
    if (created.error || !created.data) return done(path, dbErrorCode(created.error?.message));
    authorId = created.data.id;
  }
  const { error } = await client.from("book_contributors").upsert({ book_id: bookId, author_id: authorId, role: parsed.data.role });
  done(path, error ? dbErrorCode(error.message) : null);
}

export async function removeCreditAction(bookId: string, authorId: string, role: string) {
  const client = await staffClient(`/admin/books/${bookId}`);
  const { error } = await client.from("book_contributors").delete().eq("book_id", bookId).eq("author_id", authorId).eq("role", role);
  done(`/admin/books/${bookId}`, error ? dbErrorCode(error.message) : null);
}

export async function setAuthorPublishedAction(bookId: string, authorId: string, published: boolean) {
  const client = await staffClient(`/admin/books/${bookId}`);
  const { error } = await client.from("authors").update({ is_published: published }).eq("id", authorId);
  done(`/admin/books/${bookId}`, error ? dbErrorCode(error.message) : null);
}

export async function saveSkillLinkAction(bookId: string, formData: FormData) {
  const path = `/admin/books/${bookId}`;
  const client = await staffClient(path);
  const parsed = skillLinkSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return done(path, "invalid_input");
  const { error } = await client.from("book_skills").upsert({
    book_id: bookId, skill_id: parsed.data.skillId, relation: parsed.data.relation,
    explanation: parsed.data.explanation, is_approved: parsed.data.isApproved,
  });
  done(path, error ? dbErrorCode(error.message) : null);
}

export async function removeSkillLinkAction(bookId: string, skillId: string) {
  const client = await staffClient(`/admin/books/${bookId}`);
  const { error } = await client.from("book_skills").delete().eq("book_id", bookId).eq("skill_id", skillId);
  done(`/admin/books/${bookId}`, error ? dbErrorCode(error.message) : null);
}

export async function saveEditionAdminAction(bookId: string, editionId: string, formData: FormData) {
  const path = `/admin/books/${bookId}`;
  const client = await staffClient(path);
  const parsed = editionAdminSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return done(path, "invalid_input");
  const { error } = await client.from("book_editions").update({ availability: parsed.data.availability, is_primary: parsed.data.isPrimary }).eq("id", editionId);
  done(path, error ? dbErrorCode(error.message) : null);
}

export async function saveChannelAction(bookId: string, editionId: string, formData: FormData) {
  const path = `/admin/books/${bookId}`;
  const client = await staffClient(path);
  const parsed = channelSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return done(path, "invalid_input");
  const { error } = await client.from("edition_purchase_channels").upsert(
    {
      edition_id: editionId, channel: parsed.data.channel, region: "IN", fulfilment: "external",
      destination_url: parsed.data.url, is_enabled: parsed.data.isEnabled, last_validated_on: new Date().toISOString().slice(0, 10),
    },
    { onConflict: "edition_id,channel,region" },
  );
  done(path, error ? dbErrorCode(error.message) : null);
}

export async function assignReviewerAction(bookId: string, formData: FormData) {
  const path = `/admin/books/${bookId}`;
  const client = await staffClient(path);
  const parsed = assignReviewerSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return done(path, "invalid_input");
  const me = await client.auth.getUser();
  const { error } = await client.from("review_assignments").upsert(
    { book_id: bookId, reviewer_id: parsed.data.reviewerId, assigned_by: me.data.user?.id, status: "assigned" },
    { onConflict: "book_id,reviewer_id" },
  );
  done(path, error ? dbErrorCode(error.message) : null);
}

export async function addInternalNoteAction(bookId: string, formData: FormData) {
  const path = `/admin/books/${bookId}`;
  const client = await staffClient(path);
  const parsed = noteSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return done(path, "invalid_input");
  const me = await client.auth.getUser();
  const { error } = await client.from("book_internal_notes").insert({ book_id: bookId, author_id: me.data.user?.id, body: parsed.data.body });
  done(path, error ? dbErrorCode(error.message) : null);
}

/** Admin-only: publishing a verification record is checked by a database trigger as well. */
export async function publishVerificationAction(bookId: string, reviewId: string, formData: FormData) {
  const path = `/admin/books/${bookId}`;
  await requireRole(["admin"], path);
  const client = await createUserClient();
  if (!client) return done(path, "not_configured");
  const parsed = verificationPublishSchema.safeParse(formDataToObject(formData));
  if (!parsed.success || !parsed.data.publicationPermission) return done(path, "invalid_input");
  const { error } = await client.from("verification_reviews").update({
    publication_permission: true, credentials_verified: parsed.data.credentialsVerified,
    admin_approved: true, reviewed_on: parsed.data.reviewedOn, status: "published",
  }).eq("id", reviewId);
  done(path, error ? dbErrorCode(error.message) : null);
}

export async function unpublishVerificationAction(bookId: string, reviewId: string) {
  const path = `/admin/books/${bookId}`;
  await requireRole(["admin"], path);
  const client = await createUserClient();
  if (!client) return done(path, "not_configured");
  const { error } = await client.from("verification_reviews").update({ status: "withdrawn", admin_approved: false }).eq("id", reviewId);
  done(path, error ? dbErrorCode(error.message) : null);
}

export async function triageReportAction(reportId: string, formData: FormData) {
  const client = await staffClient("/admin/reports");
  const parsed = reportTriageSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return done("/admin/reports", "invalid_input");
  const me = await client.auth.getUser();
  const { error } = await client.from("content_error_reports").update({
    status: parsed.data.status, resolution_note: parsed.data.resolutionNote ?? null, handled_by: me.data.user?.id,
  }).eq("id", reportId);
  done("/admin/reports", error ? dbErrorCode(error.message) : null);
}

export async function addCorrectionAction(reportId: string, bookId: string, formData: FormData) {
  const client = await staffClient("/admin/reports");
  const parsed = correctionSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return done("/admin/reports", "invalid_input");
  const me = await client.auth.getUser();
  const { error } = await client.from("content_corrections").insert({
    book_id: bookId, report_id: reportId, summary: parsed.data.summary, is_published: parsed.data.isPublished, created_by: me.data.user?.id,
  });
  done("/admin/reports", error ? dbErrorCode(error.message) : null);
}
