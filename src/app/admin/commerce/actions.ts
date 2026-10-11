"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorCode } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { commerceReadiness } from "@/lib/commerce/server";
import { createUserClient } from "@/lib/supabase/server";
import { formDataToObject } from "@/lib/validation/auth";
import { commerceSettingsSchema } from "@/lib/validation/commerce-admin";

const PATH = "/admin/commerce";

function done(error: string | null): never {
  revalidatePath(PATH);
  revalidatePath("/", "layout");
  redirect(`${PATH}?${error ? `error=${error}` : "notice=saved"}`);
}

export async function saveCommerceSettingsAction(formData: FormData) {
  await requireRole(["admin"], PATH);
  const client = await createUserClient();
  if (!client) return done("not_configured");
  const p = commerceSettingsSchema.safeParse(formDataToObject(formData));
  if (!p.success) return done("invalid_input");
  const me = (await client.auth.getUser()).data.user?.id;
  const d = p.data;
  const rows = [
    ["business_name", d.businessName], ["support_email", d.supportEmail],
    ["shipping_flat_minor", d.shippingFlat], ["shipping_free_over_minor", d.shippingFreeOver ?? null],
    ["policy_returns", d.policyReturns || null], ["policy_shipping", d.policyShipping || null],
    ["policy_privacy", d.policyPrivacy || null], ["policy_terms", d.policyTerms || null],
  ].map(([key, value]) => ({ key, value, is_public: false, updated_by: me }));
  const { error } = await client.from("site_settings").upsert(rows, { onConflict: "key" });
  return done(error ? dbErrorCode(error.message) : null);
}

/** Turning sales on is refused until every blocking readiness check passes. Turning off is always allowed. */
export async function setDirectSalesAction(enable: boolean) {
  await requireRole(["admin"], PATH);
  const client = await createUserClient();
  if (!client) return done("not_configured");
  if (enable) {
    const readiness = await commerceReadiness();
    if (!readiness.ready) return done("commerce_not_ready");
  }
  const me = (await client.auth.getUser()).data.user?.id;
  const { error } = await client.from("site_settings").update({ value: enable, updated_by: me }).eq("key", "direct_sales_enabled");
  return done(error ? dbErrorCode(error.message) : null);
}
