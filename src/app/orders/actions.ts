"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";

export async function cancelPendingOrderAction(orderId: string, orderNumber: string) {
  await requireUser(`/orders/${orderNumber}`);
  const client = await createUserClient();
  if (!client) redirect(`/orders/${orderNumber}?error=not_configured`);
  const { error } = await client.rpc("cancel_pending_order", { p_order_id: orderId });
  revalidatePath(`/orders/${orderNumber}`);
  redirect(`/orders/${orderNumber}?${error ? "error=order_unavailable" : "notice=order_cancelled"}`);
}
