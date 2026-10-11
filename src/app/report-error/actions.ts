"use server";

import { redirect } from "next/navigation";
import { allowRequest } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import { createUserClient } from "@/lib/supabase/server";
import { formDataToObject } from "@/lib/validation/auth";
import { reportSchema, safeReportPath } from "@/lib/validation/report";

export async function submitReportAction(formData: FormData) {
  const raw = formDataToObject(formData);
  const back = (code: string) => redirect(`/report-error?error=${code}`);
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) return back("invalid_input");
  if (!(await allowRequest("report", 5, 3600))) return back("rate_limited");

  const service = createServiceClient();
  if (!service) return back("not_configured");

  let bookId: string | null = null;
  if (parsed.data.bookSlug) {
    // Resolve through the public (RLS-limited) client: only published books can be reported against.
    const user = await createUserClient();
    const { data } = (await user?.from("books").select("id").eq("slug", parsed.data.bookSlug).maybeSingle()) ?? { data: null };
    bookId = data?.id ?? null;
  }
  const session = await createUserClient();
  const { data: who } = (await session?.auth.getUser()) ?? { data: { user: null } };

  const { error } = await service.from("content_error_reports").insert({
    book_id: bookId,
    page_path: safeReportPath(raw.pagePath),
    category: parsed.data.category,
    description: parsed.data.description,
    contact_email: parsed.data.contactEmail ?? null,
    reporter_id: who.user?.id ?? null,
  });
  if (error) return back("failed");
  redirect("/report-error?notice=reported");
}
