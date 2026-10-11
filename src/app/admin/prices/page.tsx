import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { savePriceAction } from "@/app/admin/prices/actions";

export const metadata = { title: "Prices and stock" };
export const dynamic = "force-dynamic";

type Row = {
  id: string; format: string; isbn13: string | null;
  book: { title: string; status: string } | { title: string; status: string }[] | null;
  prices: { list_price_minor: number; sale_price_minor: number | null; tax_rate_bps: number; is_active: boolean }[];
  inventory: { stock_on_hand: number } | { stock_on_hand: number }[] | null;
};
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export default async function PricesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  await requireRole(["admin", "curator"], "/admin/prices");
  const client = await createUserClient();
  const { data } = (await client?.from("book_editions").select("id, format, isbn13, book:books(title, status), prices:product_prices(list_price_minor, sale_price_minor, tax_rate_bps, is_active), inventory:edition_inventory(stock_on_hand)").order("created_at", { ascending: false }).limit(200)) ?? { data: [] };
  const rows = (data ?? []) as unknown as Row[];
  return (
    <>
      <PageIntro eyebrow="Admin" title="Prices and stock" lede="Prices are in rupees and include tax. Only published books with an active price can be sold. Stock is whatever you enter here; nothing is assumed." />
      <Flash searchParams={params} />
      {rows.length === 0 && <p className="empty-state">No editions yet.</p>}
      {rows.map((r) => {
        const book = one(r.book);
        const price = r.prices.find((p) => p.is_active) ?? r.prices[0];
        const stock = one(r.inventory)?.stock_on_hand;
        return (
          <form key={r.id} action={savePriceAction} className="panel form-stack">
            <input type="hidden" name="editionId" value={r.id} />
            <h2>{book?.title ?? "Untitled"} <span className="small muted">({r.format}{r.isbn13 ? `, ISBN ${r.isbn13}` : ""}; book is {book?.status})</span></h2>
            <div className="field-row">
              <div className="field"><label htmlFor={`l-${r.id}`}>List price (₹)</label><input id={`l-${r.id}`} name="list" required inputMode="decimal" defaultValue={price ? price.list_price_minor / 100 : ""} /></div>
              <div className="field"><label htmlFor={`s-${r.id}`}>Sale price (₹, optional)</label><input id={`s-${r.id}`} name="sale" inputMode="decimal" defaultValue={price?.sale_price_minor ? price.sale_price_minor / 100 : ""} /></div>
              <div className="field"><label htmlFor={`t-${r.id}`}>Tax included (%)</label><input id={`t-${r.id}`} name="taxRatePercent" inputMode="decimal" defaultValue={price ? price.tax_rate_bps / 100 : 0} /></div>
              <div className="field"><label htmlFor={`k-${r.id}`}>Stock on hand</label><input id={`k-${r.id}`} name="stock" inputMode="numeric" defaultValue={stock ?? ""} /></div>
            </div>
            <label><input type="checkbox" name="isActive" defaultChecked={price?.is_active ?? false} /> Offer for sale on this site</label>
            <button className="button" type="submit">Save</button>
          </form>
        );
      })}
    </>
  );
}
