"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorCode } from "@/lib/action-state";
import { requireRole } from "@/lib/auth/session";
import { sendRefundToGateway } from "@/lib/commerce/refunds";
import { requireService, sendEmail, sendRefundProcessedEmail } from "@/lib/commerce/server";
import { createUserClient } from "@/lib/supabase/server";
import { formDataToObject } from "@/lib/validation/auth";
import { ORDER_NEXT, refundSchema, shipmentSchema } from "@/lib/validation/commerce-admin";

async function ctx(number: string, admin = false) {
  const path = `/admin/orders/${number}`;
  await requireRole(admin ? ["admin"] : ["admin", "curator"], path);
  const client = await createUserClient();
  if (!client) redirect(`${path}?error=not_configured`);
  return { client, path };
}
function done(path: string, error: string | null, notice = "saved"): never {
  revalidatePath(path);
  revalidatePath("/admin/orders");
  redirect(`${path}?${error ? `error=${error}` : `notice=${notice}`}`);
}

export async function setOrderStatusAction(orderId: string, number: string, status: string, formData: FormData) {
  const { client, path } = await ctx(number);
  const { data: order } = await client.from("orders").select("status").eq("id", orderId).maybeSingle();
  if (!order || !(ORDER_NEXT[order.status] ?? []).includes(status)) return done(path, "not_allowed");
  const note = String(formData.get("note") ?? "").slice(0, 500) || null;
  const { error } = await client.rpc("admin_set_order_status", { p_order_id: orderId, p_status: status, p_note: note });
  return done(path, error ? dbErrorCode(error.message) : null);
}

export async function shipOrderAction(orderId: string, number: string, formData: FormData) {
  const { client, path } = await ctx(number);
  const p = shipmentSchema.safeParse(formDataToObject(formData));
  if (!p.success) return done(path, "invalid_input");
  const { error } = await client.rpc("admin_set_order_status", {
    p_order_id: orderId, p_status: "shipped", p_note: p.data.note ?? null,
    p_carrier: p.data.carrier, p_tracking: p.data.tracking ?? null, p_tracking_url: p.data.trackingUrl ?? null,
  });
  if (error) return done(path, dbErrorCode(error.message));
  const service = requireService();
  const { data: order } = await service.from("orders").select("order_number, customer_email").eq("id", orderId).maybeSingle();
  if (order) {
    await sendEmail(`order-shipped:${orderId}`, order.customer_email, {
      kind: "order_shipped", orderNumber: order.order_number, carrier: p.data.carrier, trackingNumber: p.data.tracking, trackingUrl: p.data.trackingUrl,
    });
  }
  return done(path, null);
}

export async function requestRefundAction(orderId: string, number: string, formData: FormData) {
  const { client, path } = await ctx(number, true);
  const p = refundSchema.safeParse(formDataToObject(formData));
  if (!p.success) return done(path, "invalid_input");
  const { data, error } = await client.rpc("request_refund", { p_order_id: orderId, p_amount_minor: p.data.amount, p_reason: p.data.reason });
  if (error || !data) return done(path, error ? dbErrorCode(error.message) : "failed");
  const sent = await sendRefundToGateway(data as string);
  if (sent === "no_gateway") return done(path, "gateway_unavailable");
  return done(path, sent === "failed" ? "refund_failed" : null);
}

export async function confirmManualRefundAction(refundId: string, number: string, formData: FormData) {
  const { client, path } = await ctx(number, true);
  const reference = String(formData.get("reference") ?? "").trim().slice(0, 120);
  const { error } = await client.rpc("mark_refund_processed", { p_refund_id: refundId, p_reference: reference });
  if (error) return done(path, dbErrorCode(error.message));
  const { data: refund } = await client.from("refunds").select("order_id, amount_minor").eq("id", refundId).maybeSingle();
  if (refund) await sendRefundProcessedEmail(refund.order_id, refund.amount_minor, refundId);
  return done(path, null);
}
