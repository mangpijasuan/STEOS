import { expect, test } from "@playwright/test";
import { AUTH, expectNoSidewaysScroll } from "./helpers";

test.use({ storageState: AUTH.staff });

test("terminal filters the menu and prepares an order without placing it", async ({ page }) => {
  await page.goto("/pos/terminal");
  await expect(page.getByRole("heading", { name: "Order terminal" })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Search the menu" });
  await page.keyboard.press("/");
  await expect(search).toBeFocused();
  await search.fill("Chicken rice bowl");
  await page.getByRole("button", { name: /Chicken rice bowl/ }).click();
  const review = page.getByRole("button", { name: /Review order/ });
  if (await review.isVisible()) await review.click();
  await expect(page.getByRole("heading", { name: "Order ticket" })).toBeVisible();
  await page.getByRole("button", { name: "Takeaway" }).click();
  await expect(page.getByRole("button", { name: /Take payment/ })).toBeEnabled();
  await expectNoSidewaysScroll(page);
});
