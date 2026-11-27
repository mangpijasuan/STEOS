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

// An owner brands their own storefront with no help: pick a color and a tagline, save, and the ordering page shows them.
test("the owner can brand the storefront and guests see it", async ({ page, browser }) => {
  const problems = watchProblems(page);
  await page.goto("/manage");
  await expect(page.getByRole("heading", { name: "Storefront look" })).toBeVisible();
  try {
    await page.getByRole("switch", { name: /Use my own colors/ }).check();

    // A color that is hard to read on white is refused with a plain message, and cannot be saved.
    await page.getByLabel("Brand color code").fill("#ffe14d");
    await expect(page.getByText(/too light to read on a white page/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save storefront look" })).toBeDisabled();

    await page.getByLabel("Brand color code").fill("#1d4ed8");
    await page.getByLabel("Tagline").fill("Fresh, made to order.");
    await page.getByRole("switch", { name: /Menu search/ }).check();
    await page.getByRole("button", { name: "Save storefront look" }).click();
    await expect(page.getByText("Storefront look saved")).toBeVisible();
    await expectNoSidewaysScroll(page);

    // A guest (no sign-in) sees the new look.
    const guest = await browser.newContext({ colorScheme: "light" });
    const storefront = await guest.newPage();
    await storefront.goto("/r/e2e-kitchen");
    await expect(storefront.getByText("Fresh, made to order.")).toBeVisible();
    await expect(storefront.getByLabel("Explore the menu")).toBeVisible();
    const brand = await storefront.locator(".rb-store").evaluate((el) => getComputedStyle(el).getPropertyValue("--brand").trim().toLowerCase());
    expect(brand).toBe("#1d4ed8");
    await guest.close();
  } finally {
    // Put the test restaurant back to the standard look for the other tests.
    const res = await page.request.put("/api/staff/branding", { data: { color: null, colorDark: null, tagline: null, search: false, featured: [] } });
    expect(res.ok()).toBe(true);
  }
  expect(problems.list()).toEqual([]);
});
