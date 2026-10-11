import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireRole } from "@/lib/auth/session";
import { formatMinor } from "@/lib/money";
import { createUserClient } from "@/lib/supabase/server";
import { ORGANISATION_LABELS } from "@/lib/validation/enquiry";
import { addNoteAction, addQuotationLineAction, createQuotationAction, issueQuotationAction, removeQuotationLineAction, respondQuotationAction, saveQuotationTermsAction, setEnquiryStatusAction } from "@/app/admin/enquiries/actions";

export const metadata = { title: "Enquiry" };
export const dynamic = "force-dynamic";

const STATUSES = ["new", "in_progress", "quoted", "accepted", "declined", "closed"];
type Quote = { id: string; reference: string; status: string; valid_until: string | null; shipping_minor: number; discount_minor: number; subtotal_minor: number; total_minor: number; terms: string | null; lines: { id: string; description: string; quantity: number; unit_price_minor: number; line_total_minor: number }[] };

export default async function EnquiryPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { reference } = await params;
  const query = await searchParams;
  if (!/^BE-\d+$/.test(reference)) notFound();
  await requireRole(["admin"], `/admin/enquiries/${reference}`);
  const client = await createUserClient();
  const { data: e } = (await client?.from("bulk_enquiries").select("*, items:bulk_enquiry_items(quantity, title_text, book:books(title, slug)), notes:bulk_enquiry_notes(id, body, created_at), quotations(id, reference, status, valid_until, shipping_minor, discount_minor, subtotal_minor, total_minor, terms, lines:quotation_lines(id, description, quantity, unit_price_minor, line_total_minor))").eq("reference", reference).maybeSingle()) ?? { data: null };
  if (!e) notFound();
  const quotes = e.quotations as Quote[];
  const items = e.items as { quantity: number; title_text: string | null; book: { title: string } | { title: string }[] | null }[];
  const notes = (e.notes as { id: string; body: string; created_at: string }[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <>
      <PageIntro eyebrow="Admin" title={`Enquiry ${e.reference}`} lede={`${e.organisation_name} · ${ORGANISATION_LABELS[e.organisation_type as keyof typeof ORGANISATION_LABELS]}`} />
      <Flash searchParams={query} />
      <section className="panel">
        <h2>Contact</h2>
        <p>{e.contact_name}<br /><a href={`mailto:${e.email}`}>{e.email}</a>{e.phone ? <><br />{e.phone}</> : null}{e.city || e.state ? <><br />{[e.city, e.state].filter(Boolean).join(", ")}</> : null}</p>
        <p>{e.expected_quantity ? `About ${e.expected_quantity} copies. ` : ""}{e.needed_by ? `Needed by ${e.needed_by}.` : ""}</p>
        <p style={{ whiteSpace: "pre-wrap" }}>{e.message}</p>
        {items.length > 0 && <ul>{items.map((i, idx) => { const b = Array.isArray(i.book) ? i.book[0] : i.book; return <li key={idx}>{b?.title ?? i.title_text} × {i.quantity}</li>; })}</ul>}
        <form action={setEnquiryStatusAction.bind(null, e.id, e.reference)} className="inline-form">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={e.status}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
          <label><input type="checkbox" name="assign" value="me" /> Assign to me</label>
          <button className="button" type="submit">Update</button>
        </form>
      </section>

      <section className="panel">
        <h2>Internal notes</h2>
        <ul>{notes.map((n) => <li key={n.id}>{new Date(n.created_at).toLocaleString("en-IN")}: {n.body}</li>)}</ul>
        <form action={addNoteAction.bind(null, e.id, e.reference)} className="form-stack">
          <div className="field"><label htmlFor="body">Add a note (never shown to the customer)</label><textarea id="body" name="body" rows={3} required maxLength={4000} /></div>
          <button className="button" type="submit">Add note</button>
        </form>
      </section>

      <section className="panel">
        <h2>Quotations</h2>
        {quotes.map((q) => (
          <div key={q.id} className="panel">
            <h3>{q.reference} · {q.status}</h3>
            <ul>{q.lines.map((l) => (
              <li key={l.id}>{l.description} × {l.quantity} @ {formatMinor(l.unit_price_minor)} = {formatMinor(l.line_total_minor)}
                {q.status === "draft" && <form className="inline-form" action={removeQuotationLineAction.bind(null, l.id, e.reference)}><button className="link-button" type="submit">Remove</button></form>}</li>
            ))}</ul>
            <p>Subtotal {formatMinor(q.subtotal_minor)} − discount {formatMinor(q.discount_minor)} + delivery {formatMinor(q.shipping_minor)} = <strong>{formatMinor(q.total_minor)}</strong>{q.valid_until ? `. Valid until ${q.valid_until}.` : ""}</p>
            {q.status === "draft" ? (
              <>
                <form action={addQuotationLineAction.bind(null, q.id, e.reference)} className="form-stack">
                  <div className="field"><label htmlFor={`d-${q.id}`}>Line description</label><input id={`d-${q.id}`} name="description" required maxLength={300} /></div>
                  <div className="field-row">
                    <div className="field"><label htmlFor={`n-${q.id}`}>Quantity</label><input id={`n-${q.id}`} name="quantity" required inputMode="numeric" /></div>
                    <div className="field"><label htmlFor={`u-${q.id}`}>Unit price (₹)</label><input id={`u-${q.id}`} name="unit" required inputMode="decimal" /></div>
                  </div>
                  <button className="button" type="submit">Add line</button>
                </form>
                <form action={saveQuotationTermsAction.bind(null, q.id, e.reference)} className="form-stack">
                  <div className="field-row">
                    <div className="field"><label htmlFor={`s-${q.id}`}>Delivery (₹)</label><input id={`s-${q.id}`} name="shipping" inputMode="decimal" defaultValue={q.shipping_minor / 100} /></div>
                    <div className="field"><label htmlFor={`x-${q.id}`}>Discount (₹)</label><input id={`x-${q.id}`} name="discount" inputMode="decimal" defaultValue={q.discount_minor / 100} /></div>
                    <div className="field"><label htmlFor={`v-${q.id}`}>Valid until</label><input id={`v-${q.id}`} name="validUntil" type="date" defaultValue={q.valid_until ?? ""} /></div>
                  </div>
                  <div className="field"><label htmlFor={`t-${q.id}`}>Terms (payment, delivery, taxes: written by you)</label><textarea id={`t-${q.id}`} name="terms" rows={4} defaultValue={q.terms ?? ""} /></div>
                  <button className="button" type="submit">Save terms</button>
                </form>
                <form action={issueQuotationAction.bind(null, q.id, e.reference)}><button className="button" type="submit">Issue and email to the customer</button></form>
              </>
            ) : (
              <>
                {q.terms && <p style={{ whiteSpace: "pre-wrap" }}>{q.terms}</p>}
                {q.status === "issued" && (
                  <div className="action-row">
                    <form action={respondQuotationAction.bind(null, q.id, e.reference, "accepted")}><button className="button" type="submit">Mark accepted</button></form>
                    <form action={respondQuotationAction.bind(null, q.id, e.reference, "declined")}><button className="link-button" type="submit">Mark declined</button></form>
                    <form action={respondQuotationAction.bind(null, q.id, e.reference, "expired")}><button className="link-button" type="submit">Mark expired</button></form>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        <form action={createQuotationAction.bind(null, e.id, e.reference)}><button className="button" type="submit">New draft quotation</button></form>
      </section>
    </>
  );
}
