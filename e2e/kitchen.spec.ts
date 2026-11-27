import { expect, test, type Locator } from "@playwright/test";
import { AUTH, expectNoSidewaysScroll, watchProblems } from "./helpers";

test.use({ storageState: AUTH.owner });

const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();
const order = (o: Record<string, unknown>) => ({ customerPhone: "(918) 555-0142", tipCents: 0, prepMinutes: null, acceptDeadline: null, paidAt: null, paymentMode: "online", tableLabel: null, ...o });
const ORDERS = [
  order({ id: "a1", number: 41, status: "awaiting_acceptance", customerName: "Maria Lopez", pickupAt: minutes(18), totalCents: 3245, acceptDeadline: minutes(3.6), createdAt: minutes(-1.4), orderType: "pickup", items: [{ name: "Pad Thai", quantity: 2, options: [{ name: "Chicken" }, { name: "Medium spicy" }], note: "No peanuts, allergy" }] }),
  order({ id: "a2", number: 42, status: "awaiting_acceptance", customerName: "Table 6", tableLabel: "6", pickupAt: minutes(0), totalCents: 2890, paymentMode: "pay_later", createdAt: minutes(-4), orderType: "dine_in", items: [{ name: "Green Curry", quantity: 1, options: [], note: null }] }),
  order({ id: "b1", number: 36, status: "accepted", customerName: "Priya Shah", pickupAt: minutes(-3), totalCents: 4120, prepMinutes: 15, createdAt: minutes(-20), orderType: "pickup", items: [{ name: "Panang Curry", quantity: 1, options: [], note: null }] }),
  order({ id: "c1", number: 35, status: "ready", customerName: "Dan Kim", pickupAt: minutes(-6), totalCents: 1790, prepMinutes: 10, createdAt: minutes(-24), orderType: "pickup", items: [{ name: "Tom Yum Soup", quantity: 1, options: [], note: null }] }),
];

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const box = async (l: Locator) => (await l.boundingBox())!;

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/staff\/orders\?/, (route) => route.fulfill({ json: { orders: ORDERS, hasMore: false } }));
});

// Regression: on a phone the title was squeezed under the Live badge, the prep minutes wrapped to a second row, and on a tablet
// in landscape the Accept label was crushed. Every control must be whole, on screen and clear of its neighbours.
test("the kitchen header, tickets and buttons fit on every screen size", async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto("/kitchen");
  const ticket = page.getByRole("article", { name: /Order 41/ });
  await expect(ticket).toBeVisible();

  // The header: title, Live badge and the buttons do not overlap, and all are inside the screen.
  const width = page.viewportSize()!.width;
  const parts = [page.getByRole("heading", { name: "Kitchen", level: 1 }), page.locator(".kds-bar").getByRole("status"), page.getByRole("button", { name: /^Sound o/ })];
  const boxes = await Promise.all(parts.map(box));
  for (const [i, b] of boxes.entries()) {
    expect(b.x + b.width, `header part ${i} is inside the screen`).toBeLessThanOrEqual(width);
    for (const other of boxes.slice(i + 1)) expect(overlaps(b, other), "header parts do not overlap").toBe(false);
  }
  const title = await page.getByRole("heading", { name: "Kitchen", level: 1 }).evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(title, "the title is not cut off").toBe(true);

  // The prep minutes are one row of six.
  const chips = await Promise.all((await ticket.getByRole("group", { name: "Ready in minutes" }).getByRole("button").all()).map(box));
  expect(chips).toHaveLength(6);
  expect(Math.max(...chips.map((c) => c.y)) - Math.min(...chips.map((c) => c.y)), "the six prep choices share one row").toBeLessThan(2);
  for (const c of chips) expect(c.width, "a prep choice is big enough to tap").toBeGreaterThanOrEqual(36);

  // Accept and Decline: whole labels, inside the ticket, never on top of each other.
  const t = await box(ticket);
  const accept = ticket.getByRole("button", { name: /^Accept/ });
  const decline = ticket.getByRole("button", { name: "Decline" });
  for (const b of [accept, decline]) {
    const r = await box(b);
    expect(r.x, "button is inside the ticket").toBeGreaterThanOrEqual(t.x);
    expect(r.x + r.width, "button is inside the ticket").toBeLessThanOrEqual(t.x + t.width);
    expect(await b.evaluate((el) => el.scrollWidth <= el.clientWidth), "the label is not squeezed").toBe(true);
  }
  expect(overlaps(await box(accept), await box(decline))).toBe(false);

  // How it is paid reads at a glance.
  await expect(ticket.getByText("Card on hold")).toBeVisible();
  await expect(page.getByRole("article", { name: /Order 42/ }).getByText("Pays at the table")).toBeVisible();
  await expect(page.getByRole("article", { name: /Order 36/ }).getByText("Paid online")).toBeVisible();

  await expectNoSidewaysScroll(page);
  expect(problems.list()).toEqual([]);
});
