import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { setFlagAction } from "@/app/admin/settings/actions";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const FLAGS = [
  { key: "reviews_enabled", label: "Customer reviews", help: "Lets signed-in customers submit reviews. Every review is held for moderation." },
] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  await requireRole(["admin"], "/admin/settings");
  const client = await createUserClient();
  const { data } = (await client?.from("site_settings").select("key, value")) ?? { data: [] };
  const values = new Map((data ?? []).map((r) => [r.key as string, r.value]));
  return (
    <>
      <PageIntro eyebrow="Admin" title="Settings" />
      <Flash searchParams={params} />
      {FLAGS.map((f) => (
        <section className="panel" key={f.key}>
          <h2>{f.label}</h2>
          <p>{f.help}</p>
          <p className="small">Currently <strong>{values.get(f.key) === true ? "on" : "off"}</strong>.</p>
          <form action={setFlagAction.bind(null, f.key, values.get(f.key) !== true)}>
            <button className="button" type="submit">{values.get(f.key) === true ? "Turn off" : "Turn on"}</button>
          </form>
        </section>
      ))}
    </>
  );
}
