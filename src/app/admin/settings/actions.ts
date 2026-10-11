"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorCode } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";

const ALLOWED_FLAGS = ["reviews_enabled"];

export async function setFlagAction(key: string, value: boolean) {
  await requireRole(["admin"], "/admin/settings");
  if (!ALLOWED_FLAGS.includes(key)) redirect("/admin/settings?error=invalid_input");
  const client = await createUserClient();
  if (!client) redirect("/admin/settings?error=not_configured");
  const me = await client.auth.getUser();
  const { error } = await client.from("site_settings").update({ value, updated_by: me.data.user?.id }).eq("key", key);
  revalidatePath("/admin/settings");
  revalidatePath("/books", "layout");
  redirect(`/admin/settings?${error ? `error=${dbErrorCode(error.message)}` : "notice=saved"}`);
}
