import { PageIntro } from "@/components/page-intro";
import { getCommerceSettings } from "@/lib/commerce/server";

type Key = "returns" | "shipping" | "privacy" | "terms";

/**
 * Policies are written and approved by the operator and stored in site settings.
 * Nothing here invents legal wording; until published, the page says so.
 * Text is rendered as plain paragraphs (never as HTML).
 */
export async function PolicyPage({ policy, title }: { policy: Key; title: string }) {
  const settings = await getCommerceSettings();
  const text = settings.policies[policy];
  return (
    <main id="main-content">
      <div className="content-wrap prose">
        <PageIntro eyebrow="Policies" title={title} />
        {text ? (
          text.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)
        ) : (
          <p className="verification-notice">This policy has not been published yet.</p>
        )}
        {settings.businessName && settings.supportEmail && (
          <p className="small muted">{settings.businessName} · <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a></p>
        )}
      </div>
    </main>
  );
}
