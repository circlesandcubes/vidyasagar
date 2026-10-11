import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicConfig } from "@/lib/env";

/**
 * Per-request client acting as the signed-in user (anon key + the user's JWT).
 * Row-level security applies. Returns null when Supabase is not configured.
 */
export async function createUserClient() {
  const config = supabasePublicConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only; the
          // middleware refreshes the session instead.
        }
      },
    },
  });
}
