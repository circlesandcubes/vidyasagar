"use server";

import { redirect } from "next/navigation";
import { getPersonalisationForBook, getPublishedBookBySlug } from "@/lib/catalogue/data";
import { cartLineCount, getCartId, MAX_CART_LINES, requireService } from "@/lib/commerce/server";
import { snapshotPersonalisation, validatePersonalisation } from "@/lib/personalisation";
import { formDataToObject } from "@/lib/validation/auth";

/** Validates against the stored template, then stores a snapshot in the cart. */
export async function addPersonalisedToCartAction(slug: string, templateSlug: string, editionId: string, formData: FormData) {
  const book = await getPublishedBookBySlug(slug);
  const template = book ? (await getPersonalisationForBook(book.id)).find((t) => t.slug === templateSlug) : undefined;
  const edition = book?.editions.find((e) => e.id === editionId);
  if (!book || !template || !edition) redirect(`/books/${slug}?error=failed`);
  const result = validatePersonalisation(template.fields, formDataToObject(formData));
  if (!result.ok) redirect(`/books/${slug}/personalise?error=invalid_input`);

  const service = requireService();
  const { data: price } = await service.from("product_prices").select("id").eq("edition_id", edition.id).eq("is_active", true).maybeSingle();
  if (!price || edition.availability !== "available") redirect(`/books/${slug}?error=failed`);
  const cartId = await getCartId(true);
  if (!cartId || (await cartLineCount(cartId)) >= MAX_CART_LINES) redirect("/cart?error=failed");
  await service.from("cart_lines").insert({ cart_id: cartId, edition_id: edition.id, quantity: 1, personalisation: snapshotPersonalisation(template, result.values) });
  redirect("/cart");
}
