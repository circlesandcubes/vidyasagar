"use server";

import { redirect } from "next/navigation";
import { dbErrorCode } from "@/lib/action-state";
import { getCurrentUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { reviewSchema } from "@/lib/validation/account";
import { formDataToObject } from "@/lib/validation/auth";

export async function submitReviewAction(bookId: string, slug: string, formData: FormData) {
  const path = `/books/${slug}/review`;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  const parsed = reviewSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) redirect(`${path}?error=invalid_input`);
  const client = await createUserClient();
  if (!client) redirect(`${path}?error=not_configured`);
  const { error } = await client.from("book_reviews").insert({
    book_id: bookId, user_id: user.id, rating: parsed.data.rating, body: parsed.data.body, display_name: parsed.data.displayName ?? null,
  });
  if (error?.code === "23505") redirect(`${path}?error=duplicate`);
  redirect(`${path}?${error ? `error=${dbErrorCode(error.message)}` : "notice=submitted"}`);
}
