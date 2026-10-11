import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { requireService, sendEmail } from "@/lib/commerce/server";
import { emailConfig } from "@/lib/email/provider";
import { SITE_URL } from "@/lib/site";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Double opt-in: store a hashed token, email a confirmation link. The response to
 * the visitor is identical whether or not the address was already known.
 */
export async function requestSubscription(email: string): Promise<"sent" | "unavailable"> {
  const service = requireService();
  const { data: flag } = await service.from("site_settings").select("value").eq("key", "newsletter_enabled").maybeSingle();
  if (flag?.value !== true || !emailConfig()) return "unavailable";
  const normal = email.trim().toLowerCase();
  const { data: existing } = await service.from("newsletter_subscriptions").select("id, confirmed_at, unsubscribed_at").ilike("email", normal).maybeSingle();
  if (existing?.confirmed_at && !existing.unsubscribed_at) return "sent";
  const token = randomBytes(32).toString("base64url");
  if (existing) await service.from("newsletter_subscriptions").update({ token_hash: hash(token), unsubscribed_at: null }).eq("id", existing.id);
  else await service.from("newsletter_subscriptions").insert({ email: normal, token_hash: hash(token) });
  const q = `token=${token}&email=${encodeURIComponent(normal)}`;
  await sendEmail(`newsletter-confirm:${hash(token)}`, normal, {
    kind: "newsletter_confirm", confirmUrl: `${SITE_URL}/newsletter/confirm?${q}`, unsubscribeUrl: `${SITE_URL}/newsletter/unsubscribe?${q}`,
  });
  return "sent";
}

export async function applyToken(email: string, token: string, action: "confirm" | "unsubscribe"): Promise<boolean> {
  const service = requireService();
  const { data: row } = await service.from("newsletter_subscriptions").select("id, token_hash").ilike("email", email.trim().toLowerCase()).maybeSingle();
  if (!row || row.token_hash !== hash(token)) return false;
  const patch = action === "confirm" ? { confirmed_at: new Date().toISOString(), unsubscribed_at: null } : { unsubscribed_at: new Date().toISOString() };
  const { error } = await service.from("newsletter_subscriptions").update(patch).eq("id", row.id);
  return !error;
}
