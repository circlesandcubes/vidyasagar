import { expect, test } from "@playwright/test";

test("every response carries the security headers", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBeTruthy();
  expect(h["x-powered-by"]).toBeUndefined();
});

for (const path of ["/admin", "/account", "/sell", "/checkout", "/orders"]) {
  test(`${path} does not expose content to a signed-out visitor`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  });
}

test("the webhook refuses unsigned requests", async ({ request }) => {
  const res = await request.post("/api/webhooks/razorpay", { data: { event: "payment.captured" } });
  expect([400, 503]).toContain(res.status());
});

test("the maintenance job refuses requests without the secret", async ({ request }) => {
  expect((await request.get("/api/cron/maintenance")).status()).toBe(401);
});

test("an unknown retailer link goes back to the catalogue, never off-site", async ({ page }) => {
  await page.goto("/go/00000000-0000-0000-0000-000000000000/amazon");
  await expect(page).toHaveURL(/\/books$/);
});

test("the catalogue CSV downloads", async ({ request }) => {
  const res = await request.get("/institutions/catalogue.csv");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
});
