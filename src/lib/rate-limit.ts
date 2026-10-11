import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";

/** Salted hash of the client address: lets us rate limit without storing IPs. */
export async function clientKey(scope: string): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const salt = process.env.RATE_LIMIT_SALT ?? "vidyasagar-default-salt";
  return `${scope}:${createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32)}`;
}

/**
 * true  = allowed.
 * false = over the limit OR the limiter is unavailable (fails closed: for
 *         abuse-prone public forms, refusing is safer than accepting unchecked).
 *         `failOpen` is for sign-in flows, which Supabase Auth already limits: a
 *         limiter outage must not lock every customer out.
 */
export async function allowRequest(scope: string, max: number, windowSeconds: number, options: { failOpen?: boolean } = {}): Promise<boolean> {
  const service = createServiceClient();
  if (!service) return options.failOpen === true;
  const { data, error } = await service.rpc("check_rate_limit", {
    p_key: await clientKey(scope),
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) return options.failOpen === true;
  return data === true;
}
