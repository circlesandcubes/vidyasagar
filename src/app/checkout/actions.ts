"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { placeOrder } from "@/lib/commerce/checkout";
import { allowRequest } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/action-state";

const schema = z.object({ addressId: z.string().uuid(), idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{8,100}$/) });

export async function placeOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/checkout");
  const parsed = schema.safeParse({ addressId: formData.get("addressId"), idempotencyKey: formData.get("idempotencyKey") });
  if (!parsed.success) return { ok: false, message: "Please choose a delivery address." };
  if (!user.email) return { ok: false, message: "Your account needs an email address before ordering." };
  if (!(await allowRequest("place-order", 10, 600))) return { ok: false, message: "Too many attempts. Please wait a few minutes." };
  const result = await placeOrder({ userId: user.id, email: user.email, addressId: parsed.data.addressId, idempotencyKey: parsed.data.idempotencyKey });
  if (!result.ok) return { ok: false, message: result.message };
  redirect(`/checkout/pay/${result.orderId}`);
}
