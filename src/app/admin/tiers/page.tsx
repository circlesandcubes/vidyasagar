import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { createTierAction, deleteTierAction } from "@/app/admin/tiers/actions";

export const metadata = { title: "Volume price guide" };
export const dynamic = "force-dynamic";

export default async function TiersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  await requireRole(["admin"], "/admin/tiers");
  const client = await createUserClient();
  const { data } = (await client?.from("bulk_price_tiers").select("*").order("min_quantity")) ?? { data: [] };
  return (
    <>
      <PageIntro eyebrow="Admin" title="Volume price guide" lede="Optional. Nothing is offered unless you add it. Tiers marked public appear on the institutions page as a guide; quotations remain the binding price." />
      <Flash searchParams={params} />
      {!data?.length ? <p className="empty-state">No tiers defined.</p> : (
        <ul className="plain-list">{data.map((t) => (
          <li key={t.id}>{t.label}: {t.min_quantity}+ copies, {t.discount_bps / 100}% off{t.is_public ? " (public)" : " (internal)"}
            <form className="inline-form" action={deleteTierAction.bind(null, t.id)}><button className="link-button" type="submit">Delete</button></form></li>
        ))}</ul>
      )}
      <form action={createTierAction} className="form-stack panel">
        <h2>Add a tier</h2>
        <div className="field"><label htmlFor="label">Label</label><input id="label" name="label" required maxLength={80} /></div>
        <div className="field-row">
          <div className="field"><label htmlFor="minQuantity">From (copies)</label><input id="minQuantity" name="minQuantity" required inputMode="numeric" /></div>
          <div className="field"><label htmlFor="percent">Discount (%)</label><input id="percent" name="percent" required inputMode="decimal" /></div>
        </div>
        <label><input type="checkbox" name="isPublic" /> Show on the public institutions page</label>
        <button className="button" type="submit">Add</button>
      </form>
    </>
  );
}
