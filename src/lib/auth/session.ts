import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { hasAnyRole, isAppRole, type AppRole } from "@/lib/auth/roles";
import { createUserClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string | null };

/** getUser() re-validates the JWT with Supabase Auth; getSession() would not. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const client = await createUserClient();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
});

export const getCurrentRoles = cache(async (): Promise<AppRole[]> => {
  const user = await getCurrentUser();
  const client = await createUserClient();
  if (!user || !client) return [];
  const { data } = await client.from("user_roles").select("role").eq("user_id", user.id);
  return (data ?? []).map((row) => row.role as string).filter(isAppRole);
});

export async function requireUser(next = "/account"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export async function requireRole(wanted: readonly AppRole[], next = "/account") {
  const user = await requireUser(next);
  const roles = await getCurrentRoles();
  if (!hasAnyRole(roles, wanted)) redirect("/account?notice=forbidden");
  return { user, roles };
}
