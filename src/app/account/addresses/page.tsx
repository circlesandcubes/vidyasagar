import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { INDIAN_STATES } from "@/lib/validation/account";
import { deleteAddressAction, makeDefaultAddressAction, saveAddressAction } from "@/app/account/actions";

export const metadata = { title: "Addresses", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AddressesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  await requireUser("/account/addresses");
  const client = await createUserClient();
  const { data: addresses } = (await client?.from("addresses").select("*").order("created_at")) ?? { data: [] };
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Account" title="Delivery addresses" lede="Delivery is within India." />
        <Flash searchParams={params} />
        {!addresses?.length ? <p className="empty-state">No saved addresses.</p> : (
          <ul className="plain-list">
            {addresses.map((a) => (
              <li key={a.id} className="panel">
                <strong>{a.label ?? a.recipient_name}</strong>{a.is_default && <span className="chip chip-quiet"> Default</span>}
                <p>{a.recipient_name}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city}, {a.state} {a.postal_code}{a.phone ? <><br />{a.phone}</> : null}</p>
                {!a.is_default && <form className="inline-form" action={makeDefaultAddressAction.bind(null, a.id)}><button className="link-button" type="submit">Make default</button></form>}
                <form className="inline-form" action={deleteAddressAction.bind(null, a.id)}><button className="link-button" type="submit">Delete</button></form>
              </li>
            ))}
          </ul>
        )}
        <form action={saveAddressAction} className="form-stack">
          <h2 className="form-heading">Add an address</h2>
          <div className="field"><label htmlFor="label">Label (optional, e.g. Home)</label><input id="label" name="label" maxLength={40} /></div>
          <div className="field"><label htmlFor="recipientName">Recipient name</label><input id="recipientName" name="recipientName" required maxLength={120} autoComplete="name" /></div>
          <div className="field"><label htmlFor="phone">Mobile number (optional)</label><input id="phone" name="phone" inputMode="tel" autoComplete="tel" /></div>
          <div className="field"><label htmlFor="line1">Address line 1</label><input id="line1" name="line1" required maxLength={200} autoComplete="address-line1" /></div>
          <div className="field"><label htmlFor="line2">Address line 2 (optional)</label><input id="line2" name="line2" maxLength={200} autoComplete="address-line2" /></div>
          <div className="field-row">
            <div className="field"><label htmlFor="city">City</label><input id="city" name="city" required maxLength={100} autoComplete="address-level2" /></div>
            <div className="field"><label htmlFor="state">State</label><select id="state" name="state" required autoComplete="address-level1">{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="field"><label htmlFor="postalCode">PIN code</label><input id="postalCode" name="postalCode" required inputMode="numeric" maxLength={6} autoComplete="postal-code" /></div>
          </div>
          <div className="field-check"><input id="isDefault" name="isDefault" type="checkbox" /><label htmlFor="isDefault">Use as my default address</label></div>
          <button className="button" type="submit">Save address</button>
        </form>
      </div>
    </main>
  );
}
