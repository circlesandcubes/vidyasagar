import Link from "next/link";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireRole } from "@/lib/auth/session";
import { STATUS_LABELS } from "@/lib/seller/book-defaults";
import { createUserClient } from "@/lib/supabase/server";

// Session-dependent: must never be prerendered or cached.
export const dynamic = "force-dynamic";

export const metadata = { title: "Your books", robots: { index: false, follow: false } };

export default async function SellerDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  await requireRole(["author", "publisher"], "/sell");
  const client = await createUserClient();
  const { data: books } = (await client?.from("books").select("id, title, status, updated_at").order("updated_at", { ascending: false })) ?? { data: [] };
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Sell" title="Your books" />
        <Flash searchParams={params} />
        <p><Link className="button" href="/sell/books/new">Add a book</Link></p>
        {!books?.length ? (
          <p className="empty-state">You have not added any books yet.</p>
        ) : (
          <table className="data-table">
            <caption className="visually-hidden">Your book listings</caption>
            <thead><tr><th scope="col">Title</th><th scope="col">Status</th><th scope="col">Updated</th></tr></thead>
            <tbody>
              {books.map((book) => (
                <tr key={book.id}>
                  <th scope="row"><Link href={`/sell/books/${book.id}`}>{book.title}</Link></th>
                  <td>{STATUS_LABELS[book.status] ?? book.status}</td>
                  <td>{new Date(book.updated_at).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
