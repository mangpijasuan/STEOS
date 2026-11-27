import { expect, test } from "@playwright/test";
import { AUTH, expectNoSidewaysScroll, watchProblems } from "./helpers";

test.use({ storageState: AUTH.owner });

// The owner sets the restaurant's time zone in Hours & settings; opening hours and pickup times follow it.
test("the owner can change the time zone and it is still there after a reload", async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto("/manage");
  const zone = page.getByLabel("Time zone");
  await expect(zone).toBeVisible();
  const original = await zone.inputValue(); // the tests' restaurants sit in a fixed midday zone; put it back afterwards
  try {
    const other = original === "America/Denver" ? "America/Los_Angeles" : "America/Denver";
    await zone.selectOption(other);
    await page.getByRole("button", { name: "Save ordering settings" }).click();
    await expect(page.getByText("Ordering settings saved")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Time zone")).toHaveValue(other);
    await expectNoSidewaysScroll(page);
  } finally {
    const res = await page.request.patch("/api/staff/settings", { data: { timezone: original } });
    expect(res.ok()).toBe(true);
  }
  expect(problems.list()).toEqual([]);
});
