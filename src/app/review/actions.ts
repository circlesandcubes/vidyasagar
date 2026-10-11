"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorCode } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { formDataToObject } from "@/lib/validation/auth";
import { parseSources, verificationDraftSchema } from "@/lib/validation/admin";

export async function saveVerificationDraftAction(bookId: string, formData: FormData) {
  const path = `/review/${bookId}`;
  await requireRole(["reviewer", "admin", "curator"], path);
  const client = await createUserClient();
  if (!client) redirect(`${path}?error=not_configured`);
  const raw = formDataToObject(formData);
  const parsed = verificationDraftSchema.safeParse(raw);
  const sources = parseSources(raw.sources ?? "");
  if (!parsed.success || sources.errors.length) redirect(`${path}?error=invalid_input`);
  const d = parsed.data;
  const submit = raw.submit === "on";
  const { error } = await client.from("verification_reviews").insert({
    book_id: bookId,
    review_type: d.reviewType,
    reviewer_name: d.reviewerName ?? null,
    reviewer_organisation: d.reviewerOrganisation ?? null,
    approval_authority: d.approvalAuthority ?? null,
    scope: d.scope,
    claims_covered: d.claimsCovered ?? null,
    limitations: d.limitations ?? null,
    reviewed_on: d.reviewedOn ?? null,
    version_reviewed: d.versionReviewed ?? null,
    public_credentials: null, // credentials are only ever set after an admin verifies them
    sources: sources.items,
    status: submit ? "pending_approval" : "draft",
  });
  revalidatePath(path);
  redirect(`${path}?${error ? `error=${dbErrorCode(error.message)}` : "notice=saved"}`);
}

export async function addEvidenceNoteAction(bookId: string, reviewId: string, formData: FormData) {
  const path = `/review/${bookId}`;
  await requireRole(["reviewer", "admin", "curator"], path);
  const client = await createUserClient();
  if (!client) redirect(`${path}?error=not_configured`);
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  if (!note) redirect(`${path}?error=invalid_input`);
  const { error } = await client.from("verification_evidence").insert({ review_id: reviewId, kind: "note", note });
  redirect(`${path}?${error ? `error=${dbErrorCode(error.message)}` : "notice=saved"}`);
}
