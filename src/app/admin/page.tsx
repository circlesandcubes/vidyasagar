import { requireRole } from "@/lib/auth/session";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { createUserClient } from "@/lib/supabase/server";

// Session-dependent: must never be prerendered or cached.
export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  await requireRole(["admin", "curator"], "/admin");
  const client = await createUserClient();
  const count = async (table: string, filter?: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!client) return 0;
    let query = client.from(table).select("id", { count: "exact", head: true });
    if (filter) query = filter(query);
    const { count: n } = await query;
    return n ?? 0;
  };
  const [pendingApps, submitted, inReview, openReports] = await Promise.all([
    count("seller_applications", (q) => q.eq("status", "pending")),
    count("books", (q) => q.eq("status", "submitted")),
    count("books", (q) => q.eq("status", "editorial_review")),
    count("content_error_reports", (q) => q.eq("status", "open")),
  ]);
  return (
    <>
      <PageIntro eyebrow="Admin" title="Overview" />
      <ul className="plain-list">
        <li><Link href="/admin/applications">{pendingApps} seller application(s) waiting</Link></li>
        <li><Link href="/admin/books?status=submitted">{submitted} book(s) submitted, not yet picked up</Link></li>
        <li><Link href="/admin/books?status=editorial_review">{inReview} book(s) in editorial review</Link></li>
        <li><Link href="/admin/reports">{openReports} open error report(s)</Link></li>
      </ul>
    </>
  );
}
