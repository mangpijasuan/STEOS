import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE, consumeLoginToken, requestLogin } from "../lib/auth";
import { pool } from "../lib/db";
import { outbox } from "../lib/mailer";
import { POST as posOrder } from "../app/api/staff/pos/orders/route";
import { GET as summary } from "../app/api/staff/reports/summary/route";
import { GET as history } from "../app/api/staff/orders/history/route";
import { GET as me } from "../app/api/staff/me/route";
import { GET as activeOrders } from "../app/api/staff/orders/route";
import { chartRange, ticks } from "../app/charts";
import { asOwner, createFixture, deleteFixture, type Fixture } from "./helpers";

let a: Fixture;
let b: Fixture;
let ownerToken: string;
let staffToken: string;
let otherOwner: string;

async function signIn(email: string) {
  outbox.length = 0;
  await requestLogin(email);
  return (await consumeLoginToken(new URL(outbox[0].url).searchParams.get("token")!))!.sessionToken;
}
const req = (method: string, token: string | null, body?: unknown, url = "http://localhost/x", headers: Record<string, string> = {}) =>
  new Request(url, { method, headers: { "content-type": "application/json", ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}), ...headers } as Record<string, string>, body: body === undefined ? undefined : JSON.stringify(body) });
const sale = async (token: string, over: Record<string, unknown> = {}) => {
  const res = await posOrder(req("POST", token, { items: [{ itemId: a.itemId, quantity: 1, optionIds: [] }], orderType: "counter", tipCents: 0, payment: { mode: "now", method: "cash" }, ...over }, "http://localhost/x", { "idempotency-key": crypto.randomUUID() }), {});
  return (await res.json()) as { id: string; number: number };
};
const hist = async (token: string, qs = "") => (await history(req("GET", token, undefined, `http://localhost/x?${qs}`), {}).then((r) => r.json())) as { orders: { id: string; number: number; customerName: string; status: string; orderType: string }[]; hasMore: boolean };

beforeAll(async () => {
  a = await createFixture("dash-a");
  b = await createFixture("dash-b");
  ownerToken = await signIn(a.ownerEmail);
  staffToken = await signIn(a.staffEmail);
  otherOwner = await signIn(b.ownerEmail);
});
afterAll(async () => {
  await deleteFixture(a);
  await deleteFixture(b);
  await pool.end();
});

