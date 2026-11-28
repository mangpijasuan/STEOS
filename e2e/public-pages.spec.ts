import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, watchProblems } from "./helpers";

const FOOTER = "One Platform. Every Business.";
const PAGES: [path: string, title: string, platformPage: boolean][] = [
  ["/", "Siamsil", true],
  ["/login", "Siamsil", true],
  ["/r/e2e-kitchen", "E2E Kitchen", false],
  ["/r/zogam-cafe", "Zogam Cafe", false],
];

for (const [path, title, platformPage] of PAGES) {
  test(`${path} loads cleanly, fits the screen and has the right title and footer`, async ({ page }) => {
    const problems = watchProblems(page);
    await page.goto(path);
    if (!platformPage) await expect(page.locator(".item-card").first()).toBeVisible();
    await expect(page).toHaveTitle(title);
    await expectNoSidewaysScroll(page);
    // The platform footer is on the platform's own pages only; a restaurant's storefront carries the restaurant's brand.
    if (platformPage) await expect(page.getByText(FOOTER)).toBeVisible();
    else await expect(page.getByText(FOOTER)).toHaveCount(0);
    expect(problems.list()).toEqual([]);
  });
}

test("the storefront does not leak the platform or old names", async ({ page }) => {
  await page.goto("/r/e2e-kitchen");
  await expect(page.locator(".item-card").first()).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(/SROS|Siamsil/);
});
