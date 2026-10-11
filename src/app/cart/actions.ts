"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cartLineCount, getCartId, MAX_CART_LINES, requireService } from "@/lib/commerce/server";
import { formDataToObject } from "@/lib/validation/auth";

const quantity = z.coerce.number().int().min(1).max(20);
const uuid = z.string().uuid();

function back(path: string, error?: string): never {
  revalidatePath("/cart");
  redirect(error ? `${path}?error=${error}` : path);
}

export async function addToCartAction(editionId: string, returnTo: string, formData: FormData) {
  const qty = quantity.safeParse(formData.get("quantity") ?? 1);
  if (!qty.success || !uuid.safeParse(editionId).success) return back("/cart", "invalid_input");
  const service = requireService();
  // Verify the edition is genuinely for sale before it enters a cart.
  const { data: edition } = await service
    .from("book_editions")
    .select("id, availability, book:books(status), prices:product_prices(is_active)")
    .eq("id", editionId)
    .maybeSingle();
  const book = Array.isArray(edition?.book) ? edition?.book[0] : edition?.book;
  const priced = (edition?.prices as { is_active: boolean }[] | undefined)?.some((p) => p.is_active);
  if (!edition || edition.availability !== "available" || book?.status !== "published" || !priced) return back(returnTo, "failed");

  const cartId = await getCartId(true);
  if (!cartId) return back("/cart", "failed");
  // Same edition without personalisation merges into one line.
  const { data: existing } = await service.from("cart_lines").select("id, quantity").eq("cart_id", cartId).eq("edition_id", editionId).is("personalisation", null).maybeSingle();
  if (existing) {
    await service.from("cart_lines").update({ quantity: Math.min(20, existing.quantity + qty.data) }).eq("id", existing.id);
  } else {
    if ((await cartLineCount(cartId)) >= MAX_CART_LINES) return back("/cart", "failed");
    await service.from("cart_lines").insert({ cart_id: cartId, edition_id: editionId, quantity: qty.data });
  }
  back("/cart");
}

export async function setQuantityAction(lineId: string, formData: FormData) {
  const qty = quantity.safeParse(formDataToObject(formData).quantity);
  const cartId = await getCartId(false);
  if (!qty.success || !cartId || !uuid.safeParse(lineId).success) return back("/cart", "invalid_input");
  await requireService().from("cart_lines").update({ quantity: qty.data }).eq("id", lineId).eq("cart_id", cartId);
  back("/cart");
}

export async function removeLineAction(lineId: string) {
  const cartId = await getCartId(false);
  if (cartId && uuid.safeParse(lineId).success) await requireService().from("cart_lines").delete().eq("id", lineId).eq("cart_id", cartId);
  back("/cart");
}

export async function applyCouponAction(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return back("/cart", "invalid_input");
  const cartId = await getCartId(true);
  if (!cartId) return back("/cart", "failed");
  await requireService().from("carts").update({ coupon_code: code }).eq("id", cartId);
  back("/cart");
}

export async function removeCouponAction() {
  const cartId = await getCartId(false);
  if (cartId) await requireService().from("carts").update({ coupon_code: null }).eq("id", cartId);
  back("/cart");
}
