"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dbErrorCode } from "@/lib/action-state";
import { APP_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";

const PATH = "/admin/users";
const input = z.object({ userId: z.string().uuid(), role: z.enum(APP_ROLES) });

async function change(userId: string, role: string, grant: boolean) {
  const { user } = await requireRole(["admin"], PATH);
  const client = await createUserClient();
  const back = (code: string): never => redirect(`${PATH}?${code}`);
  if (!client) return back("error=not_configured");
  const p = input.safeParse({ userId, role });
  if (!p.success) return back("error=invalid_input");
  // 'customer' is the baseline role every account keeps.
  if (p.data.role === "customer") return back("error=not_allowed");
  if (!grant && p.data.userId === user.id && p.data.role === "admin") return back("error=not_allowed");
  const { error } = grant
    ? await client.from("user_roles").insert({ user_id: p.data.userId, role: p.data.role, granted_by: user.id })
    : await client.from("user_roles").delete().eq("user_id", p.data.userId).eq("role", p.data.role);
  revalidatePath(PATH);
  return back(error && error.code !== "23505" ? `error=${dbErrorCode(error.message)}` : "notice=saved");
}

export async function grantRoleAction(userId: string, role: string) { return change(userId, role, true); }
export async function revokeRoleAction(userId: string, role: string) { return change(userId, role, false); }
