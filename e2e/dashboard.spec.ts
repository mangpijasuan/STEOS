import { expect, test } from "@playwright/test";
import { AUTH, expectNoSidewaysScroll, watchProblems } from "./helpers";

test.use({ storageState: AUTH.owner });

// Regression: on a phone the recent-orders table once ran off the right edge, so the total of each order was cut off.
test("every recent order's total is visible on the dashboard at every screen size", async ({ page }) => {
  const problems = watchProblems(page);
  await page.route("**/api/staff/orders/history*", (route) =>
    route.fulfill({
      json: {
        orders: [
          { id: "00000000-0000-0000-0000-000000000001", number: 41, status: "completed", orderType: "pickup", tableLabel: null, customerName: "A customer with a rather long name", paid: true, totalCents: 12345, createdAt: new Date().toISOString() },
          { id: "00000000-0000-0000-0000-000000000002", number: 40, status: "awaiting_acceptance", orderType: "counter", tableLabel: null, customerName: "Walk-in", paid: false, totalCents: 981, createdAt: new Date().toISOString() },
        ],
      },
    }),
  );
  await page.goto("/dashboard");
  const totals = page.locator(".data-table td.num");
  await expect(totals).toHaveCount(2);
  const width = page.viewportSize()!.width;
  for (const cell of await totals.all()) {
    const box = (await cell.boundingBox())!;
    expect(box.x + box.width, "the total must end inside the screen").toBeLessThanOrEqual(width);
  }
  await expect(page.getByText("$123.45")).toBeVisible();
  await expectNoSidewaysScroll(page);
  expect(problems.list()).toEqual([]);
});

test("the dashboard is calm when nothing is waiting and has no empty comparison text", async ({ page }) => {
  await page.route("**/api/staff/orders", (route) => route.fulfill({ json: { counts: { awaiting_acceptance: 0, accepted: 0, ready: 0 } } }));
  await page.route("**/api/staff/reports/summary*", (route) =>
    route.fulfill({
      json: {
        timezone: "America/Chicago", paidOrders: 1, grossCents: 1690, netChargedCents: 1690, refunds: { count: 0, totalCents: 0 }, averageOrderCents: 1690, netEstimateCents: 1668,
        byType: { pickup: { orders: 0, grossCents: 0 }, dine_in: { orders: 0, grossCents: 0 }, counter: { orders: 1, grossCents: 1690 } },
        byCategory: [{ name: "Appetizers", sortOrder: 0, salesCents: 495 }],
        days: [{ date: new Date().toISOString().slice(0, 10), orders: 1, grossCents: 1690, refundCents: 0 }],
        previous: { paidOrders: 0, grossCents: 0, netChargedCents: 0, averageOrderCents: 0, netEstimateCents: 0 },
      },
    }),
  );
  await page.goto("/dashboard");
  await expect(page.getByText("Estimated take-home")).toBeVisible();
  // With nothing to compare against, a percentage would be meaningless, so none is shown.
  await expect(page.getByText("New this period")).toHaveCount(0);
  await expect(page.locator(".live-tile.quiet")).toHaveCount(4);
});
