import { expect, test, type Page } from "@playwright/test";
import { AUTH, expectNoSidewaysScroll, watchProblems } from "./helpers";

/** Opens the cart on a phone, where it is a sheet, and goes to checkout. On a wide screen the cart is already on the page. */
async function toCheckout(page: Page) {
  const bar = page.locator(".cart-bar button");
  if (await bar.isVisible().catch(() => false)) await bar.click();
  await page.getByRole("button", { name: /Checkout|Continue/i }).first().click();
}

test("a customer orders a dish with a required choice and pays; the kitchen accepts it and the customer sees it", async ({ page, browser }, testInfo) => {
  const problems = watchProblems(page);
  const name = `E2E ${testInfo.project.name} ${Date.now() % 100000}`;
  await page.goto("/r/e2e-kitchen");
  await page.getByRole("button", { name: /Noodle bowl/ }).first().click();
  const sheet = page.getByRole("dialog");

  // The required choice is enforced in the browser: adding without choosing keeps the sheet open and says so.
  await sheet.getByRole("button", { name: /Add to order/ }).click();
  await expect(sheet.getByText("Choose one")).toBeVisible();
  await sheet.locator('input[type="radio"]').first().check({ force: true });
  await sheet.getByRole("button", { name: /Add to order/ }).click();
  await expect(sheet).toBeHidden();

  await toCheckout(page);
  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Phone/).fill("918-555-0142");
  await page.getByRole("button", { name: /Continue to payment/ }).click();
  await page.getByRole("button", { name: /Simulate a successful card/ }).click();
  await page.waitForURL(/\/order\//);
  await expectNoSidewaysScroll(page);
  await expect(page.locator("main")).toContainText(/kitchen/i);

  // The kitchen (signed in as the owner) sees the order and accepts it through the API the kitchen screen uses.
  const owner = await browser.newContext({ storageState: AUTH.owner, baseURL: testInfo.project.use.baseURL });
  const listed = await owner.request.get("/api/staff/orders");
  expect(listed.status()).toBe(200);
  const order = (await listed.json()).orders.find((o: { customerName: string }) => o.customerName === name);
  expect(order, "the new order is in the kitchen's list").toBeTruthy();
  expect(order.items[0].name).toBe("Noodle bowl");
  const accepted = await owner.request.post(`/api/staff/orders/${order.id}/accept`, { data: { prepMinutes: 10 } });
  expect(accepted.status()).toBe(200);
  await owner.close();

  // The customer's page updates by itself (it polls).
  await expect(page.locator("main")).toContainText(/accepted|being prepared|preparing/i, { timeout: 30_000 });
  expect(problems.list()).toEqual([]);
});

test("the server refuses a dish whose required choice is missing", async ({ request }) => {
  const menu = await (await request.get("/api/r/e2e-kitchen/menu")).json();
  const dish = menu.categories.flatMap((c: { items: { id: string; name: string }[] }) => c.items).find((i: { name: string }) => i.name === "Noodle bowl");
  const res = await request.post("/api/r/e2e-kitchen/checkout", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: { items: [{ itemId: dish.id, quantity: 1, optionIds: [] }], customer: { name: "No Choice", phone: "918-555-0100" } },
  });
  expect(res.status()).toBe(422);
  expect(JSON.stringify(await res.json())).toMatch(/Choose at least 1 for Protein/);
});
