import "server-only";

import { friendlyOrderError } from "@/lib/commerce/errors";
import { commerceReadiness, getCartId, loadCart, requireService } from "@/lib/commerce/server";
import { createProviderOrder, razorpayConfig } from "@/lib/payments/razorpay";

export type PlaceOrderResult = { ok: true; orderId: string; orderNumber: string } | { ok: false; message: string };

export async function placeOrder(args: { userId: string; email: string; addressId: string; idempotencyKey: string }): Promise<PlaceOrderResult> {
  const readiness = await commerceReadiness();
  if (!readiness.ready) return { ok: false, message: "Online ordering is not open yet." };
  if (!/^[A-Za-z0-9-]{8,100}$/.test(args.idempotencyKey)) return { ok: false, message: "Please reload the page and try again." };

  const service = requireService();
  const { data: address } = await service.from("addresses").select("*").eq("id", args.addressId).eq("user_id", args.userId).maybeSingle();
  if (!address) return { ok: false, message: "Please choose a delivery address." };

  const cartId = await getCartId(false);
  if (!cartId) return { ok: false, message: "Your cart is empty." };
  const cart = await loadCart(cartId, args.userId);
  if (cart.lines.length === 0) return { ok: false, message: "Your cart is empty." };
  if (cart.hasProblems) return { ok: false, message: "Please remove unavailable items from your cart first." };
  if (cart.priced.totalMinor <= 0) return { ok: false, message: "Your order total must be more than zero." };

  const payloadLines = cart.priced.lines.map((p, index) => {
    const display = cart.lines.filter((l) => !l.problem)[index];
    return {
      edition_id: p.editionId,
      quantity: p.quantity,
      unit_price_minor: p.unitPriceMinor,
      list_price_minor: p.listPriceMinor,
      discount_minor: p.discountMinor,
      personalisation_unit_minor: p.personalisationUnitMinor,
      personalisation: display?.personalisation ?? null,
    };
  });

  const { data, error } = await service.rpc("create_order", {
    p_user_id: args.userId,
    p_idempotency_key: args.idempotencyKey,
    p_email: args.email,
    p_address: {
      recipient_name: address.recipient_name, phone: address.phone, line1: address.line1, line2: address.line2,
      city: address.city, state: address.state, postal_code: address.postal_code, country: address.country,
    },
    p_coupon_code: cart.priced.couponUsed,
    p_shipping_minor: cart.priced.shippingMinor,
    p_lines: payloadLines,
  });
  if (error) return { ok: false, message: friendlyOrderError(error.message) };
  const row = (data as { order_id: string; order_number: string; total_minor: number; created: boolean }[] | null)?.[0];
  if (!row) return { ok: false, message: friendlyOrderError(undefined) };

  if (row.created) {
    await service.from("cart_lines").delete().eq("cart_id", cartId);
    await service.from("carts").update({ coupon_code: null }).eq("id", cartId);
  }
  // A failed gateway call leaves a valid pending order; the pay page retries it.
  await ensureProviderOrder(row.order_id).catch(() => undefined);
  return { ok: true, orderId: row.order_id, orderNumber: row.order_number };
}

/** Returns the gateway order id for an unpaid order, creating it once if needed. */
export async function ensureProviderOrder(orderId: string): Promise<string | null> {
  const config = razorpayConfig();
  if (!config) return null;
  const service = requireService();
  const { data: existing } = await service.from("payments").select("provider_order_id").eq("order_id", orderId).eq("provider", "razorpay").maybeSingle();
  if (existing?.provider_order_id) return existing.provider_order_id;
  const { data: order } = await service.from("orders").select("order_number, total_minor, status").eq("id", orderId).maybeSingle();
  if (!order || order.status !== "pending_payment") return null;
  const created = await createProviderOrder(config, { amountMinor: order.total_minor, receipt: order.order_number });
  const { error } = await service.rpc("attach_provider_order", { p_order_id: orderId, p_provider: "razorpay", p_provider_order_id: created.id, p_amount_minor: order.total_minor });
  if (error) return null;
  return created.id;
}
