import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { emailConfig, providerFromEnv } from "@/lib/email/provider";
import { enqueueEmail, type EnqueueResult, type OutboxStore } from "@/lib/email/outbox";
import type { EmailData } from "@/lib/email/templates";
import { razorpayConfig } from "@/lib/payments/razorpay";
import { createServiceClient } from "@/lib/supabase/service";
import type { PersonalisationTemplate } from "@/lib/personalisation";
import { priceCart, type CartLineInput, type DiscountRule, type PricedCart, type ShippingConfig } from "@/lib/commerce/pricing";

export const CART_COOKIE = "vs_cart";
const MAX_CART_LINES = 30;

type Service = NonNullable<ReturnType<typeof createServiceClient>>;
export function requireService(): Service {
  const service = createServiceClient();
  if (!service) throw new Error("Service role is not configured");
  return service;
}

// ---- settings and readiness ----------------------------------------------------

export type CommerceSettings = {
  directSalesEnabled: boolean;
  shipping: ShippingConfig | null;
  policies: Record<"returns" | "shipping" | "privacy" | "terms", string | null>;
  businessName: string | null;
  supportEmail: string | null;
};

const asString = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const asInt = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);

export async function getCommerceSettings(): Promise<CommerceSettings> {
  const service = createServiceClient();
  const rows = service ? (await service.from("site_settings").select("key, value")).data ?? [] : [];
  const map = new Map(rows.map((r) => [r.key as string, r.value as unknown]));
  const flat = asInt(map.get("shipping_flat_minor"));
  return {
    directSalesEnabled: map.get("direct_sales_enabled") === true,
    shipping: flat === null ? null : { flatMinor: flat, freeOverMinor: asInt(map.get("shipping_free_over_minor")) },
    policies: {
      returns: asString(map.get("policy_returns")),
      shipping: asString(map.get("policy_shipping")),
      privacy: asString(map.get("policy_privacy")),
      terms: asString(map.get("policy_terms")),
    },
    businessName: asString(map.get("business_name")),
    supportEmail: asString(map.get("support_email")),
  };
}

export type ReadinessCheck = { key: string; label: string; ok: boolean; blocking: boolean; hint: string };

export async function commerceReadiness(): Promise<{ checks: ReadinessCheck[]; ready: boolean }> {
  const settings = await getCommerceSettings();
  const service = createServiceClient();
  let pricedEditions = 0;
  if (service) {
    const { count } = await service.from("product_prices").select("id", { count: "exact", head: true }).eq("is_active", true);
    pricedEditions = count ?? 0;
  }
  const rz = razorpayConfig();
  const checks: ReadinessCheck[] = [
    { key: "service", label: "Service-role key configured", ok: Boolean(service), blocking: true, hint: "Set the Supabase service-role key as a server-only environment variable (see .env.example)." },
    { key: "gateway", label: "Payment gateway keys configured", ok: Boolean(rz), blocking: true, hint: "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET." },
    { key: "webhook", label: "Payment webhook secret configured", ok: Boolean(rz?.webhookSecret), blocking: true, hint: "Set RAZORPAY_WEBHOOK_SECRET and point the gateway webhook to /api/webhooks/razorpay." },
    { key: "shipping", label: "Shipping charge configured", ok: settings.shipping !== null, blocking: true, hint: "Set the flat shipping charge under Commerce settings (0 is allowed)." },
    { key: "policies", label: "Returns, shipping, privacy and terms published", ok: Object.values(settings.policies).every(Boolean), blocking: true, hint: "Publish all four policies under Commerce settings. They must be written and approved by the operator." },
    { key: "business", label: "Business name and support email set", ok: Boolean(settings.businessName && settings.supportEmail), blocking: true, hint: "Customers need to know who they are buying from and how to reach them." },
    { key: "prices", label: "At least one edition has an active price", ok: pricedEditions > 0, blocking: true, hint: "Add prices under Prices." },
    { key: "email", label: "Email provider configured", ok: Boolean(emailConfig()), blocking: false, hint: "Without it, order emails are recorded as skipped and not sent." },
  ];
  return { checks, ready: checks.filter((c) => c.blocking).every((c) => c.ok) };
}

// ---- email -----------------------------------------------------------------------

function supabaseOutboxStore(service: Service): OutboxStore {
  return {
    async insert(row) {
      const { data, error } = await service.from("email_outbox").insert(row).select("id").maybeSingle();
      if (error) {
        if (error.code === "23505") return null;
        throw new Error(error.message);
      }
      return data?.id ?? null;
    },
    async update(id, patch) {
      await service.from("email_outbox").update(patch).eq("id", id);
    },
  };
}

/** Best-effort: email problems must never fail a payment or an order. */
export async function sendEmail(dedupeKey: string, to: string, data: EmailData): Promise<EnqueueResult | "error"> {
  const service = createServiceClient();
  if (!service) return "error";
  try {
    return await enqueueEmail({ store: supabaseOutboxStore(service), transport: providerFromEnv() }, { dedupeKey, to, data });
  } catch {
    return "error";
  }
}

