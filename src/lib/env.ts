/** Presence checks only. Values are read where they are used; never log them. */
export function supabasePublicConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export function serviceRoleConfigured(): boolean {
  return Boolean(supabasePublicConfig() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
