import { expect, test } from "@playwright/test";
import { AUTH } from "./helpers";

const base = "http://localhost:3200";

test("owner-only data is closed to staff and to signed-out visitors", async ({ playwright }) => {
  const owner = await playwright.request.newContext({ baseURL: base, storageState: AUTH.owner });
  const staff = await playwright.request.newContext({ baseURL: base, storageState: AUTH.staff });
  const anon = await playwright.request.newContext({ baseURL: base });

  for (const path of ["/api/staff/reports/summary", "/api/staff/promos"]) {
    expect((await owner.get(path)).status(), `owner ${path}`).toBe(200);
    expect((await staff.get(path)).status(), `staff ${path}`).toBe(403);
    expect((await anon.get(path)).status(), `signed-out ${path}`).toBe(401);
  }
  // Staff can read what they need to run the kitchen.
  expect((await staff.get("/api/staff/orders")).status()).toBe(200);
  expect((await anon.get("/api/staff/orders")).status()).toBe(401);
  expect((await anon.get("/api/staff/me")).status()).toBe(401);
  await Promise.all([owner.dispose(), staff.dispose(), anon.dispose()]);
});

test("one restaurant's owner cannot see or touch another restaurant's order", async ({ playwright, request }) => {
  const kitchen = await playwright.request.newContext({ baseURL: base, storageState: AUTH.owner });
  const other = await playwright.request.newContext({ baseURL: base, storageState: AUTH.otherOwner });
  expect(JSON.stringify(await (await other.get("/api/staff/me")).json())).toMatch(/Zogam/);

  // An order at E2E Kitchen, placed the way the storefront places it.
  const menu = await (await request.get("/api/r/e2e-kitchen/menu")).json();
  const dish = menu.categories.flatMap((c: { items: { id: string; name: string }[] }) => c.items).find((i: { name: string }) => i.name === "Chicken rice bowl");
  const placed = await request.post("/api/r/e2e-kitchen/checkout", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: { items: [{ itemId: dish.id, quantity: 1, optionIds: [] }], customer: { name: "Tenant Check", phone: "918-555-0111" } },
  });
  expect(placed.status()).toBe(201);
  // Authorize the card with the fake provider so the order reaches the kitchen.
  const { orderToken } = await placed.json();
  expect((await request.post("/api/dev/pay", { data: { orderToken, outcome: "authorized" } })).status()).toBe(200);
  const mine = (await (await kitchen.get("/api/staff/orders")).json()).orders.find((o: { customerName: string }) => o.customerName === "Tenant Check");
  expect(mine, "the owner of E2E Kitchen sees their order").toBeTruthy();

  const theirs = (await (await other.get("/api/staff/orders")).json()).orders;
  expect(theirs.filter((o: { customerName: string }) => o.customerName === "Tenant Check")).toEqual([]);
  // Touching it by id from the wrong restaurant finds nothing.
  expect((await other.post(`/api/staff/orders/${mine.id}/accept`, { data: { prepMinutes: 10 } })).status()).toBe(404);
  await Promise.all([kitchen.dispose(), other.dispose()]);
});
