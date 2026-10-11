import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";

// Session-dependent: must never be prerendered or cached.
export const dynamic = "force-dynamic";

export const metadata = { title: "Assigned for review", robots: { index: false, follow: false } };

export default async function ReviewHome() {
  await requireRole(["reviewer", "admin", "curator"], "/review");
  const client = await createUserClient();
  const { data } = (await client?.from("review_assignments").select("id, status, book:books(id, title)").order("created_at", { ascending: false })) ?? { data: [] };
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Reviewer" title="Books assigned to you" />
        {!data?.length ? <p className="empty-state">Nothing is assigned to you right now.</p> : (
          <ul className="plain-list">
            {data.map((a) => {
              const book = (Array.isArray(a.book) ? a.book[0] : a.book) as { id: string; title: string } | null;
              return book ? <li key={a.id}><Link href={`/review/${book.id}`}>{book.title}</Link> — {a.status}</li> : null;
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
