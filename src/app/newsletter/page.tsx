import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { getPublicSetting } from "@/lib/catalogue/data";
import { emailConfig } from "@/lib/email/provider";
import { subscribeAction } from "@/app/newsletter/actions";

export const metadata = { title: "Newsletter" };
export const dynamic = "force-dynamic";

export default async function NewsletterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const available = (await getPublicSetting("newsletter_enabled")) && Boolean(emailConfig());
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Newsletter" title="Stay in touch" />
        <Flash searchParams={params} />
        {available ? (
          <form action={subscribeAction} className="form-stack">
            <div className="field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
            <button className="button" type="submit">Subscribe</button>
            <p className="small muted">We email a confirmation link first. You are only subscribed once you click it.</p>
          </form>
        ) : (
          <p className="verification-notice">The newsletter is not open yet.</p>
        )}
      </div>
    </main>
  );
}
