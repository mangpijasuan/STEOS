import { expect, test } from "@playwright/test";
import { AUTH, expectNoSidewaysScroll, isOnTop, watchProblems } from "./helpers";

test.use({ storageState: AUTH.staff });

// Regression: on a phone or tablet the payment sheet once opened behind the order summary, so staff could not take a sale.
test("staff can take a cash payment at the till on every screen size", async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto("/pos");
  await page.getByRole("button", { name: /Chicken rice bowl/ }).first().click();
  // Below the desktop layout the order summary is a sheet that opens from the bar at the bottom.
  const review = page.getByRole("button", { name: /Review order/ });
  if (await review.isVisible().catch(() => false)) await review.click();
  await page.getByRole("button", { name: "Takeaway" }).click();
  await page.getByRole("button", { name: /Take payment/ }).click();

  const cash = page.getByRole("button", { name: /Cash received/ });
  await expect(cash).toBeVisible();
  expect(await isOnTop(cash), "the Cash received button must not be covered by another sheet").toBe(true);
  await cash.click();

  await expect(page.getByText(/placed/i).first()).toBeVisible();
  await expect(page.getByText(/Paid/i).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /receipt/i }).first()).toBeVisible();
  await expectNoSidewaysScroll(page);
  expect(problems.list()).toEqual([]);
});
