import Link from "next/link";
import { TextField } from "@/components/auth-form";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { createPageMetadata } from "@/lib/book-metadata";
import { getCurrentUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { applyAsSellerAction } from "@/app/sell/actions";

// Session-dependent: must never be prerendered or cached.
export const dynamic = "force-dynamic";

export const metadata = createPageMetadata({
  title: "List your book",
  description: "Apply to list your children’s books on Vidyasagar as an author or publisher.",
  path: "/join",
});

export default async function JoinPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  let applications: { id: string; kind: string; display_name: string; status: string }[] = [];
  if (user) {
    const client = await createUserClient();
    const { data } = (await client?.from("seller_applications").select("id, kind, display_name, status").order("created_at", { ascending: false })) ?? { data: [] };
    applications = data ?? [];
  }
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro
          eyebrow="Authors and publishers"
          title="List your book on Vidyasagar."
          lede="Every listing is reviewed by our editors before it is published. Review records on the site always say exactly who reviewed what."
        />
        <Flash searchParams={params} />
        <section className="prose">
          <h2>How it works</h2>
          <ol>
            <li>Apply below. We review applications by hand.</li>
            <li>Once approved, add a book as a draft with its details, editions and the rights you hold.</li>
            <li>Submit it. Editors may ask for changes, and you will see their notes.</li>
            <li>Approved listings are published by an editor. You cannot publish directly.</li>
          </ol>
          <p>
            Author or publisher approval of content is shown as exactly that. It is never presented as independent
            verification. See <Link href="/verified-knowledge/how-it-works">how reviews work</Link>.
          </p>
        </section>

        {applications.length > 0 && (
          <section aria-labelledby="your-applications">
            <h2 id="your-applications" className="form-heading">Your applications</h2>
            <ul className="plain-list">
              {applications.map((a) => (
                <li key={a.id}>{a.display_name} ({a.kind}) — {a.status}</li>
              ))}
            </ul>
          </section>
        )}

        {user ? (
          <form action={applyAsSellerAction} className="form-stack">
            <h2 className="form-heading">Apply</h2>
            <div className="field">
              <label htmlFor="kind">I am applying as</label>
              <select id="kind" name="kind" defaultValue="author">
                <option value="author">An author or illustrator</option>
                <option value="publisher">A publisher</option>
              </select>
            </div>
            <TextField name="displayName" label="Name as it should appear publicly" maxLength={160} />
            <div className="field">
              <label htmlFor="bio">About you (optional)</label>
              <textarea id="bio" name="bio" rows={4} maxLength={4000} />
            </div>
            <TextField name="websiteUrl" label="Website (https, optional)" type="url" required={false} maxLength={300} />
            <button className="button" type="submit">Submit application</button>
          </form>
        ) : (
          <p><Link className="button" href="/login?next=/join">Sign in to apply</Link></p>
        )}
      </div>
    </main>
  );
}
