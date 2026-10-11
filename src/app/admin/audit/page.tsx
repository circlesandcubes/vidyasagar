import { PageIntro } from "@/components/page-intro";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";

export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await requireRole(["admin"], "/admin/audit");
  const client = await createUserClient();
  const { data } = (await client?.from("audit_log").select("id, occurred_at, actor_id, table_name, action, row_key, changed_columns, detail").order("id", { ascending: false }).limit(200)) ?? { data: [] };
  return (
    <>
      <PageIntro eyebrow="Admin" title="Audit log" lede="Who changed what, newest first. It records which fields changed and a few non-personal values, never customer details or free text. It cannot be edited." />
      {!data?.length ? <p className="empty-state">Nothing recorded yet.</p> : (
        <div className="data-table-wrap"><table className="data-table">
          <caption className="visually-hidden">Recent changes</caption>
          <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Table</th><th scope="col">Action</th><th scope="col">Row</th><th scope="col">Detail</th></tr></thead>
          <tbody>{data.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.occurred_at).toLocaleString("en-IN")}</td>
              <td className="small">{r.actor_id ?? "system"}</td><td>{r.table_name}</td><td>{r.action}</td>
              <td className="small">{r.row_key}</td>
              <td className="small">{r.changed_columns?.join(", ")} {r.detail ? JSON.stringify(r.detail) : ""}</td>
            </tr>))}</tbody>
        </table></div>
      )}
    </>
  );
}
