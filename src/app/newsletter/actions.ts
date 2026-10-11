"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requestSubscription } from "@/lib/commerce/newsletter";
import { serviceRoleConfigured } from "@/lib/env";
import { allowRequest } from "@/lib/rate-limit";

const email = z.string().trim().email().max(254);

export async function subscribeAction(formData: FormData) {
  if (!serviceRoleConfigured()) redirect("/newsletter?error=not_configured");
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) redirect("/newsletter?error=invalid_input");
  if (!(await allowRequest("newsletter", 5, 900))) redirect("/newsletter?error=rate_limited");
  const result = await requestSubscription(parsed.data);
  redirect(result === "sent" ? "/newsletter?notice=check_email" : "/newsletter?error=not_configured");
}