export async function sendOrderConfirmation(orderId: string) {
  const service = createServiceClient();
  if (!service) return;
  const { data: order } = await service
    .from("orders")
    .select("order_number, total_minor, customer_email, lines:order_lines(title, quantity, line_total_minor, personalisation)")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;
  const lines = (order.lines as { title: string; quantity: number; line_total_minor: number; personalisation: { fields?: { label: string; value: string }[] } | null }[]).map((l) => ({
    title: l.title,
    quantity: l.quantity,
    totalMinor: l.line_total_minor,
    personalisation: l.personalisation?.fields?.map((f) => `${f.label}: ${f.value}`),
  }));
  await sendEmail(`order-confirmation:${orderId}`, order.customer_email, { kind: "order_confirmation", orderNumber: order.order_number, totalMinor: order.total_minor, lines });
}

// ---- cart ----------------------------------------------------------------------------

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function getCartId(create: boolean): Promise<string | null> {
  const service = requireService();
  const jar = await cookies();
  const token = jar.get(CART_COOKIE)?.value;
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    const { data } = await service.from("carts").select("id").eq("token_hash", hashToken(token)).maybeSingle();
    if (data) return data.id;
  }
  if (!create) return null;
  const fresh = randomBytes(32).toString("base64url");
  const { data, error } = await service.from("carts").insert({ token_hash: hashToken(fresh) }).select("id").single();
  if (error || !data) throw new Error("Could not create cart");
  jar.set(CART_COOKIE, fresh, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return data.id;
}

export async function cartLineCount(cartId: string): Promise<number> {
  const { count } = await requireService().from("cart_lines").select("id", { count: "exact", head: true }).eq("cart_id", cartId);
  return count ?? 0;
}
export { MAX_CART_LINES };

// ---- pricing a stored cart -----------------------------------------------------------

export type CartPersonalisation = {
  template_id: string;
  template_slug: string;
  template_name: string;
  price_adjustment_minor: number;
  fields: { key: string; label: string; value: string }[];
};

export type CartDisplayLine = CartLineInput & {
  lineId: string;
  slug: string;
  editionLabel: string;
  isbn13: string | null;
  personalisation: CartPersonalisation | null;
  problem: string | null;
};

export type LoadedCart = {
  lines: CartDisplayLine[];
  priced: PricedCart;
  couponCode: string | null;
  problems: string[];
  hasProblems: boolean;
};

type EditionJoin = {
  id: string; format: string; language: string; isbn13: string | null; availability: string;
  book: { id: string; title: string; slug: string; status: string } | { id: string; title: string; slug: string; status: string }[] | null;
  prices: { list_price_minor: number; sale_price_minor: number | null; is_active: boolean }[] | null;
};
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export async function loadDiscountRules(service: Service): Promise<DiscountRule[]> {
  const { data } = await service.from("discount_rules").select("*, books:discount_rule_books(book_id)").eq("is_active", true);
  return (data ?? []).map((r) => ({
    id: r.id, name: r.name, kind: r.kind, value: r.value, minSubtotalMinor: r.min_subtotal_minor, startsAt: r.starts_at, endsAt: r.ends_at,
    isActive: r.is_active, stackable: r.stackable, requiresCoupon: r.requires_coupon, bookIds: (r.books as { book_id: string }[]).map((b) => b.book_id),
  }));
}

