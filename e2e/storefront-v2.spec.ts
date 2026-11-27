import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll } from "./helpers";

test("a paused restaurant remains readable without enabling ordering", async ({ page }) => {
  await page.route("**/api/r/e2e-kitchen/menu", async (route) => {
    const response = await route.fetch();
    const menu = await response.json();
    menu.restaurant.orderingOpen = false;
    await route.fulfill({ response, json: menu });
  });
  await page.goto("/r/e2e-kitchen");
  await expect(page.getByText("Ordering paused", { exact: true })).toBeVisible();
  const card = page.locator(".item-card").first();
  await expect(card).toBeVisible();
  await expect(card).toBeDisabled();
  await expect(card).toHaveCSS("opacity", "1");
  await expect(page.locator(".add-fab")).toHaveCount(0);
  await expectNoSidewaysScroll(page);
  if ((page.viewportSize()?.width ?? 0) < 960) {
    await page.locator(".cart-bar button").click();
  }
  await expect(page.getByRole("button", { name: "Checkout", exact: true })).toBeDisabled();
});
