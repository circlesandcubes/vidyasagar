import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { getPublishedBookBySlug } from "@/lib/catalogue/data";
import { INDIAN_STATES } from "@/lib/validation/account";
import { ORGANISATION_LABELS, ORGANISATION_TYPES } from "@/lib/validation/enquiry";
import { submitEnquiryAction } from "@/app/institutions/enquiry/actions";

export const metadata = { title: "Bulk and institutional enquiry" };
export const dynamic = "force-dynamic";

export default async function EnquiryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const slug = typeof params.book === "string" ? params.book : null;
  const book = slug ? await getPublishedBookBySlug(slug) : null;
  const reference = typeof params.ref === "string" && /^BE-\d+$/.test(params.ref) ? params.ref : null;
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Institutions" title="Bulk and institutional enquiry" lede="Tell us what you need. We reply by email with a written quotation; nothing is charged by sending this form." />
        <Flash searchParams={params} />
        {reference && <p>Your reference is <strong>{reference}</strong>. Please quote it in any follow-up.</p>}
        <form action={submitEnquiryAction} className="form-stack">
          {book && (<>
            <input type="hidden" name="bookId" value={book.id} />
            <p>About: <strong>{book.title}</strong></p>
            <div className="field"><label htmlFor="bookQuantity">Copies of this book</label><input id="bookQuantity" name="bookQuantity" inputMode="numeric" /></div>
          </>)}
          <div className="field"><label htmlFor="organisation">Organisation</label><input id="organisation" name="organisation" required maxLength={160} autoComplete="organization" /></div>
          <div className="field"><label htmlFor="organisationType">Type</label>
            <select id="organisationType" name="organisationType" required>{ORGANISATION_TYPES.map((t) => <option key={t} value={t}>{ORGANISATION_LABELS[t]}</option>)}</select></div>
          <div className="field"><label htmlFor="contactName">Your name</label><input id="contactName" name="contactName" required maxLength={120} autoComplete="name" /></div>
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
          <div className="field"><label htmlFor="phone">Mobile number (optional)</label><input id="phone" name="phone" inputMode="tel" autoComplete="tel" /></div>
          <div className="field-row">
            <div className="field"><label htmlFor="city">City (optional)</label><input id="city" name="city" maxLength={100} autoComplete="address-level2" /></div>
            <div className="field"><label htmlFor="state">State (optional)</label><select id="state" name="state" defaultValue=""><option value="">Choose…</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div className="field-row">
            <div className="field"><label htmlFor="quantity">Approximate total copies (optional)</label><input id="quantity" name="quantity" inputMode="numeric" /></div>
            <div className="field"><label htmlFor="neededBy">Needed by (optional)</label><input id="neededBy" name="neededBy" type="date" /></div>
          </div>
          <div className="field"><label htmlFor="message">What do you need?</label><textarea id="message" name="message" required rows={6} minLength={10} maxLength={4000} /></div>
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px" }}><label htmlFor="website">Leave this empty</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
          <button className="button" type="submit">Send enquiry</button>
          <p className="small muted">We use these details only to reply to your enquiry. See our <a href="/privacy">privacy policy</a>.</p>
        </form>
      </div>
    </main>
  );
}
