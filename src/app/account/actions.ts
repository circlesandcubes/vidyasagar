"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorCode } from "@/lib/action-state";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { addressSchema, interestsSchema, profileSchema } from "@/lib/validation/account";
import { formDataToObject } from "@/lib/validation/auth";

async function userContext(next: string) {
  const user = await requireUser(next);
  const client = await createUserClient();
  if (!client) redirect(`${next}?error=not_configured`);
  return { user, client };
}

function back(path: string, error: string | null, ok = "saved"): never {
  revalidatePath(path);
  redirect(`${path}?${error ? `error=${error}` : `notice=${ok}`}`);
}

export async function updateProfileAction(formData: FormData) {
  const { user, client } = await userContext("/account/profile");
  const parsed = profileSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return back("/account/profile", "invalid_input");
  const { error } = await client.from("profiles").update({ display_name: parsed.data.displayName || null }).eq("id", user.id);
  back("/account/profile", error ? dbErrorCode(error.message) : null);
}

export async function saveAddressAction(formData: FormData) {
  const { user, client } = await userContext("/account/addresses");
  const parsed = addressSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return back("/account/addresses", "invalid_input");
  const d = parsed.data;
  if (d.isDefault) await client.from("addresses").update({ is_default: false }).eq("user_id", user.id);
  const { error } = await client.from("addresses").insert({
    user_id: user.id, label: d.label ?? null, recipient_name: d.recipientName, phone: d.phone ?? null,
    line1: d.line1, line2: d.line2 ?? null, city: d.city, state: d.state, postal_code: d.postalCode, is_default: d.isDefault,
  });
  back("/account/addresses", error ? dbErrorCode(error.message) : null);
}

export async function deleteAddressAction(addressId: string) {
  const { client } = await userContext("/account/addresses");
  const { error } = await client.from("addresses").delete().eq("id", addressId);
  back("/account/addresses", error ? dbErrorCode(error.message) : null);
}

export async function makeDefaultAddressAction(addressId: string) {
  const { user, client } = await userContext("/account/addresses");
  await client.from("addresses").update({ is_default: false }).eq("user_id", user.id);
  const { error } = await client.from("addresses").update({ is_default: true }).eq("id", addressId);
  back("/account/addresses", error ? dbErrorCode(error.message) : null);
}

export async function saveInterestsAction(formData: FormData) {
  const { user, client } = await userContext("/account/interests");
  const parsed = interestsSchema.safeParse({
    skillIds: formData.getAll("skillIds").map(String),
    ageGroupIds: formData.getAll("ageGroupIds").map(String),
  });
  if (!parsed.success) return back("/account/interests", "invalid_input");
  // Replace-all inside the user's own rows; RLS prevents touching anyone else's.
  await client.from("user_skill_interests").delete().eq("user_id", user.id);
  await client.from("user_age_groups").delete().eq("user_id", user.id);
  if (parsed.data.skillIds.length) {
    const { error } = await client.from("user_skill_interests").insert(parsed.data.skillIds.map((skill_id) => ({ user_id: user.id, skill_id })));
    if (error) return back("/account/interests", dbErrorCode(error.message));
  }
  if (parsed.data.ageGroupIds.length) {
    const { error } = await client.from("user_age_groups").insert(parsed.data.ageGroupIds.map((age_group_id) => ({ user_id: user.id, age_group_id })));
    if (error) return back("/account/interests", dbErrorCode(error.message));
  }
  back("/account/interests", null);
}

/** Used from the (statically cached) book page, so it must cope with signed-out visitors. */
export async function saveBookAction(bookId: string, slug: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/books/${slug}`)}`);
  const client = await createUserClient();
  if (!client) redirect(`/books/${slug}`);
  const { error } = await client.from("saved_books").upsert({ user_id: user.id, book_id: bookId }, { onConflict: "user_id,book_id", ignoreDuplicates: true });
  revalidatePath("/account/saved");
  redirect(error ? `/books/${slug}` : "/account/saved?notice=saved");
}

export async function unsaveBookAction(bookId: string) {
  const { user, client } = await userContext("/account/saved");
  const { error } = await client.from("saved_books").delete().eq("book_id", bookId).eq("user_id", user.id);
  back("/account/saved", error ? dbErrorCode(error.message) : null);
}
