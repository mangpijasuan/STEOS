import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE, consumeLoginToken, requestLogin } from "../lib/auth";
import { pool, withTenant } from "../lib/db";
import { outbox } from "../lib/mailer";
import { applyPaymentEvent, expireStaleOrders } from "../lib/orders";
import { buildReport } from "../lib/reports";
import { POST as checkout } from "../app/api/r/[slug]/checkout/route";
import { POST as decline } from "../app/api/staff/orders/[id]/decline/route";
import { POST as accept } from "../app/api/staff/orders/[id]/accept/route";
import { POST as posOrder } from "../app/api/staff/pos/orders/route";
import { POST as createPromo } from "../app/api/staff/promos/route";
import { PUT as putHours } from "../app/api/staff/hours/route";
import { asOwner, createFixture, deleteFixture, type Fixture } from "./helpers";

let a: Fixture;
let b: Fixture;
let ownerToken: string;
let staffToken: string;
let slug: string;

async function signIn(email: string) {
  outbox.length = 0;
  await requestLogin(email);
  return (await consumeLoginToken(new URL(outbox[0].url).searchParams.get("token")!))!.sessionToken;
}
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
const staffReq = (method: string, token: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/x", { method, headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}`, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const slugCtx = () => ({ params: Promise.resolve({ slug }) });
const items = (qty = 2) => [{ itemId: a.itemId, quantity: qty, optionIds: [] }];

async function cardOrder(promoCode: string | undefined, key = crypto.randomUUID()) {
  const res = await checkout(
    new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key, "x-forwarded-for": ip() },
      body: JSON.stringify({ items: items(), customer: { name: "Mai", phone: "918-555-0100" }, ...(promoCode ? { promoCode } : {}) }),
    }),
    slugCtx(),
  );
  const body = await res.json();
  const id = res.status === 201 ? ((await asOwner((c) => c.query("select id from orders where restaurant_id = $1 and number = $2", [a.restaurantId, body.order.number]))).rows[0].id as string) : null;
  return { res, body, id };
}
const uses = async (code: string) => (await asOwner((c) => c.query("select uses from promo_codes where restaurant_id = $1 and code = $2", [a.restaurantId, code]))).rows[0].uses as number;
const status = async (id: string) => (await asOwner((c) => c.query("select status from orders where id = $1", [id]))).rows[0].status as string;
async function event(id: string, type: "authorized" | "failed" | "captured") {
  const pay = (await asOwner((c) => c.query("select provider_payment_id from payments where order_id = $1", [id]))).rows[0];
  return applyPaymentEvent({ eventId: `evt-${crypto.randomUUID()}`, type, providerPaymentId: pay.provider_payment_id, restaurantId: a.restaurantId, orderId: id, account: null, retryable: false });
}
async function newCode(code: string, maxUses: number | null) {
  const res = await createPromo(staffReq("POST", ownerToken, { code, kind: "percent", value: 10, maxUses }), {});
  expect(res.status).toBe(201);
}

beforeAll(async () => {
  a = await createFixture("promolife-a");
  b = await createFixture("promolife-b");
  slug = (await asOwner((c) => c.query("select slug from restaurants where id = $1", [a.restaurantId]))).rows[0].slug;
  await asOwner((c) => c.query("update restaurants set tax_rate_bps = 1000 where id = $1", [a.restaurantId]));
  ownerToken = await signIn(a.ownerEmail);
  staffToken = await signIn(a.staffEmail);
  const periods = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: "00:00", closes: "23:45" }));
  expect((await putHours(staffReq("PUT", ownerToken, { periods }), {})).status).toBe(200);
});
afterAll(async () => {
  await deleteFixture(a);
  await deleteFixture(b);
  await pool.end();
});

