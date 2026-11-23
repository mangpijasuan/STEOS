import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE, consumeLoginToken, requestLogin } from "../lib/auth";
import { pool } from "../lib/db";
import { outbox } from "../lib/mailer";
import { POST as posQuote } from "../app/api/staff/pos/quote/route";
import { POST as posOrder } from "../app/api/staff/pos/orders/route";
import { GET as orderDetail } from "../app/api/staff/orders/[id]/route";
import { POST as accept } from "../app/api/staff/orders/[id]/accept/route";
import { POST as decline } from "../app/api/staff/orders/[id]/decline/route";
import { POST as payOrder } from "../app/api/staff/orders/[id]/pay/route";
import { POST as createPromo } from "../app/api/staff/promos/route";
import { POST as addTables, GET as board } from "../app/api/staff/tables/route";
import { asOwner, createFixture, deleteFixture, type Fixture } from "./helpers";

let a: Fixture;
let b: Fixture;
let ownerToken: string;
let staffToken: string;
let otherOwner: string;
let tableId: string;
let theirTableId: string;

async function signIn(email: string) {
  outbox.length = 0;
  await requestLogin(email);
  return (await consumeLoginToken(new URL(outbox[0].url).searchParams.get("token")!))!.sessionToken;
}
const req = (method: string, token: string | null, body?: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/x", { method, headers: { "content-type": "application/json", ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}), ...headers } as Record<string, string>, body: body === undefined ? undefined : JSON.stringify(body) });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const key = () => ({ "idempotency-key": crypto.randomUUID() });
const lines = (qty = 1) => [{ itemId: a.itemId, quantity: qty, optionIds: [] }];

const place = async (token: string, body: Record<string, unknown>, headers = key()) => {
  const res = await posOrder(req("POST", token, body, headers), {});
  return { res, body: await res.json() };
};
const row = async (id: string) => (await asOwner((c) => c.query("select * from orders where id = $1", [id]))).rows[0];

beforeAll(async () => {
  a = await createFixture("pos-a");
  b = await createFixture("pos-b");
  await asOwner((c) => c.query("update restaurants set tax_rate_bps = 1000, fee_model = 'platform_plus_processing', platform_fee_bps = 300 where id = $1", [a.restaurantId]));
  ownerToken = await signIn(a.ownerEmail);
  staffToken = await signIn(a.staffEmail);
  otherOwner = await signIn(b.ownerEmail);
  await addTables(req("POST", ownerToken, { labels: ["12"] }), {});
  tableId = (await (await board(req("GET", ownerToken), {})).json()).tables[0].id;
  await addTables(req("POST", otherOwner, { labels: ["99"] }), {});
  theirTableId = (await (await board(req("GET", otherOwner), {})).json()).tables[0].id;
});
afterAll(async () => {
  await deleteFixture(a);
  await deleteFixture(b);
  await pool.end();
});

describe("ringing up an order for a table", () => {
  it("sends it to the kitchen, unpaid, with the staff member recorded", async () => {
    const { res, body } = await place(staffToken, { items: lines(2), orderType: "dine_in", tableId, tipCents: 0, payment: { mode: "later" } });
    expect(res.status).toBe(201);
    expect(body).toMatchObject({ totalCents: 2200, paid: false });
    const o = await row(body.id);
    expect(o).toMatchObject({ status: "awaiting_acceptance", order_type: "dine_in", table_id: tableId, payment_mode: "pay_later", fee_collection: "invoice", customer_name: "Table 12", paid_at: null });
    expect(o.created_by).not.toBeNull();
    expect(o.accept_deadline).toBeNull();
  });

  it("needs a table for dine-in, and only this restaurant's tables", async () => {
    expect((await place(staffToken, { items: lines(), orderType: "dine_in", tipCents: 0 })).res.status).toBe(422);
    expect((await place(staffToken, { items: lines(), orderType: "dine_in", tableId: theirTableId, tipCents: 0 })).res.status).toBe(404);
    await asOwner((c) => c.query("update dining_tables set active = false where id = $1", [tableId]));
    expect((await place(staffToken, { items: lines(), orderType: "dine_in", tableId, tipCents: 0 })).res.status).toBe(404);
    await asOwner((c) => c.query("update dining_tables set active = true where id = $1", [tableId]));
  });

  it("is safe to tap twice", async () => {
    const headers = key();
    const first = await place(staffToken, { items: lines(), orderType: "counter", tipCents: 0 }, headers);
    const second = await place(staffToken, { items: lines(), orderType: "counter", tipCents: 0 }, headers);
    expect(second.body.id).toBe(first.body.id);
    expect((await asOwner((c) => c.query("select count(*)::int as n from orders where restaurant_id = $1 and customer_name = 'Walk-in'", [a.restaurantId]))).rows[0].n).toBe(1);
    const third = await place(staffToken, { items: lines(3), orderType: "counter", tipCents: 0 }, headers);
    expect(third.res.status).toBe(409);
  });

  it("requires a signed-in staff member and an idempotency key", async () => {
    expect((await place("", { items: lines(), orderType: "counter", tipCents: 0 })).res.status).toBe(401);
    expect((await posOrder(req("POST", staffToken, { items: lines(), orderType: "counter", tipCents: 0 }), {})).status).toBe(400);
  });
});

describe("taking payment at the till", () => {
  it("records cash at once, so the order is paid before the kitchen sees it", async () => {
    const { body } = await place(staffToken, { items: lines(), orderType: "counter", tipCents: 100, payment: { mode: "now", method: "cash" } });
    expect(body.paid).toBe(true);
    const o = await row(body.id);
    expect(o.paid_at).not.toBeNull();
    const pay = (await asOwner((c) => c.query("select provider, method, status, amount_cents from payments where order_id = $1", [body.id]))).rows[0];
    expect(pay).toMatchObject({ provider: "manual", method: "cash", status: "captured", amount_cents: 1200 });
  });

  it("will not decline an order already paid in person until staff confirm the money was handed back", async () => {
    const { body } = await place(staffToken, { items: lines(), orderType: "counter", tipCents: 0, payment: { mode: "now", method: "cash" } });
    const state = async () => (await asOwner((c) => c.query("select o.status as order_status, p.status as payment_status, p.refunded_at from orders o join payments p on p.order_id = o.id where o.id = $1", [body.id]))).rows[0];
    const confirmation = { inPersonRefundReturned: true };

    // Without the confirmation nothing changes, and nothing is recorded as refunded.
    const unconfirmed = await decline(req("POST", staffToken), idCtx(body.id));
    expect(unconfirmed.status).toBe(409);
    expect((await unconfirmed.json()).error).toMatch(/confirm the refund/);
    expect(await state()).toEqual({ order_status: "awaiting_acceptance", payment_status: "captured", refunded_at: null });
    // Another restaurant cannot do it.
    expect((await decline(req("POST", otherOwner, confirmation), idCtx(body.id))).status).toBe(404);
    expect((await state()).payment_status).toBe("captured");

    const res = await decline(req("POST", staffToken, confirmation), idCtx(body.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "declined", refundInPerson: true });
    const recorded = await state();
    expect(recorded).toEqual({ order_status: "declined", payment_status: "refunded", refunded_at: expect.any(Date) });
    // A repeat of the confirmation (a lost response) is answered and changes nothing.
    expect((await decline(req("POST", staffToken, confirmation), idCtx(body.id))).status).toBe(200);
    expect(await state()).toEqual(recorded);
  });

  it("declines an order nobody has paid for without any confirmation", async () => {
    const { body } = await place(staffToken, { items: lines(), orderType: "counter", tipCents: 0, payment: { mode: "later" } });
    const res = await decline(req("POST", staffToken), idCtx(body.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "declined", refundInPerson: false });
    expect((await asOwner((c) => c.query("select count(*)::int as n from payments where order_id = $1", [body.id]))).rows[0].n).toBe(0);
  });

  it("lets a later order be accepted, then paid", async () => {
    const { body } = await place(staffToken, { items: lines(), orderType: "dine_in", tableId, tipCents: 0 });
    expect((await payOrder(req("POST", staffToken, { method: "cash" }), idCtx(body.id))).status).toBe(409); // kitchen has not accepted yet
    expect((await accept(req("POST", staffToken, {}), idCtx(body.id))).status).toBe(200);
    expect((await payOrder(req("POST", staffToken, { method: "card_terminal" }), idCtx(body.id))).status).toBe(200);
  });
});

describe("discounts", () => {
  it("lets only the owner type in a discount, and takes it off before tax", async () => {
    const asStaff = await posQuote(req("POST", staffToken, { items: lines(2), orderType: "counter", tipCents: 0, discount: { kind: "percent", value: 10 } }), {});
    expect(asStaff.status).toBe(403);
    const asOwner_ = await posQuote(req("POST", ownerToken, { items: lines(2), orderType: "counter", tipCents: 0, discount: { kind: "percent", value: 10 } }), {});
    expect(await asOwner_.json()).toMatchObject({ subtotalCents: 2000, discountCents: 200, discountLabel: "Discount 10%", taxCents: 180, totalCents: 1980 });
  });

  it("applies a promo code for staff, counts its use, and shows a wrong code without breaking", async () => {
    await createPromo(req("POST", ownerToken, { code: "STAFF5", kind: "fixed", value: 500 }), {});
    const q = await (await posQuote(req("POST", staffToken, { items: lines(2), orderType: "counter", tipCents: 0, promoCode: "staff5" }), {})).json();
    expect(q).toMatchObject({ discountCents: 500, discountLabel: "Promo STAFF5", taxCents: 150, totalCents: 1650, promoError: null });
    const bad = await (await posQuote(req("POST", staffToken, { items: lines(2), orderType: "counter", tipCents: 0, promoCode: "NOPE" }), {})).json();
    expect(bad).toMatchObject({ discountCents: 0, totalCents: 2200, promoError: expect.stringMatching(/isn't valid/) });
    const { body } = await place(staffToken, { items: lines(2), orderType: "counter", tipCents: 0, promoCode: "STAFF5" });
    expect(await row(body.id)).toMatchObject({ discount_cents: 500, promo_code: "STAFF5", total_cents: 1650 });
    expect((await asOwner((c) => c.query("select uses from promo_codes where code = 'STAFF5'"))).rows[0].uses).toBe(1);
  });

  it("refuses a code and a typed discount together", async () => {
    const res = await posQuote(req("POST", ownerToken, { items: lines(), orderType: "counter", tipCents: 0, promoCode: "STAFF5", discount: { kind: "fixed", value: 100 } }), {});
    expect(res.status).toBe(422);
  });
});

describe("receipts", () => {
  it("returns everything a receipt shows, and nothing from another restaurant", async () => {
    await asOwner((c) => c.query("update locations set address_line1 = '1 Main St', city = 'Tulsa', state = 'OK', postal_code = '74101', phone = '918-555-0000' where restaurant_id = $1 and is_default", [a.restaurantId]));
    const { body } = await place(staffToken, { items: lines(2), orderType: "dine_in", tableId, tipCents: 0, promoCode: "STAFF5", payment: { mode: "now", method: "cash" } });
    const res = await orderDetail(req("GET", staffToken), idCtx(body.id));
    expect(await res.json()).toMatchObject({
      restaurant: { name: "Test pos-a", address: ["1 Main St", "Tulsa OK 74101"], phone: "918-555-0000" },
      orderType: "dine_in",
      tableLabel: "12",
      paid: true,
      paymentMethod: "cash",
      subtotalCents: 2000,
      discountCents: 500,
      discountLabel: "Promo STAFF5",
      taxCents: 150,
      totalCents: 1650,
      items: [{ name: "Test dish", quantity: 2, lineTotalCents: 2000 }],
    });
    expect((await orderDetail(req("GET", otherOwner), idCtx(body.id))).status).toBe(404);
    expect((await orderDetail(req("GET", null), idCtx(body.id))).status).toBe(401);
  });
});
