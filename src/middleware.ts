import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie and keeps signed-out visitors out of
// account areas. Authorisation (roles) is enforced in the pages/actions and,
// ultimately, by row-level security; this is a convenience redirect only.
const PROTECTED_PREFIXES = ["/account", "/sell", "/admin", "/review", "/checkout", "/orders"];

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  let response = NextResponse.next({ request });
  if (!url || !anonKey) {
    if (!isProtected) return response;
    return NextResponse.redirect(new URL("/login?error=not_configured", request.url));
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (!data.user && isProtected) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/account/:path*", "/sell/:path*", "/admin/:path*", "/review/:path*", "/checkout/:path*", "/checkout", "/orders/:path*", "/orders", "/login", "/register"],
};
