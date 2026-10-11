"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorCode } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { formDataToObject } from "@/lib/validation/auth";
import { couponSchema, discountRuleSchema } from "@/lib/validation/commerce-admin";

const PATH = "/admin/discounts";

async function ctx() {
  await requireRole(["admin"], PATH);
  const client = await createUserClient();
  if (!client) redirect(`${PATH}?error=not_configured`);
  return client;
}
function done(error: string | null): never {
  revalidatePath(PATH);
  redirect(`${PATH}?${error ? `error=${error}` : "notice=saved"}`);
}

export async function createRuleAction(formData: FormData) {
  const client = await ctx();
  const p = discountRuleSchema.safeParse(formDataToObject(formData));
  if (!p.success) return done("invalid_input");
  const d = p.data;
  const { error } = await client.from("discount_rules").insert({
    name: d.name, kind: d.kind, value: d.value, min_subtotal_minor: d.minSubtotal ?? 0,
    starts_at: d.startsAt?.toISOString() ?? null, ends_at: d.endsAt?.toISOString() ?? null,
    stackable: d.stackable, requires_coupon: d.requiresCoupon, is_active: d.isActive,
  });
  return done(error ? dbErrorCode(error.message) : null);
}

export async function setRuleActiveAction(id: string, active: boolean) {
  const client = await ctx();
  const { error } = await client.from("discount_rules").update({ is_active: active }).eq("id", id);
  return done(error ? dbErrorCode(error.message) : null);
}

export async function createCouponAction(formData: FormData) {
  const client = await ctx();
  const p = couponSchema.safeParse(formDataToObject(formData));
  if (!p.success) return done("invalid_input");
  const d = p.data;
  const { error } = await client.from("coupons").insert({
    code: d.code, rule_id: d.ruleId, max_redemptions: d.maxRedemptions ?? null, per_user_limit: d.perUserLimit,
    expires_at: d.expiresAt?.toISOString() ?? null,
  });
  return done(error ? dbErrorCode(error.message) : null);
}

export async function setCouponActiveAction(id: string, active: boolean) {
  const client = await ctx();
  const { error } = await client.from("coupons").update({ is_active: active }).eq("id", id);
  return done(error ? dbErrorCode(error.message) : null);
}
