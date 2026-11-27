import { expect, test, type Page } from "@playwright/test";
import { AUTH, expectNoSidewaysScroll, watchProblems } from "./helpers";

async function toCheckout(page: Page) {
  const bar = page.locator(".cart-bar button");
  if (await bar.isVisible().catch(() => false)) await bar.click();
  await page.getByRole("button", { name: /Checkout|Continue/i }).first().click();
}

// A pickup guest taps "I'm here" and the kitchen sees it on the ticket.
test("a pickup guest tells the kitchen they have arrived, and the kitchen's ticket shows it", async ({ page, browser }, testInfo) => {
  const problems = watchProblems(page);
  const name = `Here ${testInfo.project.name} ${Date.now() % 100000}`;
  await page.goto("/r/e2e-kitchen");
  await page.getByRole("button", { name: /Chicken rice bowl/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Add to order/ }).click();
  await toCheckout(page);
  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Phone/).fill("918-555-0142");
  await page.getByRole("button", { name: /Continue to payment/ }).click();
  await page.getByRole("button", { name: /Simulate a successful card/ }).click();
  await page.waitForURL(/\/order\//);

  // before the kitchen has accepted, there is nothing to press
  await expect(page.getByText("Sent to the kitchen")).toBeVisible();
  await expect(page.getByRole("button", { name: "I'm here" })).toHaveCount(0);

  const owner = await browser.newContext({ storageState: AUTH.owner, baseURL: testInfo.project.use.baseURL });
  const order = (await (await owner.request.get("/api/staff/orders")).json()).orders.find((o: { customerName: string }) => o.customerName === name);
  expect(order).toBeTruthy();
  expect((await owner.request.post(`/api/staff/orders/${order.id}/accept`, { data: { prepMinutes: 10 } })).status()).toBe(200);

  // the guest's page notices by itself (it polls) and offers the button
  const here = page.getByRole("button", { name: "I'm here" });
  await expect(here).toBeVisible({ timeout: 30_000 });
  await expectNoSidewaysScroll(page);
  await page.getByLabel(/Where will they find you/).fill("Blue car, space 4");
  await here.click();
  await expect(page.getByText("The restaurant knows you're here.")).toBeVisible();
  await expect(page.getByText("Blue car, space 4")).toBeVisible();
  await expect(here).toHaveCount(0);

  // the kitchen's ticket shows the arrival and the note
  const kitchen = await owner.newPage();
  await kitchen.goto("/kitchen");
  const ticket = kitchen.getByRole("article", { name: new RegExp(`Order ${order.number} `) });
  await expect(ticket.getByText("Guest is here")).toBeVisible();
  await expect(ticket.getByText("“Blue car, space 4”")).toBeVisible();
  await expectNoSidewaysScroll(kitchen);

  // once picked up, the guest's page no longer asks
  expect((await owner.request.post(`/api/staff/orders/${order.id}/ready`)).status()).toBe(200);
  expect((await owner.request.post(`/api/staff/orders/${order.id}/complete`)).status()).toBe(200);
  await expect(page.getByText("Picked up").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Here for your order?")).toHaveCount(0);
  await owner.close();
  expect(problems.list()).toEqual([]);
});

test("the arrival call is refused for a made-up link", async ({ request }) => {
  const res = await request.post(`/api/orders/${"A".repeat(43)}/arrived`, { data: { note: "x" } });
  expect(res.status()).toBe(404);
});
