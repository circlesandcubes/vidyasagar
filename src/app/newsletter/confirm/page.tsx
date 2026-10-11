import { redirect } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { applyToken } from "@/lib/commerce/newsletter";
import { serviceRoleConfigured } from "@/lib/env";

export const metadata = { title: "Confirm subscription", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// A GET only shows a button: mail scanners that pre-fetch links must not change anything.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token, email } = await searchParams;
  const valid = Boolean(token && email && /^[A-Za-z0-9_-]{43}$/.test(token));
  async function apply() {
    "use server";
    if (!valid || !serviceRoleConfigured()) return;
    const ok = await applyToken(email!, token!, "confirm");
    redirect(ok ? "/newsletter?notice=saved" : "/newsletter?error=link_expired");
  }
  return (
    <main id="main-content"><div className="content-wrap">
      <PageIntro eyebrow="Newsletter" title="Confirm subscription" />
      {valid ? (
        <form action={apply}><button className="button" type="submit">Confirm subscription</button></form>
      ) : (<p className="flash flash-error" role="alert">That link is not valid.</p>)}
    </div></main>
  );
}
