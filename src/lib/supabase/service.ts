import "server-only";

import { createClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "@/lib/env";

/**
 * Service-role client. BYPASSES row-level security.
 *
 * Use only for work that has no user session (payment webhooks, public
 * error-report intake, rate limiting, email outbox). An architecture test
 * restricts which files may import this module.
 */
export function createServiceClient() {
  const config = supabasePublicConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !key) return null;
  return createClient(config.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
