import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { createPageMetadata } from "@/lib/book-metadata";
import { REPORT_CATEGORIES, safeReportPath } from "@/lib/validation/report";
import { submitReportAction } from "@/app/report-error/actions";

export const metadata = { ...createPageMetadata({ title: "Report an error", description: "Tell us about a mistake in a Vidyasagar listing.", path: "/report-error" }), robots: { index: false, follow: true } };

export default async function ReportErrorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const book = typeof params.book === "string" && /^[a-z0-9-]{1,120}$/.test(params.book) ? params.book : "";
  const path = typeof params.path === "string" ? (safeReportPath(params.path) ?? "") : "";
  return (
    <main id="main-content">
      <div className="content-wrap narrow">
        <PageIntro eyebrow="Corrections" title="Report an error" lede="We would rather be corrected than be wrong. Real corrections are logged publicly on the book’s page." />
        <Flash searchParams={params} />
        <form action={submitReportAction} className="form-stack">
          <input type="hidden" name="bookSlug" value={book} />
          <input type="hidden" name="pagePath" value={path} />
          <div className="field">
            <label htmlFor="category">What is the problem?</label>
            <select id="category" name="category">{REPORT_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          <div className="field"><label htmlFor="description">Details</label><textarea id="description" name="description" rows={6} required minLength={10} maxLength={4000} /></div>
          <div className="field"><label htmlFor="contactEmail">Your email (optional, only if you want a reply)</label><input id="contactEmail" name="contactEmail" type="email" autoComplete="email" maxLength={254} /></div>
          <div className="visually-hidden" aria-hidden="true"><label htmlFor="website">Leave this empty</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
          <button className="button" type="submit">Send report</button>
        </form>
      </div>
    </main>
  );
}
