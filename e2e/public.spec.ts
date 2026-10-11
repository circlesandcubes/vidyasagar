import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PUBLIC_PAGES = ["/", "/books", "/skills", "/ages", "/collections", "/authors", "/publishers", "/verified-knowledge", "/content-standards", "/institutions", "/institutions/enquiry", "/privacy", "/terms", "/shipping", "/returns", "/cart", "/login", "/register", "/report-error", "/join", "/newsletter"];

for (const path of PUBLIC_PAGES) {
  test(`renders ${path} with a heading, landmarks and no serious accessibility violations`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(400);
    await expect(page.locator("main#main-content")).toHaveCount(1);
    await expect(page.locator("h1").first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`), path).toEqual([]);
  });

  test(`${path} does not scroll horizontally`, async ({ page }) => {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  });
}

test("skip link is the first focusable element and moves focus to the main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.locator(":focus");
  await expect(skip).toContainText(/skip to (main )?content/i);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
});

test("policy pages say so plainly when nothing has been published", async ({ page }) => {
  await page.goto("/returns");
  await expect(page.getByText("This policy has not been published yet.")).toBeVisible();
});

test("the cart explains that online ordering is unavailable when it is not configured", async ({ page }) => {
  await page.goto("/cart");
  await expect(page.getByText(/not available on this site yet/i)).toBeVisible();
});
