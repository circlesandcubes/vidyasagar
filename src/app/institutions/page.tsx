import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { createClient } from "@supabase/supabase-js";

export const metadata = { title: "Schools, libraries and institutions", description: "Bulk orders and quotations for schools, libraries, NGOs and companies." };
export const revalidate = 300;

async function publicTiers() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await client.from("bulk_price_tiers").select("label, min_quantity, discount_bps").order("min_quantity");
  return data ?? [];
}

export default async function InstitutionsPage() {
  const tiers = await publicTiers();
  return (
    <main id="main-content">
      <div className="content-wrap prose">
        <PageIntro eyebrow="Institutions" title="Schools, libraries and institutions" lede="Buying many copies? Send us an enquiry and we will reply with a written quotation." />
        <ol>
          <li>Send an enquiry with what you need and when.</li>
          <li>We review it and reply by email, usually with a quotation that states prices, delivery and how long it is valid.</li>
          <li>Payment and delivery for institutional orders are arranged directly with us after you accept a quotation.</li>
        </ol>
        {tiers.length > 0 && (
          <>
            <h2>Volume pricing guide</h2>
            <ul>{tiers.map((t) => <li key={t.min_quantity}>{t.label}: {t.min_quantity}+ copies, {t.discount_bps / 100}% off list price</li>)}</ul>
            <p className="small muted">A guide only; the quotation is the binding price.</p>
          </>
        )}
        <p><Link className="button" href="/institutions/enquiry">Start an enquiry</Link></p>
        <h2>Our catalogue</h2>
        <p>Browse the <Link href="/institutions/catalogue">printable catalogue</Link> or <a href="/institutions/catalogue.csv" download>download it as a spreadsheet (CSV)</a>. Prices are given in quotations.</p>
      </div>
    </main>
  );
}
