"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorCode } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";

export async function moderateReviewAction(reviewId: string, status: "published" | "rejected") {
  await requireRole(["admin", "curator"], "/admin/reviews");
  const client = await createUserClient();
  if (!client) redirect("/admin/reviews?error=not_configured");
  const me = await client.auth.getUser();
  const { error } = await client.from("book_reviews").update({ status, moderated_by: me.data.user?.id }).eq("id", reviewId);
  revalidatePath("/admin/reviews");
  redirect(`/admin/reviews?${error ? `error=${dbErrorCode(error.message)}` : "notice=decided"}`);
}
