import { notFound } from "next/navigation";
import { BookEditorForm } from "@/components/book-editor-form";
import { EditionForm } from "@/components/edition-form";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireRole } from "@/lib/auth/session";
import { bookRowToDefaults, STATUS_LABELS, type SellerBookRow } from "@/lib/seller/book-defaults";
import { createUserClient } from "@/lib/supabase/server";
import {
  addEditionAction, deleteEditionAction, reopenBookAction, saveBookAction, submitBookAction, withdrawBookAction,
} from "@/app/sell/actions";

// Session-dependent: must never be prerendered or cached.
export const dynamic = "force-dynamic";

export const metadata = { title: "Edit book", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditBookPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const query = await searchParams;
  if (!UUID.test(id)) notFound();
  await requireRole(["author", "publisher"], `/sell/books/${id}`);
  const client = await createUserClient();
  if (!client) notFound();

  const { data: book } = await client.from("books").select("*").eq("id", id).maybeSingle();
  if (!book) notFound();
  const row = book as unknown as SellerBookRow;
  const editable = row.status === "draft" || row.status === "changes_requested";

  const [{ data: editions }, { data: events }] = await Promise.all([
    client.from("book_editions").select("id, format, language, isbn13, page_count").eq("book_id", id).order("created_at"),
    client.from("editorial_events").select("id, to_status, note, created_at").eq("book_id", id).order("created_at", { ascending: false }),
  ]);
  const latestChangeRequest = events?.find((e) => e.to_status === "changes_requested");

  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Sell" title={row.title} lede={`Status: ${STATUS_LABELS[row.status] ?? row.status}`} />
        <Flash searchParams={query} />

        {row.status === "changes_requested" && latestChangeRequest?.note && (
          <section className="panel" aria-labelledby="changes-heading">
            <h2 id="changes-heading">Changes requested by the editors</h2>
            <p>{latestChangeRequest.note}</p>
          </section>
        )}
        {!editable && (
          <p className="verification-notice">
            This listing cannot be edited while it is {STATUS_LABELS[row.status]?.toLowerCase() ?? row.status}.
          </p>
        )}

        <BookEditorForm
          action={saveBookAction.bind(null, id)}
          defaults={bookRowToDefaults(row)}
          disabled={!editable}
          submitLabel="Save changes"
        />

        <section aria-labelledby="editions-heading" className="form-section">
          <h2 id="editions-heading" className="form-heading">Editions</h2>
          {!editions?.length ? <p className="muted">No editions yet. Editors need at least one before approval.</p> : (
            <ul className="plain-list">
              {editions.map((e) => (
                <li key={e.id}>
                  {e.format.replace("_", " ")} · {e.language}{e.isbn13 ? ` · ISBN ${e.isbn13}` : ""}{e.page_count ? ` · ${e.page_count} pages` : ""}
                  {editable && (
                    <form action={deleteEditionAction.bind(null, id, e.id)} className="inline-form">
                      <button className="link-button" type="submit">Remove</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {editable && <EditionForm action={addEditionAction.bind(null, id)} />}
        </section>

        <section aria-labelledby="actions-heading" className="form-section">
          <h2 id="actions-heading" className="form-heading">Review</h2>
          {editable && (
            <form action={submitBookAction.bind(null, id)}>
              <p className="small muted">Save your changes first. Submitting sends the listing to the editors and locks it for editing.</p>
              <button className="button" type="submit">Submit for editorial review</button>
            </form>
          )}
          {["submitted", "approved", "changes_requested", "draft"].includes(row.status) && (
            <form action={withdrawBookAction.bind(null, id)} className="inline-form">
              <button className="link-button" type="submit">Withdraw this listing</button>
            </form>
          )}
          {row.status === "withdrawn" && (
            <form action={reopenBookAction.bind(null, id)}>
              <button className="button" type="submit">Reopen as draft</button>
            </form>
          )}
        </section>

        {!!events?.length && (
          <section aria-labelledby="history-heading" className="form-section">
            <h2 id="history-heading" className="form-heading">History</h2>
            <ol className="plain-list">
              {events.map((e) => (
                <li key={e.id}>
                  {new Date(e.created_at).toLocaleString("en-IN")} — {STATUS_LABELS[e.to_status] ?? e.to_status}
                  {e.note ? `: ${e.note}` : ""}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}
