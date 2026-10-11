"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorCode } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { formDataToObject } from "@/lib/validation/auth";
import { collectionBookSchema, collectionSchema } from "@/lib/validation/taxonomy";

const PATH = "/admin/collections";
async function ctx() {
  await requireRole(["admin", "curator"], PATH);
  const client = await createUserClient();
  if (!client) redirect(`${PATH}?error=not_configured`);
  return client;
}
function done(error: string | null): never {
  revalidatePath(PATH);
  revalidatePath("/collections", "layout");
  redirect(`${PATH}?${error ? `error=${error}` : "notice=saved"}`);
}

export async function createCollectionAction(formData: FormData) {
  const client = await ctx();
  const p = collectionSchema.safeParse(formDataToObject(formData));
  if (!p.success) return done("invalid_input");
  const { error } = await client.from("collections").insert({
    title: p.data.title, slug: p.data.slug, description: p.data.description ?? null, is_published: p.data.isPublished, is_featured: p.data.isFeatured,
  });
  return done(error ? dbErrorCode(error.message) : null);
}

export async function setCollectionFlagsAction(id: string, flag: "is_published" | "is_featured", value: boolean) {
  const client = await ctx();
  if (flag !== "is_published" && flag !== "is_featured") return done("invalid_input");
  const { error } = await client.from("collections").update({ [flag]: value }).eq("id", id);
  return done(error ? dbErrorCode(error.message) : null);
}

export async function addCollectionBookAction(collectionId: string, formData: FormData) {
  const client = await ctx();
  const p = collectionBookSchema.safeParse(formDataToObject(formData));
  if (!p.success) return done("invalid_input");
  const { error } = await client.from("collection_books").upsert(
    { collection_id: collectionId, book_id: p.data.bookId, position: p.data.position, curator_note: p.data.curatorNote ?? null },
    { onConflict: "collection_id,book_id" },
  );
  return done(error ? dbErrorCode(error.message) : null);
}

export async function removeCollectionBookAction(collectionId: string, bookId: string) {
  const client = await ctx();
  const { error } = await client.from("collection_books").delete().eq("collection_id", collectionId).eq("book_id", bookId);
  return done(error ? dbErrorCode(error.message) : null);
}
