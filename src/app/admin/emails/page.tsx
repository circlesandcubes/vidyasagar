import { PageIntro } from "@/components/page-intro";
import { requireRole } from "@/lib/auth/session";
import { emailConfig } from "@/lib/email/provider";
import { createUserClient } from "@/lib/supabase/server";

export const metadata = { title: "Email log" };
export const dynamic = "force-dynamic";

export default async function EmailsPage() {
  await requireRole(["admin", "curator"], "/admin/emails");
  const client = await createUserClient();
  const { data } = (await client?.from("email_outbox").select("id, to_email, template, status, attempts, last_error, created_at, sent_at").order("created_at", { ascending: false }).limit(100)) ?? { data: [] };
  return (
    <>
      <PageIntro eyebrow="Admin" title="Email log" lede="Skipped means no email provider was configured at the time; the message was NOT sent." />
      {!emailConfig() && <p className="verification-notice">No email provider is configured. Order emails are recorded here as skipped.</p>}
      {!data?.length ? <p className="empty-state">No emails recorded.</p> : (
        <div className="data-table-wrap"><table className="data-table">
          <caption className="visually-hidden">Recent emails</caption>
          <thead><tr><th scope="col">When</th><th scope="col">To</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Note</th></tr></thead>
          <tbody>{data.map((e) => (
            <tr key={e.id}><td>{new Date(e.created_at).toLocaleString("en-IN")}</td><td>{e.to_email}</td><td>{e.template}</td><td>{e.status}</td><td className="small">{e.last_error ?? ""}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}
