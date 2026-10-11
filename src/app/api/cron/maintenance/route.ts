import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { expirePendingOrders, retryOutbox } from "@/lib/commerce/server";
import { serviceRoleConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Scheduled job (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). */
export async function GET(request: Request) {
  if (!authorised(request)) return NextResponse.json({ ok: false }, { status: 401 });
  if (!serviceRoleConfigured()) return NextResponse.json({ ok: false }, { status: 503 });
  try {
    const expired = await expirePendingOrders();
    const emails = await retryOutbox();
    return NextResponse.json({ ok: true, expiredOrders: expired, emails });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
