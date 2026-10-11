import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { getCurrentRoles, requireRole } from "@/lib/auth/session";
import { NOTE_REQUIRED, nextStatusesForStaff, type BookStatus } from "@/lib/catalogue/lifecycle";
import { STATUS_LABELS } from "@/lib/seller/book-defaults";
import { createUserClient } from "@/lib/supabase/server";
import {
  addCreditAction, addInternalNoteAction, assignReviewerAction, publishVerificationAction, removeCreditAction,
  removeSkillLinkAction, saveChannelAction, saveEditionAdminAction, saveSkillLinkAction, setAuthorPublishedAction,
  transitionBookAction, unpublishVerificationAction,
} from "@/app/admin/actions";

export const metadata = { title: "Review book" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Json = Record<string, string>;

export default async function AdminBookPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(["admin", "curator"], "/admin/books");
  const { id } = await params;
  const query = await searchParams;
  if (!UUID.test(id)) notFound();
  const client = await createUserClient();
  if (!client) notFound();
  const roles = await getCurrentRoles();
  const isAdmin = roles.includes("admin");

  const { data: book } = await client.from("books").select("*").eq("id", id).maybeSingle();
  if (!book) notFound();

  const [credits, editions, skillLinks, skills, authors, assignments, reviewers, notes, events, reviews] = await Promise.all([
    client.from("book_contributors").select("role, author:authors(id, name, is_published)").eq("book_id", id),
    client.from("book_editions").select("id, format, isbn13, availability, is_primary, channels:edition_purchase_channels(id, channel, destination_url, is_enabled)").eq("book_id", id),
    client.from("book_skills").select("skill_id, relation, explanation, is_approved, skill:skills(name)").eq("book_id", id),
    client.from("skills").select("id, name, parent_id").order("name"),
    client.from("authors").select("id, name").order("name").limit(500),
    client.from("review_assignments").select("id, reviewer_id, status").eq("book_id", id),
    client.rpc("list_users_with_role", { p_role: "reviewer" }),
    client.from("book_internal_notes").select("id, body, created_at").eq("book_id", id).order("created_at", { ascending: false }),
    client.from("editorial_events").select("id, to_status, note, created_at").eq("book_id", id).order("created_at", { ascending: false }),
    client.from("verification_reviews").select("*").eq("book_id", id).order("created_at"),
  ]);

  const status = book.status as BookStatus;
  const nexts = nextStatusesForStaff(status);
  const reviewerList = (reviewers.data ?? []) as { user_id: string; display_name: string | null; email: string }[];
  const reviewerName = (uid: string) => { const r = reviewerList.find((x) => x.user_id === uid); return r ? (r.display_name ?? r.email) : uid; };
  const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

  return (
    <>
      <PageIntro eyebrow="Admin" title={book.title} lede={`Status: ${STATUS_LABELS[status] ?? status}`} />
      <Flash searchParams={query} />
      <p className="small"><Link href="/admin/books">← All books</Link>{status === "published" && <> · <Link href={`/books/${book.slug}`}>View public page</Link></>}</p>

      <section className="panel" aria-labelledby="sub-h">
        <h2 id="sub-h">Submission</h2>
        <p>{book.description ?? <span className="muted">No description.</span>}</p>
        <p className="small">Rights confirmed: <strong>{book.rights_confirmed ? "yes" : "no"}</strong>{book.rights_statement ? ` — ${book.rights_statement}` : ""}</p>
        <h3>Proposed by the submitter (not yet applied)</h3>
        <ul className="plain-list small">
          {list<Json>(book.submitted_credits).map((c, i) => <li key={`c${i}`}>Credit: {c.name} ({c.role})</li>)}
          {list<Json>(book.proposed_skills).map((s, i) => <li key={`s${i}`}>Skill: {s.skill} — {s.explanation}</li>)}
          {list<Json>(book.proposed_links).map((l, i) => <li key={`l${i}`}>Link ({l.channel}): {l.url}</li>)}
          {list<Json>(book.proposed_personalisation).map((p, i) => <li key={`p${i}`}>Personalisation: {p.idea}</li>)}
        </ul>
      </section>

      <section className="form-section" aria-labelledby="dec-h">
        <h2 id="dec-h" className="form-heading">Decision</h2>
        {nexts.length === 0 ? <p className="muted">No further moves from this status.</p> : (
          <form action={transitionBookAction.bind(null, id)} className="form-stack">
            <div className="field">
              <label htmlFor="to">Move to</label>
              <select id="to" name="to">{nexts.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select>
            </div>
            <div className="field">
              <label htmlFor="note">Note to the submitter (required for changes requested and rejection: {NOTE_REQUIRED.join(", ")})</label>
              <textarea id="note" name="note" rows={3} maxLength={2000} />
            </div>
            <button className="button" type="submit">Apply</button>
          </form>
        )}
        <p className="small muted">Approval needs an author credit, an edition, and (for seller submissions) confirmed rights. The database enforces this.</p>
      </section>

      <section className="form-section" aria-labelledby="cred-h">
        <h2 id="cred-h" className="form-heading">Credits</h2>
        <ul className="plain-list">
          {(credits.data ?? []).map((c) => {
            const a = (Array.isArray(c.author) ? c.author[0] : c.author) as { id: string; name: string; is_published: boolean } | null;
            if (!a) return null;
            return (
              <li key={`${a.id}${c.role}`}>
                {a.name} ({c.role}) — profile {a.is_published ? "public" : "not public"}
                <form className="inline-form" action={setAuthorPublishedAction.bind(null, id, a.id, !a.is_published)}><button className="link-button" type="submit">{a.is_published ? "Hide profile" : "Publish profile"}</button></form>
                <form className="inline-form" action={removeCreditAction.bind(null, id, a.id, c.role)}><button className="link-button" type="submit">Remove</button></form>
              </li>
            );
          })}
        </ul>
        <form action={addCreditAction.bind(null, id)} className="form-stack">
          <div className="field-row">
            <div className="field"><label htmlFor="authorId">Existing person</label>
              <select id="authorId" name="authorId" defaultValue=""><option value="">—</option>{(authors.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div className="field"><label htmlFor="newAuthorName">…or new person</label><input id="newAuthorName" name="newAuthorName" maxLength={160} /></div>
            <div className="field"><label htmlFor="role">Role</label>
              <select id="role" name="role"><option>author</option><option>illustrator</option><option>editor</option><option>translator</option></select></div>
          </div>
          <button className="button" type="submit">Add credit</button>
        </form>
      </section>

      <section className="form-section" aria-labelledby="ed-h">
        <h2 id="ed-h" className="form-heading">Editions and purchase links</h2>
        {(editions.data ?? []).map((e) => (
          <div key={e.id} className="panel">
            <h3>{e.format.replace("_", " ")}{e.isbn13 ? ` · ${e.isbn13}` : ""}</h3>
            <form action={saveEditionAdminAction.bind(null, id, e.id)} className="field-row">
              <div className="field"><label htmlFor={`av-${e.id}`}>Availability</label>
                <select id={`av-${e.id}`} name="availability" defaultValue={e.availability}><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="preorder">Pre-order</option><option value="out_of_print">Out of print</option></select></div>
              <div className="field-check"><input id={`pr-${e.id}`} name="isPrimary" type="checkbox" defaultChecked={e.is_primary} /><label htmlFor={`pr-${e.id}`}>Primary edition</label></div>
              <button className="button" type="submit">Save edition</button>
            </form>
            <ul className="plain-list small">
              {(e.channels as { id: string; channel: string; destination_url: string | null; is_enabled: boolean }[]).map((c) => (
                <li key={c.id}>{c.channel}: {c.destination_url} — {c.is_enabled ? "shown publicly" : "disabled"}</li>
              ))}
            </ul>
            <form action={saveChannelAction.bind(null, id, e.id)} className="form-stack">
              <div className="field-row">
                <div className="field"><label htmlFor={`ch-${e.id}`}>Channel</label><select id={`ch-${e.id}`} name="channel"><option value="amazon">Amazon</option><option value="flipkart">Flipkart</option></select></div>
                <div className="field"><label htmlFor={`url-${e.id}`}>Approved affiliate link (https)</label><input id={`url-${e.id}`} name="url" type="url" required /></div>
                <div className="field-check"><input id={`en-${e.id}`} name="isEnabled" type="checkbox" /><label htmlFor={`en-${e.id}`}>Show publicly</label></div>
              </div>
              <button className="button" type="submit">Save link</button>
            </form>
          </div>
        ))}
        {!editions.data?.length && <p className="muted">No editions.</p>}
      </section>

      <section className="form-section" aria-labelledby="sk-h">
        <h2 id="sk-h" className="form-heading">Skills</h2>
        <ul className="plain-list">
          {(skillLinks.data ?? []).map((s) => {
            const sk = (Array.isArray(s.skill) ? s.skill[0] : s.skill) as { name: string } | null;
            return (
              <li key={s.skill_id}>
                <strong>{sk?.name}</strong> ({s.relation}) — {s.explanation} — {s.is_approved ? "approved" : "not approved"}
                <form className="inline-form" action={removeSkillLinkAction.bind(null, id, s.skill_id)}><button className="link-button" type="submit">Remove</button></form>
              </li>
            );
          })}
        </ul>
        <form action={saveSkillLinkAction.bind(null, id)} className="form-stack">
          <div className="field-row">
            <div className="field"><label htmlFor="skillId">Skill</label>
              <select id="skillId" name="skillId">{(skills.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="field"><label htmlFor="relation">Relationship</label>
              <select id="relation" name="relation"><option value="practised">Practised</option><option value="supported">Supported</option><option value="incidental">Incidental</option></select></div>
          </div>
          <div className="field"><label htmlFor="explanation">Explanation shown publicly</label><textarea id="explanation" name="explanation" rows={2} required maxLength={500} /></div>
          <div className="field-check"><input id="isApproved" name="isApproved" type="checkbox" /><label htmlFor="isApproved">Approved for public display</label></div>
          <button className="button" type="submit">Save skill link</button>
        </form>
      </section>

      <section className="form-section" aria-labelledby="rv-h">
        <h2 id="rv-h" className="form-heading">Reviewers and verification records</h2>
        <ul className="plain-list small">
          {(assignments.data ?? []).map((a) => <li key={a.id}>{reviewerName(a.reviewer_id)} — {a.status}</li>)}
        </ul>
        <form action={assignReviewerAction.bind(null, id)} className="form-stack">
          <div className="field"><label htmlFor="reviewerId">Assign a reviewer</label>
            <select id="reviewerId" name="reviewerId">{reviewerList.map((r) => <option key={r.user_id} value={r.user_id}>{r.display_name ?? r.email}</option>)}</select></div>
          <button className="button" type="submit" disabled={!reviewerList.length}>Assign</button>
          {!reviewerList.length && <p className="small muted">No users hold the reviewer role yet.</p>}
        </form>
        {(reviews.data ?? []).map((r) => (
          <div className="panel" key={r.id}>
            <h3>{r.review_type.replaceAll("_", " ")} — {r.status}</h3>
            <p className="small">{r.reviewer_name ?? "(no named reviewer)"} · scope: {r.scope}</p>
            <p className="small">Permission: {r.publication_permission ? "yes" : "no"} · Admin approved: {r.admin_approved ? "yes" : "no"} · Credentials verified: {r.credentials_verified ? "yes" : "no"}</p>
            {isAdmin ? (r.status === "published" ? (
              <form action={unpublishVerificationAction.bind(null, id, r.id)}><button className="link-button" type="submit">Withdraw this record</button></form>
            ) : (
              <form action={publishVerificationAction.bind(null, id, r.id)} className="form-stack">
                <div className="field-check"><input id={`pp-${r.id}`} name="publicationPermission" type="checkbox" /><label htmlFor={`pp-${r.id}`}>The reviewing party has given permission to publish this record</label></div>
                <div className="field-check"><input id={`cv-${r.id}`} name="credentialsVerified" type="checkbox" /><label htmlFor={`cv-${r.id}`}>I have verified the stated credentials</label></div>
                <div className="field"><label htmlFor={`ro-${r.id}`}>Date of review</label><input id={`ro-${r.id}`} name="reviewedOn" type="date" required defaultValue={r.reviewed_on ?? ""} /></div>
                <button className="button" type="submit">Approve and publish record</button>
              </form>
            )) : <p className="small muted">Only an administrator can publish verification records.</p>}
          </div>
        ))}
      </section>

      <section className="form-section" aria-labelledby="nt-h">
        <h2 id="nt-h" className="form-heading">Internal notes (never shown to submitters)</h2>
        <ul className="plain-list small">{(notes.data ?? []).map((n) => <li key={n.id}>{new Date(n.created_at).toLocaleString("en-IN")} — {n.body}</li>)}</ul>
        <form action={addInternalNoteAction.bind(null, id)} className="form-stack">
          <div className="field"><label htmlFor="body">Add a note</label><textarea id="body" name="body" rows={2} required maxLength={4000} /></div>
          <button className="button" type="submit">Add note</button>
        </form>
      </section>

      <section className="form-section" aria-labelledby="hist-h">
        <h2 id="hist-h" className="form-heading">History</h2>
        <ol className="plain-list small">{(events.data ?? []).map((e) => <li key={e.id}>{new Date(e.created_at).toLocaleString("en-IN")} — {STATUS_LABELS[e.to_status] ?? e.to_status}{e.note ? `: ${e.note}` : ""}</li>)}</ol>
      </section>
    </>
  );
}
