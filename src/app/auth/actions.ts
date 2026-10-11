"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/redirect";
import { SITE_URL } from "@/lib/site";
import { createUserClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  formDataToObject,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  // Prefer the configured canonical URL; fall back to the request only in dev.
  return process.env.NEXT_PUBLIC_SITE_URL ? SITE_URL : host ? `${proto}://${host}` : SITE_URL;
}

export async function loginAction(formData: FormData) {
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const parsed = loginSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) redirect(`/login?error=invalid_credentials&next=${encodeURIComponent(next)}`);
  const client = await createUserClient();
  if (!client) redirect("/login?error=not_configured");
  const { error } = await client.auth.signInWithPassword(parsed.data);
  if (error) redirect(`/login?error=invalid_credentials&next=${encodeURIComponent(next)}`);
  redirect(next);
}

export async function registerAction(formData: FormData) {
  const parsed = registerSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) redirect("/register?error=invalid_input");
  const client = await createUserClient();
  if (!client) redirect("/register?error=not_configured");
  await client.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: parsed.data.displayName ? { display_name: parsed.data.displayName } : {},
      emailRedirectTo: `${await origin()}/auth/callback?next=/account`,
    },
  });
  // Same response whether or not the address already exists (no enumeration).
  redirect("/login?notice=check_email");
}

export async function forgotPasswordAction(formData: FormData) {
  const parsed = forgotPasswordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) redirect("/forgot-password?error=invalid_input");
  const client = await createUserClient();
  if (!client) redirect("/forgot-password?error=not_configured");
  await client.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await origin()}/auth/callback?next=/reset-password`,
  });
  redirect("/forgot-password?notice=check_email");
}

export async function resetPasswordAction(formData: FormData) {
  const parsed = resetPasswordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) redirect("/reset-password?error=invalid_input");
  const client = await createUserClient();
  if (!client) redirect("/reset-password?error=not_configured");
  const { error } = await client.auth.updateUser({ password: parsed.data.password });
  if (error) redirect("/reset-password?error=link_expired");
  redirect("/account?notice=password_updated");
}

export async function signOutAction() {
  const client = await createUserClient();
  await client?.auth.signOut();
  redirect("/login?notice=signed_out");
}
