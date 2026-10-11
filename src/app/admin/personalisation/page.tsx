import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { formatMinor } from "@/lib/money";
import { createUserClient } from "@/lib/supabase/server";
import { addFieldAction, attachTemplateAction, createTemplateAction, removeFieldAction, setTemplateActiveAction } from "@/app/admin/personalisation/actions";

export const metadata = { title: "Personalisation" };

export default async function PersonalisationAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const client = await createUserClient();
  const { data: templates } = (await client?.from("personalisation_templates").select("*, fields:personalisation_fields(key, label, field_type, is_required, max_length, display_order), books:book_personalisation(is_enabled, book:books(title))").order("name")) ?? { data: [] };
  return (
    <>
      <PageIntro eyebrow="Admin" title="Personalisation templates" />
      <Flash searchParams={params} />
      <p className="small muted">A template defines what a customer fills in. Orders keep a copy of the template as it was at purchase, so editing here never changes an existing order. A template must have at least one field before it can go live.</p>
      {templates?.map((t) => (
        <section className="panel" key={t.id} aria-labelledby={`t-${t.id}`}>
          <h2 id={`t-${t.id}`}>{t.name} <span className="muted">({t.slug})</span></h2>
          <p className="small">{t.is_active ? "Live" : "Not live"} · extra charge {formatMinor(t.price_adjustment_minor)}{t.lead_time_days ? ` · +${t.lead_time_days} day(s)` : ""}</p>
          <ul className="plain-list small">
            {[...(t.fields as { key: string; label: string; field_type: string; is_required: boolean; max_length: number; display_order: number }[])].sort((a, b) => a.display_order - b.display_order).map((f) => (
              <li key={f.key}>{f.label} ({f.key}, {f.field_type}, {f.is_required ? "required" : "optional"}, max {f.max_length})
                <form className="inline-form" action={removeFieldAction.bind(null, t.id, f.key)}><button className="link-button" type="submit">Remove</button></form></li>
            ))}
          </ul>
          <form action={addFieldAction.bind(null, t.id)} className="form-stack">
            <div className="field-row">
              <div className="field"><label htmlFor={`k-${t.id}`}>Key</label><input id={`k-${t.id}`} name="key" required /></div>
              <div className="field"><label htmlFor={`l-${t.id}`}>Label</label><input id={`l-${t.id}`} name="label" required /></div>
              <div className="field"><label htmlFor={`ty-${t.id}`}>Type</label><select id={`ty-${t.id}`} name="fieldType"><option value="text">Short text</option><option value="textarea">Message</option><option value="choice">Choice</option></select></div>
              <div className="field"><label htmlFor={`mx-${t.id}`}>Max length</label><input id={`mx-${t.id}`} name="maxLength" type="number" min={1} max={500} defaultValue={30} /></div>
            </div>
            <div className="field"><label htmlFor={`ch-${t.id}`}>Choices (comma-separated, for Choice type)</label><input id={`ch-${t.id}`} name="choices" /></div>
            <div className="field-check"><input id={`rq-${t.id}`} name="isRequired" type="checkbox" defaultChecked /><label htmlFor={`rq-${t.id}`}>Required</label></div>
            <button className="button" type="submit">Add field</button>
          </form>
          <form action={setTemplateActiveAction.bind(null, t.id, !t.is_active)}><button className="link-button" type="submit">{t.is_active ? "Take offline" : "Make live"}</button></form>
          <h3>Used on</h3>
          <ul className="plain-list small">
            {(t.books as { is_enabled: boolean; book: { title: string } | { title: string }[] | null }[]).map((b, i) => {
              const book = Array.isArray(b.book) ? b.book[0] : b.book;
              return <li key={i}>{book?.title} — {b.is_enabled ? "enabled" : "disabled"}</li>;
            })}
          </ul>
          <form action={attachTemplateAction} className="form-stack">
            <input type="hidden" name="templateId" value={t.id} />
            <div className="field"><label htmlFor={`bs-${t.id}`}>Book slug</label><input id={`bs-${t.id}`} name="bookSlug" required /></div>
            <div className="field-check"><input id={`en-${t.id}`} name="enabled" type="checkbox" defaultChecked /><label htmlFor={`en-${t.id}`}>Enabled</label></div>
            <button className="button" type="submit">Attach to book</button>
          </form>
        </section>
      ))}
      <form action={createTemplateAction} className="form-stack">
        <h2 className="form-heading">New template</h2>
        <div className="field"><label htmlFor="name">Name</label><input id="name" name="name" required maxLength={120} /></div>
        <div className="field"><label htmlFor="slug">Slug</label><input id="slug" name="slug" required /></div>
        <div className="field"><label htmlFor="description">Description</label><input id="description" name="description" maxLength={1000} /></div>
        <div className="field"><label htmlFor="previewNote">Preview note</label><input id="previewNote" name="previewNote" maxLength={500} /></div>
        <div className="field-row">
          <div className="field"><label htmlFor="price">Extra charge (₹)</label><input id="price" name="price" inputMode="decimal" /></div>
          <div className="field"><label htmlFor="leadTimeDays">Extra lead time (days)</label><input id="leadTimeDays" name="leadTimeDays" type="number" min={0} max={365} /></div>
        </div>
        <button className="button" type="submit">Create template</button>
      </form>
    </>
  );
}
