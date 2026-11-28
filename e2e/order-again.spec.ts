import { expect, test, type Page } from "@playwright/test";
import { AUTH, expectNoSidewaysScroll, watchProblems } from "./helpers";

async function toCheckout(page: Page) {
  const bar = page.locator(".cart-bar button");
  if (await bar.isVisible().catch(() => false)) await bar.click();
  await page.getByRole("button", { name: /Checkout|Continue/i }).first().click();
}

// A returning guest gets their last order back with one tap, and only what is still on the menu.
test("after ordering, the guest is offered the same order again, minus anything that has sold out", async ({ page, request }, testInfo) => {
  const problems = watchProblems(page);
  await page.goto("/r/e2e-kitchen");
  await expect(page.getByRole("region", { name: "Order again" }), "nothing is offered before a first order").toHaveCount(0);

  // order a dish with a required choice, and a drink, and pay with the test card
  await page.getByRole("button", { name: /Noodle bowl/ }).first().click();
  const sheet = page.getByRole("dialog");
  await sheet.locator('input[type="radio"]').first().check({ force: true });
  await sheet.getByRole("button", { name: /Add to order/ }).click();
  await expect(sheet).toBeHidden();
  await page.getByRole("button", { name: /Iced tea/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Add to order/ }).click();
  await toCheckout(page);
  await page.getByLabel(/^Name/).fill(`Again ${testInfo.project.name} ${Date.now() % 100000}`);
  await page.getByLabel(/^Phone/).fill("918-555-0142");
  await page.getByRole("button", { name: /Continue to payment/ }).click();
  await page.getByRole("button", { name: /Simulate a successful card/ }).click();
  await page.waitForURL(/\/order\//);

  // back on the storefront (the cart was cleared by the order)
  await page.goto("/r/e2e-kitchen");
  const card = page.getByRole("region", { name: "Order again" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("1 × Noodle bowl");
  await expect(card).toContainText("1 × Iced tea");
  await expect(card.getByText(/\$/), "no price is worked out in the browser").toHaveCount(0);
  await expectNoSidewaysScroll(page);

  // one tap puts both dishes in the cart, with the same choice, and the server prices them
  await card.getByRole("button", { name: "Add to my order" }).click();
  await expect(card).toBeHidden();
  const bar = page.locator(".cart-bar button");
  if (await bar.isVisible().catch(() => false)) await bar.click();
  await expect(page.locator("aside, [role=dialog]").getByText("Noodle bowl").first()).toBeVisible();
  await expect(page.getByText("Iced tea").first()).toBeVisible();

  expect(problems.list()).toEqual([]);
});

// What is offered follows today's menu: a dish that has sold out since is left out and named.
test("a dish that sold out since the last order is left out and named", async ({ page, browser }, testInfo) => {
  const menu = await (await page.request.get("/api/r/e2e-kitchen/menu")).json();
  const dishes = menu.categories.flatMap((c: { items: { id: string; name: string }[] }) => c.items) as { id: string; name: string }[];
  const rice = dishes.find((d) => d.name === "Chicken rice bowl")!;
  const tea = dishes.find((d) => d.name === "Iced tea")!;
  const saved = { v: 1, savedAt: Date.now(), lines: [
    { itemId: rice.id, name: rice.name, quantity: 2, optionIds: [], note: "" },
    { itemId: tea.id, name: tea.name, quantity: 1, optionIds: [], note: "" },
  ] };
  await page.addInitScript((value) => localStorage.setItem("steos:last-order:e2e-kitchen", value), JSON.stringify(saved));

  const owner = await browser.newContext({ storageState: AUTH.owner, baseURL: testInfo.project.use.baseURL });
  const setAvailable = (id: string, available: boolean) => owner.request.patch(`/api/staff/menu/items/${id}/availability`, { data: { available } });
  try {
    expect((await setAvailable(tea.id, false)).ok()).toBe(true);
    await page.goto("/r/e2e-kitchen");
    const card = page.getByRole("region", { name: "Order again" });
    await expect(card).toContainText("2 × Chicken rice bowl");
    await expect(card).not.toContainText("Iced tea ·");
    await expect(card).toContainText("Not available right now: Iced tea");
    await expectNoSidewaysScroll(page);
    await card.getByRole("button", { name: "Add to my order" }).click();
    await expect(page.getByText(/Added your last order/).first()).toBeVisible();

    // a card whose every dish is gone is not offered at all
    expect((await setAvailable(rice.id, false)).ok()).toBe(true);
    await page.goto("/r/e2e-kitchen");
    await expect(page.getByRole("region", { name: "Order again" })).toHaveCount(0);
  } finally {
    await setAvailable(tea.id, true);
    await setAvailable(rice.id, true);
    await owner.close();
  }
});

test("'Not now' hides the offer for this visit, and a corrupt saved order is ignored", async ({ page }) => {
  const menu = await (await page.request.get("/api/r/e2e-kitchen/menu")).json();
  const rice = (menu.categories.flatMap((c: { items: { id: string; name: string }[] }) => c.items) as { id: string; name: string }[]).find((d) => d.name === "Chicken rice bowl")!;
  await page.addInitScript((value) => localStorage.setItem("steos:last-order:e2e-kitchen", value), JSON.stringify({ v: 1, savedAt: Date.now(), lines: [{ itemId: rice.id, name: rice.name, quantity: 1, optionIds: [], note: "" }] }));
  await page.goto("/r/e2e-kitchen");
  const card = page.getByRole("region", { name: "Order again" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Not now" }).click();
  await expect(card).toBeHidden();

  const fresh = await page.context().newPage();
  await fresh.addInitScript(() => localStorage.setItem("steos:last-order:e2e-kitchen", "{not json"));
  await fresh.goto("/r/e2e-kitchen");
  await expect(fresh.getByRole("button", { name: /Noodle bowl/ }).first()).toBeVisible();
  await expect(fresh.getByRole("region", { name: "Order again" })).toHaveCount(0);
});
