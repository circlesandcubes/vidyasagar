import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireRole } from "@/lib/auth/session";
import { formatMinor } from "@/lib/money";
import { createUserClient } from "@/lib/supabase/server";
import { createCouponAction, createRuleAction, setCouponActiveAction, setRuleActiveAction } from "@/app/admin/discounts/actions";

export const metadata = { title: "Discounts and coupons" };
export const dynamic = "force-dynamic";

export default async function DiscountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  await requireRole(["admin"], "/admin/discounts");
  const client = await createUserClient();
  const [{ data: rules }, { data: coupons }] = client
    ? await Promise.all([
        client.from("discount_rules").select("*").order("created_at", { ascending: false }),
        client.from("coupons").select("*, rule:discount_rules(name)").order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];
  const describe = (r: { kind: string; value: number }) => (r.kind === "percent" ? `${r.value / 100}% off` : `${formatMinor(r.value)} off`);
  return (
    <>
      <PageIntro eyebrow="Admin" title="Discounts and coupons" lede="No discount exists unless you create it here. A rule that is not active, or is outside its dates, never applies." />
      <Flash searchParams={params} />
      <h2>Rules</h2>
      {!rules?.length ? <p className="empty-state">No rules yet.</p> : (
        <div className="data-table-wrap"><table className="data-table">
          <caption className="visually-hidden">Discount rules</caption>
          <thead><tr><th scope="col">Name</th><th scope="col">Discount</th><th scope="col">Conditions</th><th scope="col">State</th></tr></thead>
          <tbody>{rules.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.name}</th><td>{describe(r)}</td>
              <td className="small">{r.min_subtotal_minor > 0 ? `Min ${formatMinor(r.min_subtotal_minor)}. ` : ""}{r.requires_coupon ? "Coupon only. " : "Automatic. "}{r.stackable ? "Stackable. " : ""}{r.starts_at ? `From ${new Date(r.starts_at).toLocaleDateString("en-IN")}. ` : ""}{r.ends_at ? `Until ${new Date(r.ends_at).toLocaleDateString("en-IN")}.` : ""}</td>
              <td><form action={setRuleActiveAction.bind(null, r.id, !r.is_active)}><button className="link-button" type="submit">{r.is_active ? "Active: turn off" : "Off: turn on"}</button></form></td>
            </tr>))}</tbody>
        </table></div>
      )}
      <form action={createRuleAction} className="form-stack panel">
        <h3>New rule</h3>
        <div className="field"><label htmlFor="r-name">Name</label><input id="r-name" name="name" required maxLength={120} /></div>
        <div className="field-row">
          <div className="field"><label htmlFor="r-kind">Type</label><select id="r-kind" name="kind"><option value="percent">Percentage</option><option value="fixed">Fixed amount (₹)</option></select></div>
          <div className="field"><label htmlFor="r-value">Value (% or ₹)</label><input id="r-value" name="value" required inputMode="decimal" /></div>
          <div className="field"><label htmlFor="r-min">Minimum subtotal (₹, optional)</label><input id="r-min" name="minSubtotal" inputMode="decimal" /></div>
        </div>
        <div className="field-row">
          <div className="field"><label htmlFor="r-from">Starts (optional)</label><input id="r-from" name="startsAt" type="datetime-local" /></div>
          <div className="field"><label htmlFor="r-to">Ends (optional)</label><input id="r-to" name="endsAt" type="datetime-local" /></div>
        </div>
        <label><input type="checkbox" name="requiresCoupon" /> Only applies with a coupon code</label>
        <label><input type="checkbox" name="stackable" /> Can combine with the best automatic discount</label>
        <label><input type="checkbox" name="isActive" /> Active now</label>
        <button className="button" type="submit">Create rule</button>
      </form>

      <h2>Coupons</h2>
      {!coupons?.length ? <p className="empty-state">No coupons yet.</p> : (
        <ul className="plain-list">{coupons.map((c) => {
          const rule = Array.isArray(c.rule) ? c.rule[0] : c.rule;
          return (
            <li key={c.id}><strong>{c.code}</strong> → {rule?.name}. {c.max_redemptions ? `Max ${c.max_redemptions} uses. ` : ""}{c.expires_at ? `Expires ${new Date(c.expires_at).toLocaleDateString("en-IN")}. ` : ""}
              <form className="inline-form" action={setCouponActiveAction.bind(null, c.id, !c.is_active)}><button className="link-button" type="submit">{c.is_active ? "Active: turn off" : "Off: turn on"}</button></form></li>
          );
        })}</ul>
      )}
      {rules && rules.length > 0 && (
        <form action={createCouponAction} className="form-stack panel">
          <h3>New coupon</h3>
          <div className="field"><label htmlFor="c-code">Code</label><input id="c-code" name="code" required maxLength={32} autoComplete="off" /></div>
          <div className="field"><label htmlFor="c-rule">Rule</label><select id="c-rule" name="ruleId">{rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
          <div className="field-row">
            <div className="field"><label htmlFor="c-max">Max redemptions (optional)</label><input id="c-max" name="maxRedemptions" inputMode="numeric" /></div>
            <div className="field"><label htmlFor="c-per">Per customer</label><input id="c-per" name="perUserLimit" inputMode="numeric" defaultValue={1} /></div>
            <div className="field"><label htmlFor="c-exp">Expires (optional)</label><input id="c-exp" name="expiresAt" type="datetime-local" /></div>
          </div>
          <button className="button" type="submit">Create coupon</button>
        </form>
      )}
    </>
  );
}
