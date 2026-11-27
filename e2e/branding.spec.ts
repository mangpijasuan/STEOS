import { expect, test, type Page } from "@playwright/test";

const brand = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).getPropertyValue("--brand").trim().toLowerCase());

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test("the platform's own screens use navy (gold in dark mode); restaurants keep their own colors", async ({ page }) => {
      await page.goto("/login");
      expect(await brand(page, ".ds")).toBe(scheme === "light" ? "#183153" : "#d4af37");
      await page.goto("/r/e2e-kitchen");
      await expect(page.locator(".item-card").first()).toBeVisible();
      expect(await brand(page, ".ds"), "an ordinary restaurant keeps the default accent").toBe(scheme === "light" ? "#c2410c" : "#f07a45");
      await page.goto("/r/zogam-cafe");
      await expect(page.locator(".rb-brand img")).toBeVisible();
      expect(await brand(page, ".rb-store"), "Zogam Cafe keeps its green").toBe(scheme === "light" ? "#17623b" : "#8ed6a2");
    });

    test("the Zogam logo is a badge that sits inside the header bar with room around it", async ({ page }) => {
      await page.goto("/r/zogam-cafe");
      const badge = page.locator(".rb-brand");
      await expect(badge).toBeVisible();
      const [b, bar] = await Promise.all([badge.boundingBox(), page.locator(".rb-top").boundingBox()]);
      expect(b!.y - bar!.y, "space above the logo").toBeGreaterThanOrEqual(4);
      expect(bar!.y + bar!.height - (b!.y + b!.height), "space below the logo").toBeGreaterThanOrEqual(4);
      expect(b!.x, "space left of the logo").toBeGreaterThanOrEqual(4);
    });
  });
}
