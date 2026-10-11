import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { createSkillAction, setSkillPublishedAction } from "@/app/admin/skills/actions";

export const metadata = { title: "Skills" };
export const dynamic = "force-dynamic";

export default async function SkillsAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  await requireRole(["admin", "curator"], "/admin/skills");
  const client = await createUserClient();
  const { data } = (await client?.from("skills").select("id, name, slug, parent_id, is_published, display_order").order("display_order").order("name")) ?? { data: [] };
  const skills = data ?? [];
  const name = (id: string | null) => skills.find((s) => s.id === id)?.name;
  return (
    <>
      <PageIntro eyebrow="Admin" title="Skills" lede="Skills are the topics books are linked to. A skill is hidden from the public until published." />
      <Flash searchParams={params} />
      {skills.length === 0 ? <p className="empty-state">No skills yet.</p> : (
        <div className="data-table-wrap"><table className="data-table">
          <caption className="visually-hidden">Skills</caption>
          <thead><tr><th scope="col">Name</th><th scope="col">Part of</th><th scope="col">Public</th></tr></thead>
          <tbody>{skills.map((s) => (
            <tr key={s.id}><th scope="row">{s.name} <span className="small muted">/{s.slug}</span></th><td>{name(s.parent_id) ?? ""}</td>
              <td><form action={setSkillPublishedAction.bind(null, s.id, !s.is_published)}><button className="link-button" type="submit">{s.is_published ? "Published: hide" : "Hidden: publish"}</button></form></td></tr>
          ))}</tbody>
        </table></div>
      )}
      <form action={createSkillAction} className="form-stack panel">
        <h2>Add a skill</h2>
        <div className="field"><label htmlFor="name">Name</label><input id="name" name="name" required maxLength={120} /></div>
        <div className="field"><label htmlFor="slug">Web address (lowercase, hyphens)</label><input id="slug" name="slug" required maxLength={80} /></div>
        <div className="field"><label htmlFor="parentId">Part of (optional)</label>
          <select id="parentId" name="parentId" defaultValue=""><option value="">Top level</option>{skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="field"><label htmlFor="description">Description (optional)</label><textarea id="description" name="description" rows={3} maxLength={1000} /></div>
        <div className="field"><label htmlFor="ageGuidance">Age guidance (optional)</label><input id="ageGuidance" name="ageGuidance" maxLength={300} /></div>
        <div className="field"><label htmlFor="displayOrder">Order</label><input id="displayOrder" name="displayOrder" inputMode="numeric" defaultValue={0} /></div>
        <label><input type="checkbox" name="isPublished" /> Publish now</label>
        <button className="button" type="submit">Add skill</button>
      </form>
    </>
  );
}