export async function loadCart(cartId: string, userId: string | null): Promise<LoadedCart> {
  const service = requireService();
  const settings = await getCommerceSettings();
  const { data: cart } = await service.from("carts").select("coupon_code").eq("id", cartId).maybeSingle();
  const { data: rows } = await service
    .from("cart_lines")
    .select("id, quantity, personalisation, edition:book_editions(id, format, language, isbn13, availability, book:books(id, title, slug, status), prices:product_prices(list_price_minor, sale_price_minor, is_active))")
    .eq("cart_id", cartId)
    .order("created_at");

  const problems: string[] = [];
  const lines: CartDisplayLine[] = [];
  const editionIds: string[] = [];
  for (const row of rows ?? []) {
    const edition = one(row.edition as EditionJoin | EditionJoin[] | null);
    const book = edition ? one(edition.book) : null;
    const price = edition?.prices?.find((p) => p.is_active) ?? null;
    let problem: string | null = null;
    if (!edition || !book || book.status !== "published" || edition.availability !== "available") problem = "No longer available";
    else if (!price) problem = "Not currently for sale";
    if (problem) problems.push(`${book?.title ?? "An item"}: ${problem}`);
    if (edition) editionIds.push(edition.id);
    lines.push({
      lineId: row.id, editionId: edition?.id ?? "", bookId: book?.id ?? "", title: book?.title ?? "Unavailable item", slug: book?.slug ?? "",
      quantity: row.quantity, listPriceMinor: price?.list_price_minor ?? 0, salePriceMinor: price?.sale_price_minor ?? null,
      personalisationUnitMinor: 0, editionLabel: edition ? `${edition.format.replace("_", " ")} · ${edition.language.toUpperCase()}` : "",
      isbn13: edition?.isbn13 ?? null, personalisation: (row.personalisation as CartPersonalisation | null) ?? null, problem,
    });
  }

  // Personalisation is re-priced from the live template, not from what the cart stored.
  const tmplIds = [...new Set(lines.flatMap((l) => (l.personalisation ? [l.personalisation.template_id] : [])))];
  if (tmplIds.length) {
    const { data: templates } = await service.from("personalisation_templates").select("id, price_adjustment_minor, is_active").in("id", tmplIds);
    const { data: enabled } = await service.from("book_personalisation").select("book_id, template_id").eq("is_enabled", true).in("template_id", tmplIds);
    for (const line of lines) {
      if (!line.personalisation) continue;
      const tmpl = templates?.find((t) => t.id === line.personalisation!.template_id);
      const allowed = tmpl?.is_active && enabled?.some((e) => e.book_id === line.bookId && e.template_id === tmpl.id);
      if (!allowed) {
        line.problem ??= "Personalisation is no longer available";
        problems.push(`${line.title}: personalisation is no longer available`);
      } else {
        line.personalisationUnitMinor = tmpl.price_adjustment_minor;
        line.personalisation = { ...line.personalisation, price_adjustment_minor: tmpl.price_adjustment_minor };
      }
    }
  }

  const rules = await loadDiscountRules(service);
  let coupon: { code: string; rule: DiscountRule; valid: boolean } | null = null;
  const code = (cart?.coupon_code as string | null) ?? null;
  if (code) {
    const { data: c } = await service.from("coupons").select("id, code, rule_id, max_redemptions, per_user_limit, expires_at, is_active").eq("code", code).maybeSingle();
    const rule = c ? rules.find((r) => r.id === c.rule_id) : undefined;
    if (c && rule) {
      let valid = c.is_active && (!c.expires_at || new Date(c.expires_at) > new Date());
      if (valid && c.max_redemptions !== null) {
        const { count } = await service.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", c.id);
        valid = (count ?? 0) < c.max_redemptions;
      }
      if (valid && userId) {
        const { count } = await service.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", c.id).eq("user_id", userId);
        valid = (count ?? 0) < c.per_user_limit;
      }
      coupon = { code: c.code, rule, valid };
    } else {
      coupon = { code, rule: rules[0] ?? ({ id: "", name: "", kind: "fixed", value: 1, minSubtotalMinor: 0, startsAt: null, endsAt: null, isActive: false, stackable: false, requiresCoupon: true, bookIds: [] } as DiscountRule), valid: false };
    }
  }

  const sellable = lines.filter((l) => !l.problem);
  const priced = priceCart({
    lines: sellable,
    automaticRules: rules,
    coupon,
    shipping: settings.shipping ?? { flatMinor: 0, freeOverMinor: null },
  });
  return { lines, priced, couponCode: code, problems, hasProblems: problems.length > 0 };
}

export type { PersonalisationTemplate };

// ---- maintenance ---------------------------------------------------------------------

/** Re-sends failed/queued emails (max 5 attempts). "skipped" rows are never resent automatically. */
export async function retryOutbox(limit = 25): Promise<{ attempted: number; sent: number }> {
  const service = createServiceClient();
  const transport = providerFromEnv();
  if (!service || !transport) return { attempted: 0, sent: 0 };
  const { data } = await service
    .from("email_outbox")
    .select("id, to_email, subject, body_text, body_html, attempts")
    .in("status", ["failed", "queued"])
    .lt("attempts", 5)
    .order("created_at")
    .limit(limit);
  let sent = 0;
  for (const row of data ?? []) {
    try {
      await transport.provider.send({ to: row.to_email, from: transport.from, subject: row.subject, text: row.body_text, html: row.body_html ?? undefined });
      await service.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null }).eq("id", row.id);
      sent += 1;
    } catch (error) {
      await service.from("email_outbox").update({ status: "failed", attempts: row.attempts + 1, last_error: error instanceof Error ? error.message.slice(0, 300) : "send failed" }).eq("id", row.id);
    }
  }
  return { attempted: data?.length ?? 0, sent };
}

export async function expirePendingOrders(): Promise<number> {
  const service = requireService();
  const { data, error } = await service.rpc("expire_pending_orders");
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : 0;
}

export async function sendRefundProcessedEmail(orderId: string, amountMinor: number, refundKey: string) {
  const service = createServiceClient();
  if (!service) return;
  const { data: order } = await service.from("orders").select("order_number, customer_email").eq("id", orderId).maybeSingle();
  if (order) await sendEmail(`refund-processed:${refundKey}`, order.customer_email, { kind: "refund_processed", orderNumber: order.order_number, amountMinor });
}
