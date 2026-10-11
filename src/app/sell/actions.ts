"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorCode, friendlyDbError, type ActionState } from "@/lib/action-state";
import { getCurrentRoles, getCurrentUser } from "@/lib/auth/session";
import { isSeller } from "@/lib/auth/roles";
import { createUserClient } from "@/lib/supabase/server";
import { formDataToObject } from "@/lib/validation/auth";
import {
  bookDraftSchema,
  editionSchema,
  parseCredits,
  parseLinks,
  parsePersonalisation,
  parseSkills,
  sellerApplicationSchema,
  slugifyTitle,
} from "@/lib/validation/submission";

function zodErrors(error: { issues: { message: string; path: PropertyKey[] }[] }): string[] {
  return error.issues.map((issue) => issue.message);
}

export async function applyAsSellerAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/join");
  const parsed = sellerApplicationSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) redirect("/join?error=invalid_input");
  const client = await createUserClient();
  if (!client) redirect("/join?error=not_configured");
  const { error } = await client.from("seller_applications").insert({
    user_id: user.id,
    kind: parsed.data.kind,
    display_name: parsed.data.displayName,
    bio: parsed.data.bio ?? null,
    website_url: parsed.data.websiteUrl ?? null,
  });
  if (error?.code === "23505") redirect("/join?notice=already_applied");
  if (error) redirect("/join?error=failed");
  redirect("/join?notice=applied");
}

function buildBookFields(formData: FormData): { fields?: Record<string, unknown>; errors: string[] } {
  const raw = formDataToObject(formData);
  const parsed = bookDraftSchema.safeParse(raw);
  const credits = parseCredits(raw.credits ?? "");
  const skills = parseSkills(raw.skills ?? "");
  const links = parseLinks(raw.links ?? "");
  const personalisation = parsePersonalisation(raw.personalisation ?? "");
  const errors = [
    ...(parsed.success ? [] : zodErrors(parsed.error)),
    ...credits.errors,
    ...skills.errors,
    ...links.errors,
    ...personalisation.errors,
  ];
  if (!parsed.success || errors.length) return { errors };
  const d = parsed.data;
  return {
    errors,
    fields: {
      title: d.title,
      subtitle: d.subtitle ?? null,
      description: d.description ?? null,
      publication_date: d.publicationDate ?? null,
      age_min_months: d.ageMinMonths ?? null,
      age_max_months: d.ageMaxMonths ?? null,
      cover_image_url: d.coverImageUrl ?? null,
      cover_image_alt: d.coverImageAlt ?? null,
      rights_confirmed: d.rightsConfirmed,
      rights_statement: d.rightsStatement ?? null,
      submitted_credits: credits.items,
      proposed_skills: skills.items,
      proposed_links: links.items,
      proposed_personalisation: personalisation.items,
    },
  };
}

export async function createBookAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const roles = await getCurrentRoles();
  if (!isSeller(roles)) return { ok: false, errors: ["Only approved authors and publishers can submit books."] };
  const { fields, errors } = buildBookFields(formData);
  if (!fields) return { ok: false, errors };
  const client = await createUserClient();
  if (!client) return { ok: false, errors: ["Accounts are not configured."] };

  const baseSlug = slugifyTitle(String(fields.title));
  // Suffix keeps slugs unique without exposing whether a title already exists.
  const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`;
  const { data, error } = await client.from("books").insert({ ...fields, slug }).select("id").single();
  if (error || !data) return { ok: false, errors: [friendlyDbError(error?.message)] };
  redirect(`/sell/books/${data.id}?notice=saved`);
}

export async function saveBookAction(bookId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { fields, errors } = buildBookFields(formData);
  if (!fields) return { ok: false, errors };
  const client = await createUserClient();
  if (!client) return { ok: false, errors: ["Accounts are not configured."] };
  const { data, error } = await client.from("books").update(fields).eq("id", bookId).select("id");
  if (error) return { ok: false, errors: [friendlyDbError(error.message)] };
  if (!data?.length) return { ok: false, errors: ["This listing could not be found or is not editable."] };
  revalidatePath(`/sell/books/${bookId}`);
  return { ok: true, message: "Saved." };
}

async function setStatus(bookId: string, status: "submitted" | "withdrawn" | "draft"): Promise<string | null> {
  const client = await createUserClient();
  if (!client) return "not_configured";
  const { data, error } = await client.from("books").update({ status }).eq("id", bookId).select("id");
  if (error) return dbErrorCode(error.message);
  if (!data?.length) return "failed";
  revalidatePath(`/sell/books/${bookId}`);
  revalidatePath("/sell");
  return null;
}

export async function submitBookAction(bookId: string) {
  const failure = await setStatus(bookId, "submitted");
  if (failure) redirect(`/sell/books/${bookId}?error=${failure}`);
  redirect(`/sell/books/${bookId}?notice=submitted`);
}

export async function withdrawBookAction(bookId: string) {
  const failure = await setStatus(bookId, "withdrawn");
  if (failure) redirect(`/sell/books/${bookId}?error=${failure}`);
  redirect(`/sell/books/${bookId}?notice=saved`);
}

export async function reopenBookAction(bookId: string) {
  const failure = await setStatus(bookId, "draft");
  if (failure) redirect(`/sell/books/${bookId}?error=${failure}`);
  redirect(`/sell/books/${bookId}?notice=saved`);
}

export async function addEditionAction(bookId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = editionSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const client = await createUserClient();
  if (!client) return { ok: false, errors: ["Accounts are not configured."] };
  const { error } = await client.from("book_editions").insert({
    book_id: bookId,
    format: parsed.data.format,
    language: parsed.data.language,
    isbn13: parsed.data.isbn13 ?? null,
    page_count: parsed.data.pageCount ?? null,
  });
  if (error) return { ok: false, errors: [friendlyDbError(error.message)] };
  revalidatePath(`/sell/books/${bookId}`);
  return { ok: true, message: "Edition added." };
}

export async function deleteEditionAction(bookId: string, editionId: string) {
  const client = await createUserClient();
  await client?.from("book_editions").delete().eq("id", editionId).eq("book_id", bookId);
  revalidatePath(`/sell/books/${bookId}`);
}
