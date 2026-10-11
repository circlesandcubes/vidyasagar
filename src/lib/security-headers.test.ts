import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";

describe("content security policy", () => {
  const csp = contentSecurityPolicy({ supabaseUrl: "https://abc.supabase.co/rest" });
  it("blocks framing, plugins and foreign form posts", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("base-uri 'self'");
  });
  it("allows Razorpay Checkout and the configured Supabase origin only", () => {
    expect(csp).toMatch(/script-src[^;]*https:\/\/checkout\.razorpay\.com/);
    expect(csp).toMatch(/frame-src[^;]*https:\/\/api\.razorpay\.com/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/abc\.supabase\.co(?!\/)/);
  });
  it("does not allow eval or plain http connections in production", () => {
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/connect-src[^;]*http:/);
    expect(contentSecurityPolicy({ isDev: true })).toContain("unsafe-eval");
  });
  it("includes the standard hardening headers", () => {
    const names = securityHeaders().map((h) => h.key);
    for (const n of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Strict-Transport-Security", "Permissions-Policy"]) expect(names).toContain(n);
  });
});
