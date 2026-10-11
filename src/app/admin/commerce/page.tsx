import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireRole } from "@/lib/auth/session";
import { commerceReadiness, getCommerceSettings } from "@/lib/commerce/server";
import { saveCommerceSettingsAction, setDirectSalesAction } from "@/app/admin/commerce/actions";

export const metadata = { title: "Commerce" };
export const dynamic = "force-dynamic";

export default async function CommercePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  await requireRole(["admin"], "/admin/commerce");
  const [readiness, s] = await Promise.all([commerceReadiness(), getCommerceSettings()]);
  const rupees = (m: number | null | undefined) => (m === null || m === undefined ? "" : String(m / 100));
  return (
    <>
      <PageIntro eyebrow="Admin" title="Commerce" lede="Online sales stay off until everything below is in place." />
      <Flash searchParams={params} />
      <section className="panel" aria-labelledby="ready-h">
        <h2 id="ready-h">Readiness</h2>
        <ul className="plain-list">
          {readiness.checks.map((c) => (
            <li key={c.key}>
              <strong>{c.ok ? "Ready" : c.blocking ? "Missing" : "Optional"}</strong>: {c.label}
              {!c.ok && <div className="small muted">{c.hint}</div>}
            </li>
          ))}
        </ul>
        <p>Online sales are currently <strong>{s.directSalesEnabled ? "on" : "off"}</strong>.</p>
        <form action={setDirectSalesAction.bind(null, !s.directSalesEnabled)}>
          <button className="button" type="submit" disabled={!s.directSalesEnabled && !readiness.ready}>{s.directSalesEnabled ? "Turn online sales off" : "Turn online sales on"}</button>
        </form>
      </section>

      <form action={saveCommerceSettingsAction} className="form-stack panel">
        <h2>Business, delivery and policies</h2>
        <div className="field"><label htmlFor="businessName">Business name (shown to customers)</label><input id="businessName" name="businessName" required maxLength={120} defaultValue={s.businessName ?? ""} /></div>
        <div className="field"><label htmlFor="supportEmail">Support email</label><input id="supportEmail" name="supportEmail" type="email" required defaultValue={s.supportEmail ?? ""} /></div>
        <div className="field"><label htmlFor="shippingFlat">Flat delivery charge (₹, 0 for free)</label><input id="shippingFlat" name="shippingFlat" required inputMode="decimal" defaultValue={rupees(s.shipping?.flatMinor)} /></div>
        <div className="field"><label htmlFor="shippingFreeOver">Free delivery over (₹, optional)</label><input id="shippingFreeOver" name="shippingFreeOver" inputMode="decimal" defaultValue={rupees(s.shipping?.freeOverMinor)} /></div>
        {([["policyReturns", "Returns and refunds policy", s.policies.returns], ["policyShipping", "Delivery policy", s.policies.shipping], ["policyPrivacy", "Privacy policy", s.policies.privacy], ["policyTerms", "Terms of sale", s.policies.terms]] as const).map(([name, label, value]) => (
          <div className="field" key={name}><label htmlFor={name}>{label}</label><textarea id={name} name={name} rows={8} defaultValue={value ?? ""} /></div>
        ))}
        <p className="small muted">Policy wording must be written or approved by the business owner or their legal adviser. Blank lines separate paragraphs; HTML is not interpreted.</p>
        <button className="button" type="submit">Save</button>
      </form>
    </>
  );
}
