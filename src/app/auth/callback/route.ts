import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/redirect";
import { createUserClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  const client = await createUserClient();
  if (!code || !client) return NextResponse.redirect(`${origin}/login?error=link_expired`);
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=link_expired`);
  return NextResponse.redirect(`${origin}${next}`);
}
