import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { updateProfileAction } from "@/app/account/actions";

export const metadata = { title: "Profile", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const user = await requireUser("/account/profile");
  const client = await createUserClient();
  const { data } = (await client?.from("profiles").select("display_name").eq("id", user.id).maybeSingle()) ?? { data: null };
  return (
    <main id="main-content">
      <div className="content-wrap narrow">
        <PageIntro eyebrow="Account" title="Profile" />
        <Flash searchParams={params} />
        <form action={updateProfileAction} className="form-stack">
          <div className="field"><label htmlFor="displayName">Name</label><input id="displayName" name="displayName" maxLength={120} defaultValue={data?.display_name ?? ""} autoComplete="name" /></div>
          <p className="small muted">Email: {user.email}. We never ask for your child’s name or date of birth here.</p>
          <button className="button" type="submit">Save</button>
        </form>
      </div>
    </main>
  );
}
