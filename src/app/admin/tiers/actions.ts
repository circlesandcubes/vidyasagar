"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorCode } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { formDataToObject } from "@/lib/validation/auth";
import { tierSchema } from "@/lib/validation/enquiry";

const PATH = "/admin/tiers";
async function ctx() {
  await requireRole(["admin"], PATH);
  const client = await createUserClient();
  if (!client) redirect(`${PATH}?error=not_configured`);
  return client;
}
function done(error: string | null): never {
  revalidatePath(PATH);
  revalidatePath("/institutions");
  redirect(`${PATH}?${error ? `error=${error}` : "notice=saved"}`);
}

export async function createTierAction(formData: FormData) {
  const client = await ctx();
  const p = tierSchema.safeParse(formDataToObject(formData));
  if (!p.success) return done("invalid_input");
  const { error } = await client.from("bulk_price_tiers").insert({ label: p.data.label, min_quantity: p.data.minQuantity, discount_bps: Math.round(p.data.percent * 100), is_public: p.data.isPublic });
  return done(error ? dbErrorCode(error.message) : null);
}

export async function deleteTierAction(id: string) {
  const client = await ctx();
  const { error } = await client.from("bulk_price_tiers").delete().eq("id", id);
  return done(error ? dbErrorCode(error.message) : null);
}