describe("a limited code is not used up by orders that never complete", () => {
  it("is given back when the kitchen declines, so the code can be used again", async () => {
    await newCode("ONCE1", 1);
    const first = await cardOrder("ONCE1");
    expect(first.res.status).toBe(201);
    expect(await uses("ONCE1")).toBe(1);
    expect((await cardOrder("ONCE1")).res.status).toBe(422); // the only use is held by the first order
    await event(first.id!, "authorized");
    expect((await decline(staffReq("POST", staffToken, {}), idCtx(first.id!))).status).toBe(200);
    expect(await status(first.id!)).toBe("declined");
    expect(await uses("ONCE1")).toBe(0);
    expect((await cardOrder("ONCE1")).res.status).toBe(201);
  });

  it("is given back when a payment fails, and taken again if that payment is captured after all", async () => {
    await newCode("FAIL1", 5);
    const order = await cardOrder("FAIL1");
    expect(await uses("FAIL1")).toBe(1);
    await event(order.id!, "failed");
    expect(await status(order.id!)).toBe("payment_failed");
    expect(await uses("FAIL1")).toBe(0);
    await event(order.id!, "captured");
    expect(await status(order.id!)).toBe("accepted");
    expect(await uses("FAIL1")).toBe(1);
  });

  it("is given back when an order expires", async () => {
    await newCode("LAPSE1", 5);
    const order = await cardOrder("LAPSE1");
    await event(order.id!, "authorized");
    await asOwner((c) => c.query("update orders set accept_deadline = now() - interval '1 minute' where id = $1", [order.id]));
    await expireStaleOrders();
    expect(await status(order.id!)).toBe("expired");
    expect(await uses("LAPSE1")).toBe(0);
  });

  it("is kept for an order the kitchen accepts", async () => {
    await newCode("KEEP1", 5);
    const order = await cardOrder("KEEP1");
    await event(order.id!, "authorized");
    expect((await accept(staffReq("POST", staffToken, {}), idCtx(order.id!))).status).toBe(200);
    expect(await uses("KEEP1")).toBe(1);
  });
});

describe("a code is followed by identity, not by its text", () => {
  it("returns the use to the same promotion after its code is renamed", async () => {
    await newCode("NAME1", 5);
    const order = await cardOrder("NAME1");
    await event(order.id!, "authorized");
    await asOwner((c) => c.query("update promo_codes set code = 'NAME2' where restaurant_id = $1 and code = 'NAME1'", [a.restaurantId]));
    expect(await uses("NAME2")).toBe(1);
    expect((await decline(staffReq("POST", staffToken, {}), idCtx(order.id!))).status).toBe(200);
    expect(await uses("NAME2")).toBe(0);
    // The receipt still shows the code as it was when the order was placed.
    expect((await asOwner((c) => c.query("select promo_code from orders where id = $1", [order.id]))).rows[0].promo_code).toBe("NAME1");
  });

  it("does not touch a new code that reuses the text of a deleted one", async () => {
    await newCode("GONE1", 5);
    const old = await cardOrder("GONE1");
    await event(old.id!, "authorized");
    await asOwner((c) => c.query("delete from promo_codes where restaurant_id = $1 and code = 'GONE1'", [a.restaurantId]));
    expect((await asOwner((c) => c.query("select promo_id, promo_code from orders where id = $1", [old.id]))).rows[0]).toEqual({ promo_id: null, promo_code: "GONE1" });
    await newCode("GONE1", 5);
    expect((await cardOrder("GONE1")).res.status).toBe(201);
    expect(await uses("GONE1")).toBe(1);
    expect((await decline(staffReq("POST", staffToken, {}), idCtx(old.id!))).status).toBe(200);
    expect(await uses("GONE1")).toBe(1); // the new code's use was not given back for the old order
  });
});

describe("retrying a till order that used a code", () => {
  it("replays the order even after the last use was taken and the menu changed", async () => {
    await newCode("TILLR1", 1);
    const key = crypto.randomUUID();
    const body = { items: items(1), orderType: "counter", tipCents: 0, promoCode: "TILLR1", payment: { mode: "later" } };
    const send = () => posOrder(staffReq("POST", staffToken, body, { "idempotency-key": key }), {});
    const first = await send();
    expect(first.status).toBeLessThan(300);
    const firstBody = await first.json();
    expect(await uses("TILLR1")).toBe(1); // that was the only use
    await asOwner((c) => c.query("update menu_items set price_cents = price_cents + 500 where restaurant_id = $1", [a.restaurantId]));
    const retry = await send();
    await asOwner((c) => c.query("update menu_items set price_cents = price_cents - 500 where restaurant_id = $1", [a.restaurantId]));
    expect(retry.status).toBeLessThan(300);
    expect(await retry.json()).toMatchObject({ id: firstBody.id, number: firstBody.number, totalCents: firstBody.totalCents });
    expect(await uses("TILLR1")).toBe(1);
    // A different request under the same key is still refused.
    expect((await posOrder(staffReq("POST", staffToken, { ...body, tipCents: 100 }, { "idempotency-key": key }), {})).status).toBe(409);
  });
});

