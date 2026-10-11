import { requireRole } from "@/lib/auth/session";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { createUserClient } from "@/lib/supabase/server";
import { reviewApplicationAction } from "@/app/admin/actions";

export const metadata = { title: "Seller applications" };

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(["admin", "curator"], "/admin/applications");
  const params = await searchParams;
  const client = await createUserClient();
  const { data: apps } = (await client?.from("seller_applications").select("*").order("created_at", { ascending: false }).limit(100)) ?? { data: [] };
  const contacts = new Map<string, string | null>();
  for (const app of (apps ?? []).filter((a) => a.status === "pending")) {
    const { data } = (await client?.rpc("application_contact", { p_application_id: app.id })) ?? { data: null };
    contacts.set(app.id, data as string | null);
  }
  return (
    <>
      <PageIntro eyebrow="Admin" title="Seller applications" />
      <Flash searchParams={params} />
      {!apps?.length && <p className="empty-state">No applications yet.</p>}
      {apps?.map((app) => (
        <section key={app.id} className="panel" aria-labelledby={`app-${app.id}`}>
          <h2 id={`app-${app.id}`}>{app.display_name} <span className="muted">({app.kind})</span></h2>
          <p className="small">Status: {app.status}{contacts.get(app.id) ? ` · ${contacts.get(app.id)}` : ""}</p>
          {app.bio && <p>{app.bio}</p>}
          {app.website_url && <p className="small">Website: <a href={app.website_url} rel="noopener noreferrer nofollow">{app.website_url}</a></p>}
          {app.status === "pending" ? (
            <div className="form-stack">
              <form action={reviewApplicationAction.bind(null, app.id, true)} className="form-stack">
                <div className="field"><label htmlFor={`ok-${app.id}`}>Note (optional)</label><input id={`ok-${app.id}`} name="note" maxLength={1000} /></div>
                <button className="button" type="submit">Approve</button>
              </form>
              <form action={reviewApplicationAction.bind(null, app.id, false)} className="form-stack">
                <div className="field"><label htmlFor={`no-${app.id}`}>Reason for rejecting (required)</label><input id={`no-${app.id}`} name="note" required maxLength={1000} /></div>
                <button className="link-button" type="submit">Reject</button>
              </form>
            </div>
          ) : app.review_note ? <p className="small">Note: {app.review_note}</p> : null}
        </section>
      ))}
    </>
  );
}
