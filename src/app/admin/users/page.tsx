import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { APP_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { grantRoleAction, revokeRoleAction } from "@/app/admin/users/actions";

export const metadata = { title: "Users and roles" };
export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { user } = await requireRole(["admin"], "/admin/users");
  const query = typeof params.q === "string" ? params.q.slice(0, 100) : null;
  const client = await createUserClient();
  const { data } = (await client?.rpc("admin_list_users", { p_query: query })) ?? { data: [] };
  const users = (data ?? []) as { user_id: string; email: string; created_at: string; roles: string[] }[];
  return (
    <>
      <PageIntro eyebrow="Admin" title="Users and roles" lede="Every role change is recorded in the audit log. You cannot remove your own administrator role." />
      <Flash searchParams={params} />
      <form method="get" className="inline-form" role="search">
        <label htmlFor="q">Search by email</label>
        <input id="q" name="q" defaultValue={query ?? ""} maxLength={100} />
        <button className="button" type="submit">Search</button>
      </form>
      {users.length === 0 ? <p className="empty-state">No users found.</p> : (
        <div className="data-table-wrap"><table className="data-table">
          <caption className="visually-hidden">Users</caption>
          <thead><tr><th scope="col">Email</th><th scope="col">Roles</th><th scope="col">Change</th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.user_id}>
              <th scope="row">{u.email}{u.user_id === user.id ? " (you)" : ""}</th>
              <td>{u.roles.join(", ")}</td>
              <td>
                {APP_ROLES.filter((r) => r !== "customer").map((r) => {
                  const has = u.roles.includes(r);
                  const locked = has && r === "admin" && u.user_id === user.id;
                  return (
                    <form key={r} className="inline-form" action={(has ? revokeRoleAction : grantRoleAction).bind(null, u.user_id, r)}>
                      <button className="link-button" type="submit" disabled={locked}>{has ? `Remove ${r}` : `Make ${r}`}</button>
                    </form>
                  );
                })}
              </td>
            </tr>))}</tbody>
        </table></div>
      )}
    </>
  );
}