describe("report extras", () => {
  it("splits food sales by menu category, with items no longer on the menu under Other", async () => {
    const cat2 = (await asOwner((c) => c.query("insert into menu_categories (restaurant_id, name, sort_order) values ($1, 'Drinks', 5) returning id", [a.restaurantId]))).rows[0].id;
    await asOwner((c) => c.query("insert into menu_categories (restaurant_id, name, sort_order) values ($1, 'Desserts', 7)", [a.restaurantId]));
    const tea = (await asOwner((c) => c.query("insert into menu_items (restaurant_id, category_id, name, price_cents) values ($1, $2, 'Tea', 300) returning id", [a.restaurantId, cat2]))).rows[0].id;
    await sale(ownerToken, { items: [{ itemId: a.itemId, quantity: 2, optionIds: [] }, { itemId: tea, quantity: 1, optionIds: [] }] });
    // An order line whose item was removed entirely still counts, under "Other".
    const s = await sale(ownerToken);
    await asOwner((c) => c.query("update order_items set item_id = null where order_id = $1", [s.id]));

    const report = await (await summary(req("GET", ownerToken, undefined, "http://localhost/x?days=30"), {})).json();
    expect(report.byCategory).toEqual([
      { name: "Mains", sortOrder: 0, salesCents: 2000 },
      { name: "Drinks", sortOrder: 5, salesCents: 300 },
      { name: "Desserts", sortOrder: 7, salesCents: 0 },
      { name: "Other", sortOrder: 10001, salesCents: 1000 },
    ]);
  });

  it("compares with the period just before, only when asked", async () => {
    const plain = await (await summary(req("GET", ownerToken, undefined, "http://localhost/x?days=7"), {})).json();
    expect(plain.previous).toBeUndefined();
    const withPrev = await (await summary(req("GET", ownerToken, undefined, "http://localhost/x?days=7&compare=1"), {})).json();
    expect(withPrev.previous).toEqual({ paidOrders: 0, grossCents: 0, netChargedCents: 0, averageOrderCents: 0, netEstimateCents: 0 });
    // Move this restaurant's orders into the previous week and look again. Sales are dated by when the payment was
    // captured, so the payments move too.
    await asOwner((c) => c.query("update orders set created_at = now() - interval '9 days' where restaurant_id = $1", [a.restaurantId]));
    await asOwner((c) => c.query("update payments set captured_at = now() - interval '9 days' where restaurant_id = $1", [a.restaurantId]));
    const shifted = await (await summary(req("GET", ownerToken, undefined, "http://localhost/x?days=7&compare=1"), {})).json();
    expect(shifted.paidOrders).toBe(0);
    expect(shifted.previous.paidOrders).toBe(2);
    expect(shifted.previous.grossCents).toBeGreaterThan(0);
    expect(shifted.previous.netChargedCents).toBe(shifted.previous.grossCents);

    // A refund made in that earlier week comes off the earlier week's sales, so "up or down" compares like with like.
    const refunded = (await asOwner((c) => c.query("select order_id, o.total_cents from payments p join orders o on o.id = p.order_id where p.restaurant_id = $1 order by o.number limit 1", [a.restaurantId]))).rows[0];
    await asOwner((c) => c.query("update payments set status = 'refunded', refund_status = 'succeeded', refunded_at = now() - interval '9 days' where order_id = $1", [refunded.order_id]));
    const afterRefund = await (await summary(req("GET", ownerToken, undefined, "http://localhost/x?days=7&compare=1"), {})).json();
    expect(afterRefund.previous.grossCents).toBe(shifted.previous.grossCents);
    expect(afterRefund.previous.netChargedCents).toBe(shifted.previous.grossCents - refunded.total_cents);
    await asOwner((c) => c.query("update payments set status = 'captured', refund_status = null, refunded_at = null where order_id = $1", [refunded.order_id]));

    await asOwner((c) => c.query("update orders set created_at = now() where restaurant_id = $1", [a.restaurantId]));
    await asOwner((c) => c.query("update payments set captured_at = now() where restaurant_id = $1", [a.restaurantId]));
  });

  it("stays owner-only", async () => {
    expect((await summary(req("GET", staffToken, undefined, "http://localhost/x?days=7&compare=1"), {})).status).toBe(403);
  });
});

describe("order history", () => {
  let jo: { number: number };
  beforeAll(async () => {
    jo = await sale(staffToken, { customerName: "Jo 100% Real_Name" });
    await sale(staffToken, { orderType: "counter", payment: { mode: "later" }, customerName: "Sam" });
    await asOwner((c) => c.query("insert into orders (restaurant_id, number, status, customer_name, customer_phone, pickup_type, pickup_at, subtotal_cents, tax_cents, tip_cents, total_cents, fee_cents, fee_snapshot, idempotency_key, public_token_hash) values ($1, 9001, 'pending_payment', 'Unfinished', '', 'asap', now(), 100, 0, 0, 100, 0, '{}', 'k-unfinished', 'h-unfinished')", [a.restaurantId]));
  });

  it("lists newest first, and never shows an order still waiting on a card", async () => {
    const all = await hist(staffToken);
    expect(all.orders.length).toBeGreaterThanOrEqual(4);
    expect(all.orders.some((o) => o.customerName === "Unfinished")).toBe(false);
    const numbers = all.orders.map((o) => o.number);
    expect(numbers).toEqual([...numbers].sort((x, y) => y - x));
  });

  it("filters by status and type", async () => {
    expect((await hist(staffToken, "status=active")).orders.every((o) => ["awaiting_acceptance", "accepted", "ready"].includes(o.status))).toBe(true);
    expect((await hist(staffToken, "status=completed")).orders).toHaveLength(0);
    expect((await hist(staffToken, "type=pickup")).orders).toHaveLength(0);
    expect((await hist(staffToken, "type=counter")).orders.length).toBeGreaterThan(0);
  });

  it("finds an order by number (with or without #) or by part of a name, treating % and _ as plain text", async () => {
    expect((await hist(staffToken, `q=${encodeURIComponent("#" + jo.number)}`)).orders.map((o) => o.number)).toEqual([jo.number]);
    expect((await hist(staffToken, `q=${jo.number}`)).orders).toHaveLength(1);
    expect((await hist(staffToken, "q=sam")).orders.map((o) => o.customerName)).toEqual(["Sam"]);
    expect((await hist(staffToken, `q=${encodeURIComponent("100%")}`)).orders.map((o) => o.number)).toEqual([jo.number]);
    expect((await hist(staffToken, `q=${encodeURIComponent("%")}`)).orders.map((o) => o.number)).toEqual([jo.number]);
  });

  it("pages through results", async () => {
    const first = await hist(staffToken, "limit=2");
    expect(first.orders).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    const next = await hist(staffToken, "limit=2&offset=2");
    expect(next.orders.every((o) => !first.orders.some((f) => f.id === o.id))).toBe(true);
    expect((await history(req("GET", staffToken, undefined, "http://localhost/x?limit=500"), {})).status).toBe(400);
    expect((await history(req("GET", staffToken, undefined, "http://localhost/x?status=bogus"), {})).status).toBe(400);
  });

  it("never shows another restaurant's orders, and needs a sign-in", async () => {
    expect((await hist(otherOwner)).orders).toHaveLength(0);
    expect((await history(req("GET", null), {})).status).toBe(401);
  });
});

