import { expect, test } from "@playwright/test";
import { AUTH, expectNoSidewaysScroll } from "./helpers";

test.use({ storageState: AUTH.staff });

test("terminal filters the menu and prepares an order without placing it", async ({ page }) => {
  await page.goto("/pos/terminal");
  await expect(page.getByRole("heading", { name: "Order terminal" })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Search the menu" });
  // The "/" shortcut is attached after the terminal finishes loading, and it ignores the key while the page is busy.
  // Pressing once right after the heading appears can land before that, so press again until the search box has focus.
  await expect(async () => {
    await page.keyboard.press("/");
    await expect(search).toBeFocused({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
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

test("terminal holds multiple unsent tickets and restores their context", async ({ page }) => {
  await page.goto("/pos/terminal");
  let submissions = 0;
  page.on("request", req => { if (req.method() === "POST" && req.url().endsWith("/api/staff/pos/orders")) submissions++; });
  const review = page.getByRole("button", { name: /Review order/ });
  await page.getByRole("button", { name: /Chicken rice bowl,/ }).click();
  if (await review.isVisible()) await review.click();
  await page.getByRole("button", { name: "Takeaway" }).click();
  await page.getByLabel("Name (optional)").fill("Test guest");
  await page.getByRole("button", { name: "Hold ticket" }).click();
  await expect(page.getByRole("heading", { name: "Held tickets (1)" })).toBeVisible();
  await page.getByRole("button", { name: /Iced tea,/ }).click();
  if (await review.isVisible()) await review.click();
  await page.getByRole("button", { name: "Hold ticket" }).click();
  await expect(page.getByRole("heading", { name: "Held tickets (2)" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Held tickets (2)" })).toBeVisible();
  await page.getByRole("button", { name: /Resume ticket/ }).first().click();
  await expect(page.getByLabel("Name (optional)")).toHaveValue("Test guest");
  await expect(page.getByRole("group", { name: "Quantity of Chicken rice bowl" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Take payment/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Resume ticket/ })).toBeDisabled();
  expect(submissions).toBe(0);
  await expectNoSidewaysScroll(page);
  // Clean up persistent drafts because the three viewport projects share one disposable database.
  page.once("dialog", d => d.accept());
  await page.getByRole("complementary", { name: "Order summary" }).getByRole("button", { name: "Cancel draft" }).click();
  await expect(page.getByRole("heading", { name: "Held tickets (1)" })).toBeVisible();
  page.once("dialog", d => d.accept());
  await page.getByRole("region", { name: "Held tickets" }).getByRole("button", { name: "Cancel draft" }).click();
  await expect(page.getByRole("heading", { name: "Held tickets (0)" })).toBeVisible();
});
