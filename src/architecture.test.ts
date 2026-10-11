// Structural rules that are easy to break by accident and costly when broken.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const files = walk(SRC).map((f) => relative(process.cwd(), f));
const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

describe("architecture", () => {
  it("keeps session-dependent pages dynamic so they are never prerendered", () => {
    const protectedRoots = ["src/app/admin", "src/app/sell", "src/app/review", "src/app/account", "src/app/checkout", "src/app/orders"];
    const pages = files.filter((f) => /\/(page|layout)\.tsx$/.test(f) && protectedRoots.some((r) => f.startsWith(r)));
    expect(pages.length).toBeGreaterThan(0);
    // A layout covers its pages; check the root layout/page of each area plus every page without one.
    for (const page of pages.filter((f) => f.endsWith("page.tsx"))) {
      const area = protectedRoots.find((r) => page.startsWith(r))!;
      const layout = `${area}/layout.tsx`;
      const covered = files.includes(layout) && read(layout).includes('dynamic = "force-dynamic"');
      expect(covered || read(page).includes('dynamic = "force-dynamic"'), page).toBe(true);
    }
  });

  it("only allows the service-role client in server-only intake, webhook and job code", () => {
    const allowedExact = [
      "src/lib/supabase/service.ts",
      "src/lib/rate-limit.ts",
      "src/app/report-error/actions.ts",
      "src/lib/commerce/server.ts",
    ];
    // Webhook/cron routes and the commerce helpers that wrap the service client.
    const allowed = { includes: (f: string) => allowedExact.includes(f) };
    const importers = files.filter(
      (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts") && /@\/lib\/supabase\/service/.test(read(f)),
    );
    for (const f of importers) expect(allowed.includes(f), `${f} may not import the service-role client`).toBe(true);
  });

  it("never reads the service-role key outside its module", () => {
    for (const f of files.filter((x) => /\.(ts|tsx)$/.test(x) && !x.endsWith(".test.ts"))) {
      if (f === "src/lib/supabase/service.ts" || f === "src/lib/env.ts") continue;
      expect(read(f), f).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    }
  });

  it("never exposes secrets through NEXT_PUBLIC_ variables", () => {
    for (const f of files.filter((x) => /\.(ts|tsx)$/.test(x))) {
      expect(read(f), f).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE_ROLE|PRIVATE)/);
    }
  });

  it("uses server actions only in files that declare 'use server'", () => {
    for (const f of files.filter((x) => x.endsWith("actions.ts"))) {
      expect(read(f).trimStart().startsWith('"use server"'), f).toBe(true);
    }
  });

  it("requires an explicit role check in every admin page and admin action", () => {
    const targets = files.filter((f) => f.startsWith("src/app/admin/") && /\/(page\.tsx|actions\.ts)$/.test(f));
    expect(targets.length).toBeGreaterThan(10);
    for (const f of targets) expect(read(f), `${f} must call requireRole`).toMatch(/requireRole\(/);
  });

  it("keeps payment, webhook and cron routes uncached and behind their own verification", () => {
    const routes = {
      "src/app/api/webhooks/razorpay/route.ts": "verifyWebhookSignature",
      "src/app/api/payments/razorpay/verify/route.ts": "verifyCheckoutSignature",
      "src/app/api/cron/maintenance/route.ts": "CRON_SECRET",
    };
    for (const [file, guard] of Object.entries(routes)) {
      expect(read(file), file).toContain('dynamic = "force-dynamic"');
      expect(read(file), file).toContain(guard);
    }
  });

  it("never lets client components import server-only commerce modules", () => {
    for (const f of files.filter((x) => /\.(ts|tsx)$/.test(x) && !/\.test\.tsx?$/.test(x))) {
      if (!read(f).trimStart().startsWith('"use client"')) continue;
      expect(read(f), f).not.toMatch(/@\/lib\/(commerce\/(server|checkout|refunds|enquiries|newsletter)|supabase\/service|payments\/razorpay)/);
    }
  });
});