describe("the live counts", () => {
  it("count every active order in the restaurant, not just the page shown", async () => {
    const before = (await (await activeOrders(req("GET", ownerToken, undefined, "http://localhost/x"), {})).json()) as { counts: Record<string, number>; orders: unknown[] };
    await sale(ownerToken, { payment: { mode: "later" } });
    await sale(ownerToken, { payment: { mode: "later" } });
    const res = (await (await activeOrders(req("GET", ownerToken, undefined, "http://localhost/x"), {})).json()) as { counts: Record<string, number>; orders: unknown[] };
    expect(res.counts.awaiting_acceptance).toBe(before.counts.awaiting_acceptance + 2);
    expect(Object.keys(res.counts).sort()).toEqual(["accepted", "awaiting_acceptance", "ready"]);
    // Another restaurant's orders are never counted.
    const theirs = (await (await activeOrders(req("GET", otherOwner, undefined, "http://localhost/x"), {})).json()) as { counts: Record<string, number> };
    expect(theirs.counts.awaiting_acceptance).toBe(0);
  });
});

describe("the sales chart axis", () => {
  it("starts at zero when nothing is negative", () => {
    expect(chartRange([0, 1200, 4500])).toEqual([0, 5000]);
    expect(chartRange([0, 0])).toEqual([0, 1]);
  });
  it("reaches below zero for a day that refunded more than it sold, so it is drawn rather than hidden", () => {
    expect(chartRange([-2300, 0, 4500])).toEqual([-5000, 5000]);
    expect(chartRange([-800, -200])).toEqual([-1000, 0]);
  });
});

describe("who am I", () => {
  it("includes the restaurant's name for the navigation", async () => {
    expect(await (await me(req("GET", staffToken), {})).json()).toMatchObject({ role: "staff", restaurantName: "Test dash-a" });
  });
});

describe("dates under the sales chart", () => {
  it("shows five evenly spaced dates for a week or more, fewer for short spans, and never repeats one", () => {
    expect(ticks(0)).toEqual([]);
    expect(ticks(1)).toEqual([0]);
    expect(ticks(2)).toEqual([0, 1]);
    expect(ticks(5)).toEqual([0, 2, 4]);
    expect(ticks(7)).toEqual([0, 2, 3, 5, 6]);
    expect(ticks(30)).toEqual([0, 7, 15, 22, 29]);
    expect(ticks(90)).toEqual([0, 22, 45, 67, 89]);
    for (const n of [1, 2, 3, 4, 7, 30, 90]) {
      const t = ticks(n);
      expect(new Set(t).size).toBe(t.length);
      expect(t[0]).toBe(0);
      expect(t[t.length - 1]).toBe(n - 1);
    }
  });
});
