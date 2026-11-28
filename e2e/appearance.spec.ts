import { expect, test, type Page } from "@playwright/test";
import { AUTH, watchProblems } from "./helpers";

test.use({ storageState: AUTH.owner });

const bg = (page: Page) => page.locator(".ds").first().evaluate((el) => getComputedStyle(el).getPropertyValue("--bg").trim().toLowerCase());
const button = (page: Page, name: RegExp) => page.getByRole("button", { name }).first();

const NAVY = "#0a111f"; // the platform's dark background
const LIGHT = "#f7f5f2";

// Anyone can pick Light or Dark for Siamsil's own screens; the choice is remembered in the browser and wins over the device.
test.describe("on a light device", () => {
  test.use({ colorScheme: "light" });

  test("choosing Dark gives the midnight navy theme, and it is still there after a reload without a flash", async ({ page }) => {
    const problems = watchProblems(page);
    await page.goto("/dashboard");
    expect(await bg(page), "Match device on a light device is light").toBe(LIGHT);

    await button(page, /Appearance: Match device/).click(); // Match device -> Light
    await expect(button(page, /Appearance: Light/)).toBeVisible();
    expect(await bg(page)).toBe(LIGHT);

    await button(page, /Appearance: Light/).click(); // Light -> Dark
    await expect(button(page, /Appearance: Dark/)).toBeVisible();
    expect(await bg(page)).toBe(NAVY);

    // The saved choice is applied by a script in <head>, before the page paints.
    await page.reload();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.appearance)).toBe("dark");
    expect(await bg(page)).toBe(NAVY);
    await expect(button(page, /Appearance: Dark/)).toBeVisible();

    await button(page, /Appearance: Dark/).click(); // Dark -> Match device
    await expect(button(page, /Appearance: Match device/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.dataset.appearance)).toBeUndefined();
    expect(await bg(page)).toBe(LIGHT);
    expect(problems.list()).toEqual([]);
  });

  test("the kitchen stays dark whatever is chosen, and has no Appearance button", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("steos:appearance", "light"));
    await page.goto("/kitchen");
    expect(await bg(page)).toBe(NAVY);
    await expect(page.getByRole("button", { name: /Appearance:/ })).toHaveCount(0);
  });
});

test.describe("on a dark device", () => {
  test.use({ colorScheme: "dark" });

  test("a chosen Light wins over the device, and an unrelated value in storage is ignored", async ({ page }) => {
    await page.goto("/dashboard");
    expect(await bg(page), "Match device on a dark device is the navy theme").toBe(NAVY);

    await page.addInitScript(() => localStorage.setItem("steos:appearance", "light"));
    await page.reload();
    expect(await bg(page)).toBe(LIGHT);

    await page.addInitScript(() => localStorage.setItem("steos:appearance", "<script>"));
    await page.reload();
    expect(await bg(page)).toBe(NAVY);
  });
});
