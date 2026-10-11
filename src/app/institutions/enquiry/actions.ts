"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createBulkEnquiry } from "@/lib/commerce/enquiries";
import { serviceRoleConfigured } from "@/lib/env";
import { allowRequest } from "@/lib/rate-limit";
import { formDataToObject } from "@/lib/validation/auth";
import { enquirySchema } from "@/lib/validation/enquiry";

export async function submitEnquiryAction(formData: FormData) {
  const raw = formDataToObject(formData);
  const parsed = enquirySchema.safeParse(raw);
  if (!parsed.success) redirect("/institutions/enquiry?error=invalid_input");
  // A filled honeypot is a bot: pretend success, store nothing.
  if (parsed.data.website) redirect("/institutions/enquiry?notice=submitted_enquiry");
  if (!serviceRoleConfigured()) redirect("/institutions/enquiry?error=not_configured");
  if (!(await allowRequest("bulk-enquiry", 5, 3600))) redirect("/institutions/enquiry?error=rate_limited");
  const user = await getCurrentUser();
  const d = parsed.data;
  const result = await createBulkEnquiry({
    userId: user?.id ?? null, organisation: d.organisation, organisationType: d.organisationType, contactName: d.contactName,
    email: d.email, phone: d.phone, city: d.city, state: d.state, quantity: d.quantity, neededBy: d.neededBy, message: d.message,
    items: d.bookId ? [{ book_id: d.bookId, quantity: d.bookQuantity ?? d.quantity ?? 1 }] : [],
  });
  if (!result) redirect("/institutions/enquiry?error=failed");
  redirect(`/institutions/enquiry?notice=submitted_enquiry&ref=${encodeURIComponent(result.reference)}`);
}
