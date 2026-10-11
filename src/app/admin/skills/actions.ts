"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorCode } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { formDataToObject } from "@/lib/validation/auth";
import { skillSchema } from "@/lib/validation/taxonomy";

const PATH = "/admin/skills";
async function ctx() {
  await requireRole(["admin", "curator"], PATH);
  const client = await createUserClient();
  if (!client) redirect(`${PATH}?error=not_configured`);
  return client;
}
function done(error: string | null): never {
  revalidatePath(PATH);
  revalidatePath("/skills", "layout");
  redirect(`${PATH}?${error ? `error=${error}` : "notice=saved"}`);
}

export async function createSkillAction(formData: FormData) {
  const client = await ctx();
  const p = skillSchema.safeParse(formDataToObject(formData));
  if (!p.success) return done("invalid_input");
  const { error } = await client.from("skills").insert({
    name: p.data.name, slug: p.data.slug, parent_id: p.data.parentId ?? null, description: p.data.description ?? null,
    age_guidance: p.data.ageGuidance ?? null, display_order: p.data.displayOrder, is_published: p.data.isPublished,
  });
  return done(error ? dbErrorCode(error.message) : null);
}

export async function setSkillPublishedAction(id: string, published: boolean) {
  const client = await ctx();
  const { error } = await client.from("skills").update({ is_published: published }).eq("id", id);
  return done(error ? dbErrorCode(error.message) : null);
}
