import { requireRole } from "@/lib/auth/session";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { STATUS_LABELS } from "@/lib/seller/book-defaults";
import { createUserClient } from "@/lib/supabase/server";

export const metadata = { title: "Books and reviews" };

const FILTERS = ["submitted", "editorial_review", "changes_requested", "approved", "published", "draft", "withdrawn", "rejected", "archived"];

export default async function AdminBooksPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole(["admin", "curator"], "/admin/books");
  const { status } = await searchParams;
  const client = await createUserClient();
  let query = client?.from("books").select("id, title, status, submitted_by, updated_at").order("updated_at", { ascending: false }).limit(200);
  if (query && status && FILTERS.includes(status)) query = query.eq("status", status);
  const { data: books } = (await query) ?? { data: [] };
  return (
    <>
      <PageIntro eyebrow="Admin" title="Books and reviews" />
      <p className="small" aria-label="Filter by status">
        <Link href="/admin/books">All</Link>
        {FILTERS.map((f) => <span key={f}> · <Link href={`/admin/books?status=${f}`}>{STATUS_LABELS[f]}</Link></span>)}
      </p>
      <div className="data-table-wrap">
        <table className="data-table">
          <caption className="visually-hidden">Book listings</caption>
          <thead><tr><th scope="col">Title</th><th scope="col">Status</th><th scope="col">Source</th><th scope="col">Updated</th></tr></thead>
          <tbody>
            {books?.map((b) => (
              <tr key={b.id}>
                <th scope="row"><Link href={`/admin/books/${b.id}`}>{b.title}</Link></th>
                <td>{STATUS_LABELS[b.status] ?? b.status}</td>
                <td>{b.submitted_by ? "Seller submission" : "Staff"}</td>
                <td>{new Date(b.updated_at).toLocaleDateString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!books?.length && <p className="empty-state">No books match.</p>}
    </>
  );
}
