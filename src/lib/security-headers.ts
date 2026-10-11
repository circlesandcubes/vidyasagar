/**
 * Security headers applied to every response (see next.config.ts).
 *
 * CSP notes:
 *  - Next.js injects inline bootstrap scripts, so script-src needs 'unsafe-inline'
 *    until a nonce-based policy is added (tracked in docs/SECURITY.md). 'unsafe-eval'
 *    is allowed only in development (React refresh).
 *  - checkout.razorpay.com is allowed for the Razorpay Checkout script and frame;
 *    api.razorpay.com / lumberjack.razorpay.com for its own network calls.
 *  - Supabase is allowed for browser-side calls and images from Storage.
 */
export type HeaderPolicyOptions = { isDev?: boolean; supabaseUrl?: string };

export function contentSecurityPolicy({ isDev = false, supabaseUrl }: HeaderPolicyOptions = {}): string {
  const supabase = supabaseUrl ? new URL(supabaseUrl).origin : null;
  const razorpay = ["https://checkout.razorpay.com", "https://api.razorpay.com"];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : []), "https://checkout.razorpay.com"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(supabase ? [supabase] : []), ...razorpay, "https://lumberjack.razorpay.com", ...(isDev ? ["ws:", "http:"] : [])],
    "frame-src": ["https://api.razorpay.com", "https://checkout.razorpay.com"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  };
  return Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`).join("; ");
}

export function securityHeaders(options: HeaderPolicyOptions = {}): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://checkout.razorpay.com\")" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
}
