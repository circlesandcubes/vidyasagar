import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAllowedRetailerUrl } from "@/lib/catalogue/purchase";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Click-through to an external retailer. The database function returns the
 * approved destination only for an enabled link on a published book, and records
 * the click (edition, channel, time: no IP, user agent or account). Anything
 * else goes back to the site rather than to an arbitrary address.
 */
export async function GET(request: Request, { params }: { params: Promise<{ editionId: string; channel: string }> }) {
  const { editionId, channel } = await params;
  const home = new URL("/books", request.url);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !UUID.test(editionId) || (channel !== "amazon" && channel !== "flipkart")) {
    return NextResponse.redirect(home, 302);
  }
  const source = new URL(request.url).searchParams.get("s") ?? undefined;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await client.rpc("record_purchase_click", { p_edition_id: editionId, p_channel: channel, p_source: source ?? null });
  // Defence in depth: re-check the host even though the database already constrains it.
  if (typeof data !== "string" || !isAllowedRetailerUrl(channel, data)) return NextResponse.redirect(home, 302);
  const response = NextResponse.redirect(data, 302);
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
