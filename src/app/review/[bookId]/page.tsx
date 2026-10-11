import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { addEvidenceNoteAction, saveVerificationDraftAction } from "@/app/review/actions";

// Session-dependent: must never be prerendered or cached.
export const dynamic = "force-dynamic";

export const metadata = { title: "Review a book", robots: { index: false, follow: false } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReviewBookPage({
  params, searchParams,
}: { params: Promise<{ bookId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { bookId } = await params;
  const query = await searchParams;
  if (!UUID.test(bookId)) notFound();
  await requireRole(["reviewer", "admin", "curator"], `/review/${bookId}`);
  const client = await createUserClient();
  if (!client) notFound();
  const { data: book } = await client.from("books").select("id, title, subtitle, description, age_min_months, age_max_months").eq("id", bookId).maybeSingle();
  if (!book) notFound();
  const { data: reviews } = await client.from("verification_reviews").select("id, review_type, status, scope").eq("book_id", bookId).order("created_at");

  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Reviewer" title={book.title} lede={book.subtitle ?? undefined} />
        <Flash searchParams={query} />
        <p>{book.description}</p>
        <p className="verification-notice">
          Record only what you actually reviewed. Your record is not public until an administrator confirms your permission
          to publish it and verifies any credentials. Credentials you enter here are never shown unless verified.
        </p>

        <h2 className="form-heading">Your records for this book</h2>
        {!reviews?.length && <p className="muted">None yet.</p>}
        {reviews?.map((r) => (
          <div key={r.id} className="panel">
            <h3>{r.review_type.replaceAll("_", " ")} — {r.status}</h3>
            <p className="small">{r.scope}</p>
            <form action={addEvidenceNoteAction.bind(null, bookId, r.id)} className="form-stack">
              <div className="field"><label htmlFor={`ev-${r.id}`}>Private evidence note (never public)</label><textarea id={`ev-${r.id}`} name="note" rows={2} maxLength={2000} /></div>
              <button className="button" type="submit">Add evidence note</button>
            </form>
          </div>
        ))}

        <h2 className="form-heading">New record</h2>
        <form action={saveVerificationDraftAction.bind(null, bookId)} className="form-stack">
          <div className="field"><label htmlFor="reviewType">Type of review</label>
            <select id="reviewType" name="reviewType" defaultValue="fact_checked">
              <option value="fact_checked">Fact-checked (sources required)</option>
              <option value="expert_reviewed">Expert reviewed</option>
              <option value="educator_reviewed">Educator reviewed</option>
              <option value="author_approved">Author approved</option>
              <option value="publisher_approved">Publisher approved</option>
              <option value="story_and_imagination">Story and imagination (classification)</option>
            </select></div>
          <div className="field"><label htmlFor="reviewerName">Reviewer name</label><input id="reviewerName" name="reviewerName" maxLength={160} /></div>
          <div className="field"><label htmlFor="reviewerOrganisation">Organisation (optional)</label><input id="reviewerOrganisation" name="reviewerOrganisation" maxLength={160} /></div>
          <div className="field"><label htmlFor="scope">What was reviewed (scope)</label><textarea id="scope" name="scope" rows={2} required maxLength={1000} /></div>
          <div className="field"><label htmlFor="claimsCovered">Claims covered (optional)</label><textarea id="claimsCovered" name="claimsCovered" rows={2} maxLength={2000} /></div>
          <div className="field"><label htmlFor="limitations">Limitations — what was not reviewed</label><textarea id="limitations" name="limitations" rows={2} maxLength={2000} /></div>
          <div className="field"><label htmlFor="sources">Sources — one per line: Title | https://…</label><textarea id="sources" name="sources" rows={3} /></div>
          <div className="field"><label htmlFor="reviewedOn">Date reviewed</label><input id="reviewedOn" name="reviewedOn" type="date" /></div>
          <div className="field"><label htmlFor="versionReviewed">Edition or version reviewed (optional)</label><input id="versionReviewed" name="versionReviewed" maxLength={120} /></div>
          <div className="field-check"><input id="submit" name="submit" type="checkbox" /><label htmlFor="submit">Send to an administrator for approval</label></div>
          <button className="button" type="submit">Save record</button>
        </form>
      </div>
    </main>
  );
}
