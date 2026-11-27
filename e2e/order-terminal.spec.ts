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

test("terminal edits modifiers inline and requires a fresh quote before payment", async ({ page }) => {
  await page.goto("/pos/terminal");
  await page.getByRole("button", { name: /Noodle bowl,/ }).click();
  await page.getByRole("radio", { name: "Chicken" }).check();
  await page.getByRole("button", { name: /Add to order/ }).click();
  const review = page.getByRole("button", { name: /Review order/ });
  if (await review.isVisible()) await review.click();
  await page.getByRole("button", { name: "Takeaway" }).click();
  await expect(page.getByRole("button", { name: /Take payment/ })).toBeEnabled();
  await page.getByRole("button", { name: "Edit Noodle bowl" }).click();
  const editor = page.getByRole("form", { name: "Edit Noodle bowl" });
  await expect(editor.getByRole("checkbox", { name: "Chicken" })).toBeChecked();
  await expect(page.getByRole("button", { name: /Take payment/ })).toBeDisabled();
  await editor.getByRole("checkbox", { name: "Chicken" }).uncheck();
  await expect(editor.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await editor.getByRole("checkbox", { name: "Tofu" }).check();
  await editor.getByLabel("Special instructions").fill("No onions");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Tofu", { exact: true })).toBeVisible();
  await expect(page.getByText("“No onions”", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Take payment/ })).toBeEnabled();
  await expectNoSidewaysScroll(page);
});
