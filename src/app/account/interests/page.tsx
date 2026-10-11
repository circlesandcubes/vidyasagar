import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireUser } from "@/lib/auth/session";
import { getAgeGroups, getSkills } from "@/lib/catalogue/data";
import { createUserClient } from "@/lib/supabase/server";
import { saveInterestsAction } from "@/app/account/actions";

export const metadata = { title: "Interests", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function InterestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const user = await requireUser("/account/interests");
  const client = await createUserClient();
  const [skills, ages, mySkills, myAges] = await Promise.all([
    getSkills(), getAgeGroups(),
    client?.from("user_skill_interests").select("skill_id").eq("user_id", user.id),
    client?.from("user_age_groups").select("age_group_id").eq("user_id", user.id),
  ]);
  const chosenSkills = new Set((mySkills?.data ?? []).map((r) => r.skill_id as string));
  const chosenAges = new Set((myAges?.data ?? []).map((r) => r.age_group_id as string));
  const parents = skills.filter((s) => !s.parent_id);
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Account" title="Interests" lede="Choose age groups and skills to get explained suggestions. We do not store your child’s name, birthday or photo." />
        <Flash searchParams={params} />
        <form action={saveInterestsAction} className="form-stack">
          <fieldset className="form-stack">
            <legend className="form-heading">Age groups</legend>
            {ages.map((g) => (
              <div className="field-check" key={g.id}>
                <input id={`age-${g.id}`} type="checkbox" name="ageGroupIds" value={g.id} defaultChecked={chosenAges.has(g.id)} />
                <label htmlFor={`age-${g.id}`}>{g.name}</label>
              </div>
            ))}
          </fieldset>
          {parents.map((p) => (
            <fieldset className="form-stack" key={p.id}>
              <legend className="form-heading">{p.name}</legend>
              <div className="field-check"><input id={`sk-${p.id}`} type="checkbox" name="skillIds" value={p.id} defaultChecked={chosenSkills.has(p.id)} /><label htmlFor={`sk-${p.id}`}>Everything in {p.name}</label></div>
              {skills.filter((s) => s.parent_id === p.id).map((s) => (
                <div className="field-check" key={s.id}><input id={`sk-${s.id}`} type="checkbox" name="skillIds" value={s.id} defaultChecked={chosenSkills.has(s.id)} /><label htmlFor={`sk-${s.id}`}>{s.name}</label></div>
              ))}
            </fieldset>
          ))}
          <button className="button" type="submit">Save interests</button>
        </form>
      </div>
    </main>
  );
}
