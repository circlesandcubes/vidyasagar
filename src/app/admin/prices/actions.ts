"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorCode } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { formDataToObject } from "@/lib/validation/auth";
import { priceSchema } from "@/lib/validation/commerce-admin";

const PATH = "/admin/prices";

export async function savePriceAction(formData: FormData) {
  await requireRole(["admin", "curator"], PATH);
  const client = await createUserClient();
  const fail = (code: string): never => redirect(`${PATH}?error=${code}`);
  if (!client) return fail("not_configured");
  const p = priceSchema.safeParse(formDataToObject(formData));
  if (!p.success) return fail("invalid_input");
  const d = p.data;
  const values = { list_price_minor: d.list, sale_price_minor: d.sale ?? null, tax_rate_bps: Math.round(d.taxRatePercent * 100), is_active: d.isActive };

  const { data: existing } = await client.from("product_prices").select("id").eq("edition_id", d.editionId).eq("is_active", true).maybeSingle();
  // Look for any row so an inactive price is edited rather than duplicated.
  const { data: target } = existing ? { data: existing } : await client.from("product_prices").select("id").eq("edition_id", d.editionId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { error } = target
    ? await client.from("product_prices").update(values).eq("id", target.id)
    : await client.from("product_prices").insert({ edition_id: d.editionId, ...values });
  if (error) return fail(dbErrorCode(error.message));
  if (d.stock !== undefined) {
    const { error: stockError } = await client.from("edition_inventory").upsert({ edition_id: d.editionId, stock_on_hand: d.stock, updated_at: new Date().toISOString() }, { onConflict: "edition_id" });
    if (stockError) return fail(dbErrorCode(stockError.message));
  }
  revalidatePath(PATH);
  revalidatePath("/books", "layout");
  redirect(`${PATH}?notice=saved`);
}
