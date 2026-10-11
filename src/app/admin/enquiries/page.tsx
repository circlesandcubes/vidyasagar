import Link from "next/link";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { ORGANISATION_LABELS } from "@/lib/validation/enquiry";

export const metadata = { title: "Bulk enquiries" };
export const dynamic = "force-dynamic";

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  await requireRole(["admin"], "/admin/enquiries");
  const client = await createUserClient();
  const { data } = (await client?.from("bulk_enquiries").select("reference, organisation_name, organisation_type, contact_name, status, expected_quantity, created_at").order("created_at", { ascending: false }).limit(200)) ?? { data: [] };
  return (
    <>
      <PageIntro eyebrow="Admin" title="Bulk enquiries" lede="Contains contact details: administrators only." />
      <Flash searchParams={params} />
      {!data?.length ? <p className="empty-state">No enquiries yet.</p> : (
        <div className="data-table-wrap"><table className="data-table">
          <caption className="visually-hidden">Enquiries</caption>
          <thead><tr><th scope="col">Reference</th><th scope="col">Organisation</th><th scope="col">Type</th><th scope="col">Contact</th><th scope="col">Copies</th><th scope="col">Status</th><th scope="col">Received</th></tr></thead>
          <tbody>{data.map((e) => (
            <tr key={e.reference}>
              <th scope="row"><Link href={`/admin/enquiries/${e.reference}`}>{e.reference}</Link></th>
              <td>{e.organisation_name}</td><td>{ORGANISATION_LABELS[e.organisation_type as keyof typeof ORGANISATION_LABELS]}</td>
              <td>{e.contact_name}</td><td>{e.expected_quantity ?? ""}</td><td>{e.status.replace("_", " ")}</td><td>{new Date(e.created_at).toLocaleDateString("en-IN")}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      <p><Link href="/admin/tiers">Volume price guide</Link></p>
    </>
  );
}