describe("retrying a checkout that used a code", () => {
  it("replays the same order without using the code twice, and refuses a changed request under the same key", async () => {
    await newCode("RETRY1", null);
    const key = crypto.randomUUID();
    const first = await cardOrder("RETRY1", key);
    const replay = await cardOrder("retry1", key); // case does not matter
    expect(replay.res.status).toBe(201);
    expect(replay.body.order.number).toBe(first.body.order.number);
    expect(await uses("RETRY1")).toBe(1);
    expect((await cardOrder(undefined, key)).res.status).toBe(409);
  });

  it("keeps matching orders placed without a code, so retries of older orders still work", async () => {
    const key = crypto.randomUUID();
    const first = await cardOrder(undefined, key);
    const replay = await cardOrder(undefined, key);
    expect(replay.body.order.number).toBe(first.body.order.number);
  });
});

describe("orders entered at the till", () => {
  const pos = (body: Record<string, unknown>, key = crypto.randomUUID(), token = ownerToken) =>
    posOrder(staffReq("POST", token, body, { "idempotency-key": key }), {}).then(async (res) => ({ res, body: await res.json() }));

  it("replays the same request, and refuses the same key with anything different, even at the same total", async () => {
    await newCode("TILL1", 5);
    const key = crypto.randomUUID();
    const base = { items: items(1), orderType: "counter", promoCode: "TILL1", customerName: "Sam", payment: { mode: "later" } };
    const first = await pos(base, key);
    expect(first.res.status).toBe(201);
    const replay = await pos(base, key);
    expect(replay.body.id).toBe(first.body.id);
    expect(await uses("TILL1")).toBe(1);
    // Same food, same total, different customer: not a retry.
    expect((await pos({ ...base, customerName: "Someone else" }, key)).res.status).toBe(409);
    // A different staff member cannot replay another's key either.
    expect((await pos(base, key, staffToken)).res.status).toBe(409);
  });

  it("records who entered the order, and the database refuses anyone from another restaurant", async () => {
    const made = await pos({ items: items(1), orderType: "counter", payment: { mode: "later" } });
    const created = (await asOwner((c) => c.query("select created_by from orders where id = $1", [made.body.id]))).rows[0].created_by;
    expect(created).not.toBeNull();
    const theirs = (await asOwner((c) => c.query("select id from staff_users where restaurant_id = $1 limit 1", [b.restaurantId]))).rows[0].id;
    await expect(asOwner((c) => c.query("update orders set created_by = $1 where id = $2", [theirs, made.body.id]))).rejects.toMatchObject({ code: "23503" });
  });

  it("is never picked up by the order expiry sweep, however long it waits", async () => {
    const made = await pos({ items: items(1), orderType: "counter", payment: { mode: "later" } });
    await asOwner((c) => c.query("update orders set created_at = now() - interval '3 hours' where id = $1", [made.body.id]));
    await expireStaleOrders();
    expect(await status(made.body.id)).toBe("awaiting_acceptance");
  });

  it("keeps the fee on the full price, and never above what is charged, even with a code that takes everything", async () => {
    await asOwner((c) => c.query("update restaurants set fee_model = 'platform_plus_processing', platform_fee_bps = 300 where id = $1", [a.restaurantId]));
    const res = await createPromo(staffReq("POST", ownerToken, { code: "FULL100", kind: "percent", value: 100 }), {});
    expect(res.status).toBe(201);
    const free = await pos({ items: items(2), orderType: "counter", promoCode: "FULL100", payment: { mode: "later" } });
    const row = (await asOwner((c) => c.query("select subtotal_cents, discount_cents, total_cents, fee_cents from orders where id = $1", [free.body.id]))).rows[0];
    expect(row).toMatchObject({ subtotal_cents: 2000, discount_cents: 2000, total_cents: 0 });
    expect(row.fee_cents).toBeLessThanOrEqual(row.total_cents);
    // A partial discount leaves the fee where it would be without it: 3% of 2000.
    await newCode("PART10", null);
    const half = await pos({ items: items(2), orderType: "counter", promoCode: "PART10", payment: { mode: "later" } });
    expect((await asOwner((c) => c.query("select fee_cents from orders where id = $1", [half.body.id]))).rows[0].fee_cents).toBe(60);
  });

  it("reports discounts, and net sales are after them", async () => {
    await newCode("REPORT1", null);
    const made = await pos({ items: items(2), orderType: "counter", promoCode: "REPORT1", payment: { mode: "now", method: "cash" } });
    expect(made.res.status).toBe(201);
    const report = await withTenant(a.restaurantId, (db) => buildReport(db, new Date(Date.now() - 3_600_000), new Date(Date.now() + 3_600_000)));
    expect(report.discountCents).toBeGreaterThanOrEqual(200);
    expect(report.netSalesCents).toBe(report.subtotalCents - report.discountCents);
    expect(report.byMethod.cash.orders).toBeGreaterThanOrEqual(1);
  });
});
