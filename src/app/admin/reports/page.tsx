import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { createUserClient } from "@/lib/supabase/server";
import { addCorrectionAction, triageReportAction } from "@/app/admin/actions";

export const metadata = { title: "Error reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const client = await createUserClient();
  const { data: reports } = (await client?.from("content_error_reports").select("*, book:books(id, title)").order("created_at", { ascending: false }).limit(100)) ?? { data: [] };
  return (
    <>
      <PageIntro eyebrow="Admin" title="Error reports" />
      <Flash searchParams={params} />
      {!reports?.length && <p className="empty-state">No reports.</p>}
      {reports?.map((r) => {
        const book = (Array.isArray(r.book) ? r.book[0] : r.book) as { id: string; title: string } | null;
        return (
          <section className="panel" key={r.id} aria-labelledby={`r-${r.id}`}>
            <h2 id={`r-${r.id}`}>{r.category.replaceAll("_", " ")} — {r.status}</h2>
            <p className="small">{new Date(r.created_at).toLocaleString("en-IN")}{book ? ` · ${book.title}` : ""}{r.page_path ? ` · ${r.page_path}` : ""}{r.contact_email ? ` · ${r.contact_email}` : ""}</p>
            <p>{r.description}</p>
            <form action={triageReportAction.bind(null, r.id)} className="form-stack">
              <div className="field-row">
                <div className="field"><label htmlFor={`st-${r.id}`}>Status</label>
                  <select id={`st-${r.id}`} name="status" defaultValue={r.status}><option value="open">Open</option><option value="triaged">Triaged</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></div>
                <div className="field"><label htmlFor={`rn-${r.id}`}>Resolution note</label><input id={`rn-${r.id}`} name="resolutionNote" defaultValue={r.resolution_note ?? ""} maxLength={2000} /></div>
              </div>
              <button className="button" type="submit">Save</button>
            </form>
            {book && (
              <form action={addCorrectionAction.bind(null, r.id, book.id)} className="form-stack">
                <div className="field"><label htmlFor={`co-${r.id}`}>Public correction note</label><input id={`co-${r.id}`} name="summary" minLength={5} maxLength={1000} required /></div>
                <div className="field-check"><input id={`cp-${r.id}`} name="isPublished" type="checkbox" /><label htmlFor={`cp-${r.id}`}>Publish on the book’s page</label></div>
                <button className="link-button" type="submit">Log correction</button>
              </form>
            )}
          </section>
        );
      })}
    </>
  );
}
