import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE, consumeLoginToken, requestLogin } from "../lib/auth";
import { pool } from "../lib/db";
import { outbox } from "../lib/mailer";
import { deriveTableState } from "../lib/tables";
import { buildReport } from "../lib/reports";
import { withTenant } from "../lib/db";
import { GET as board, POST as addTables } from "../app/api/staff/tables/route";
import { PUT as updateTable, DELETE as deleteTable } from "../app/api/staff/tables/[id]/route";
import { POST as clearTable } from "../app/api/staff/tables/[id]/clear/route";
import { POST as regenerate } from "../app/api/staff/tables/[id]/qr/route";
import { POST as addFloor } from "../app/api/staff/floors/route";
import { POST as resolveRequest } from "../app/api/staff/table-requests/[id]/resolve/route";
import { POST as payOrder } from "../app/api/staff/orders/[id]/pay/route";
import { POST as accept } from "../app/api/staff/orders/[id]/accept/route";
import { POST as ready } from "../app/api/staff/orders/[id]/ready/route";
import { POST as complete } from "../app/api/staff/orders/[id]/complete/route";
import { POST as cancel } from "../app/api/staff/orders/[id]/cancel/route";
import { GET as listOrders } from "../app/api/staff/orders/route";
import { PATCH as patchSettings } from "../app/api/staff/settings/route";
import { GET as resolveToken } from "../app/api/t/[token]/route";
import { POST as tableCheckout } from "../app/api/t/[token]/checkout/route";
import { POST as tableRequest } from "../app/api/t/[token]/requests/route";
import { GET as orderStatus } from "../app/api/orders/[token]/route";
import { POST as webhook } from "../app/api/webhooks/stripe/route";
import { POST as cron } from "../app/api/internal/expire-orders/route";
import { asOwner, createFixture, deleteFixture, type Fixture } from "./helpers";

let a: Fixture;
let b: Fixture;
let ownerToken: string;
let staffToken: string;
let otherOwnerToken: string;
let tableId: string;
let qr: string;

async function signIn(email: string): Promise<string> {
  outbox.length = 0;
  await requestLogin(email);
  const token = new URL(outbox[0].url).searchParams.get("token")!;
  return (await consumeLoginToken(token))!.sessionToken;
}

const cookie = (t: string | null) => (t ? { cookie: `${SESSION_COOKIE}=${t}` } : {});
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 1e6)}`;
const staffReq = (method: string, token: string | null, body?: unknown) =>
  new Request("http://localhost/x", { method, headers: { "content-type": "application/json", ...cookie(token) } as Record<string, string>, body: body === undefined ? undefined : JSON.stringify(body) });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const tokenCtx = (token: string) => ({ params: Promise.resolve({ token }) });

async function dineIn(token: string, body: Record<string, unknown>, key = crypto.randomUUID()) {
  const res = await tableCheckout(
    new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key, "x-forwarded-for": ip() }, body: JSON.stringify(body) }),
    tokenCtx(token),
  );
  return { res, body: await res.json() };
}
const orderIdFor = async (n: number, restaurantId: string) =>
  (await asOwner((c) => c.query("select id from orders where restaurant_id = $1 and number = $2", [restaurantId, n]))).rows[0].id as string;
const getBoard = async (token = ownerToken) => (await (await board(staffReq("GET", token), {})).json()) as { tables: { id: string; label: string; state: string; statusLabel: string; priority: boolean; unpaidCents: number; orders: { id: string; status: string }[]; requests: { id: string; kind: string }[]; qrToken?: string }[]; floors: { id: string; name: string }[] };
const tableState = async (token = ownerToken) => (await getBoard(token)).tables.find((t) => t.id === tableId)!;

beforeAll(async () => {
  a = await createFixture("tables-a");
  b = await createFixture("tables-b");
  ownerToken = await signIn(a.ownerEmail);
  staffToken = await signIn(a.staffEmail);
  otherOwnerToken = await signIn(b.ownerEmail);
  // "3% + card fees": the SROS fee is a plain 3% of the food, so the invoiced fee is easy to see in tests.
  await asOwner((c) => c.query("update restaurants set dine_in_enabled = true, fee_model = 'platform_plus_processing', platform_fee_bps = 300 where id = $1", [a.restaurantId]));
  const created = await addTables(staffReq("POST", ownerToken, { labels: ["05", "07"], seats: 4 }), {});
  expect(created.status).toBe(201);
  const t = (await getBoard()).tables.find((x) => x.label === "05")!;
  tableId = t.id;
  qr = t.qrToken!;
});

afterAll(async () => {
  await deleteFixture(a);
  await deleteFixture(b);
  await pool.end();
});

const NOW = new Date("2026-06-01T12:00:00Z");
const order = (status: string, paid = false, minutesAgo = 1) => ({ status, paidAt: paid ? NOW : null, createdAt: new Date(NOW.getTime() - minutesAgo * 60_000) });

describe("table status rules", () => {
  const base = { requests: [], lastSeenAt: null, now: NOW };
  it("is available when nothing is happening, and browsing when a guest has the menu open", () => {
    expect(deriveTableState({ ...base, orders: [] }).state).toBe("available");
    expect(deriveTableState({ ...base, orders: [], lastSeenAt: new Date(NOW.getTime() - 60_000) }).state).toBe("browsing");
    expect(deriveTableState({ ...base, orders: [], lastSeenAt: new Date(NOW.getTime() - 10 * 60_000) }).state).toBe("available");
  });
  it("follows the order through the kitchen", () => {
    expect(deriveTableState({ ...base, orders: [order("awaiting_acceptance")] })).toMatchObject({ state: "pending", priority: false });
    expect(deriveTableState({ ...base, orders: [order("awaiting_acceptance", false, 5)] })).toMatchObject({ state: "pending", priority: true });
    expect(deriveTableState({ ...base, orders: [order("accepted")] }).state).toBe("preparing");
    expect(deriveTableState({ ...base, orders: [order("ready")] })).toMatchObject({ state: "ready", priority: true });
    expect(deriveTableState({ ...base, orders: [order("completed")] }).state).toBe("served");
    expect(deriveTableState({ ...base, orders: [order("completed", true)] }).state).toBe("paid");
  });
  it("puts a guest's request first, and names the kind of bill", () => {
    expect(deriveTableState({ ...base, orders: [order("accepted")], requests: [{ kind: "waiter" }] })).toMatchObject({ state: "service", priority: true });
    expect(deriveTableState({ ...base, orders: [order("completed")], requests: [{ kind: "bill_cash" }] })).toMatchObject({ state: "bill", statusLabel: "Bill (Cash)" });
    expect(deriveTableState({ ...base, orders: [], requests: [{ kind: "bill_card" }] }).statusLabel).toBe("Bill (Card)");
  });
  it("ignores orders that failed or never started", () => {
    for (const status of ["declined", "cancelled", "expired", "payment_failed", "pending_payment"]) {
      expect(deriveTableState({ ...base, orders: [order(status)] }).state).toBe("available");
    }
  });
  it("is still preparing while any order is cooking, even if another was served", () => {
    expect(deriveTableState({ ...base, orders: [order("completed", true), order("accepted")] }).state).toBe("preparing");
  });
});

describe("setting up tables", () => {
  it("lets the owner add tables, skips names that exist, and refuses staff", async () => {
    const again = await addTables(staffReq("POST", ownerToken, { labels: ["05", "08"] }), {});
    expect((await again.json()).created).toBe(1);
    expect((await addTables(staffReq("POST", ownerToken, { labels: ["05"] }), {})).status).toBe(409);
    expect((await addTables(staffReq("POST", staffToken, { labels: ["99"] }), {})).status).toBe(403);
    expect((await addTables(staffReq("POST", ownerToken, { labels: ["bad/label"] }), {})).status).toBe(400);
  });

  it("only shows the QR secret to the owner", async () => {
    const asStaff = await getBoard(staffToken);
    expect(asStaff.tables.every((t) => t.qrToken === undefined)).toBe(true);
    expect((await getBoard(ownerToken)).tables.every((t) => typeof t.qrToken === "string")).toBe(true);
  });

  it("keeps floors and tables separate between restaurants", async () => {
    const floor = await (await addFloor(staffReq("POST", ownerToken, { name: "Patio" }), {})).json();
    expect((await addFloor(staffReq("POST", ownerToken, { name: "Patio" }), {})).status).toBe(409);
    expect((await updateTable(staffReq("PUT", ownerToken, { floorId: floor.id }), idCtx(tableId))).status).toBe(200);

    const theirs = await getBoard(otherOwnerToken);
    expect(theirs.tables).toHaveLength(0);
    expect((await updateTable(staffReq("PUT", otherOwnerToken, { seats: 2 }), idCtx(tableId))).status).toBe(404);
    // Another restaurant's floor cannot be used, and another restaurant's staff cannot be assigned.
    expect((await updateTable(staffReq("PUT", otherOwnerToken, { floorId: floor.id }), idCtx(tableId))).status).toBe(404);
    const theirStaff = (await asOwner((c) => c.query("select id from staff_users where restaurant_id = $1 limit 1", [b.restaurantId]))).rows[0].id;
    expect((await updateTable(staffReq("PUT", ownerToken, { assignedTo: theirStaff }), idCtx(tableId))).status).toBe(404);
  });

  it("assigns a table to a waiter of the same restaurant", async () => {
    const mine = (await asOwner((c) => c.query("select id from staff_users where email = $1", [a.staffEmail]))).rows[0].id;
    expect((await updateTable(staffReq("PUT", ownerToken, { assignedTo: mine }), idCtx(tableId))).status).toBe(200);
    expect((await getBoard()).tables.find((t) => t.id === tableId)).toBeTruthy();
  });
});

describe("scanning a QR code", () => {
  it("shows the table and restaurant, and rejects unknown, malformed or retired codes", async () => {
    const ok = await resolveToken(new Request("http://localhost/x"), tokenCtx(qr));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ table: { label: "05" }, dineInEnabled: true, payLaterEnabled: true });
    expect((await resolveToken(new Request("http://localhost/x"), tokenCtx("x".repeat(30)))).status).toBe(404);
    expect((await resolveToken(new Request("http://localhost/x"), tokenCtx("short"))).status).toBe(404);
  });

  it("marks the table as browsing while the page is open", async () => {
    await asOwner((c) => c.query("update dining_tables set last_seen_at = null where id = $1", [tableId]));
    await resolveToken(new Request("http://localhost/x"), tokenCtx(qr));
    expect((await tableState()).state).toBe("browsing");
  });

  it("stops working after the code is regenerated", async () => {
    const other = (await getBoard()).tables.find((t) => t.label === "08")!;
    const res = await regenerate(staffReq("POST", ownerToken), idCtx(other.id));
    const fresh = (await res.json()).qrToken as string;
    expect(fresh).not.toBe(other.qrToken);
    expect((await resolveToken(new Request("http://localhost/x"), tokenCtx(other.qrToken!))).status).toBe(404);
    expect((await resolveToken(new Request("http://localhost/x"), tokenCtx(fresh))).status).toBe(200);
  });
});

describe("a dine-in order paid later", () => {
  let orderId: string;
  let orderNumber: number;

  it("goes straight to the kitchen with no card hold and no deadline", async () => {
    const { res, body } = await dineIn(qr, { items: [{ itemId: a.itemId, quantity: 1 }], payLater: true, tipCents: 100 });
    expect(res.status).toBe(201);
    expect(body.payment).toBeNull();
    expect(body.order.status).toBe("awaiting_acceptance");
    orderNumber = body.order.number;
    orderId = await orderIdFor(orderNumber, a.restaurantId);
    const row = (await asOwner((c) => c.query("select * from orders where id = $1", [orderId]))).rows[0];
    expect(row).toMatchObject({ order_type: "dine_in", payment_mode: "pay_later", fee_collection: "invoice", customer_name: "Table 05", customer_phone: "", total_cents: 1100 });
    expect(row.accept_deadline).toBeNull();
    expect(row.table_id).toBe(tableId);
    expect((await asOwner((c) => c.query("select count(*)::int as n from payments where order_id = $1", [orderId]))).rows[0].n).toBe(0);
    expect(await tableState()).toMatchObject({ state: "pending" });
  });

  it("allows a very small bill, since no card is charged", async () => {
    await asOwner((c) => c.query("update menu_items set price_cents = 20 where id = $1", [a.itemId]));
    const { res, body } = await dineIn(qr, { items: [{ itemId: a.itemId, quantity: 1 }], payLater: true });
    await asOwner((c) => c.query("update menu_items set price_cents = 1000 where id = $1", [a.itemId]));
    expect(res.status).toBe(201);
    expect(body.order.totalCents).toBe(20);
    // Remove it so it does not affect the table's status in the tests that follow.
    const extraId = await orderIdFor(body.order.number, a.restaurantId);
    await asOwner((c) => c.query("update orders set status = 'cancelled' where id = $1", [extraId]));
  });

  it("does not expire, however long the kitchen takes", async () => {
    await asOwner((c) => c.query("update orders set created_at = now() - interval '2 hours' where id = $1", [orderId]));
    await asOwner((c) => c.query("update dining_tables set cleared_at = now() - interval '3 hours' where id = $1", [tableId]));
    const sweep = await cron(new Request("http://localhost/x", { method: "POST", headers: { authorization: "Bearer test-cron-secret" } }), {});
    expect(sweep.status).toBe(200);
    expect((await asOwner((c) => c.query("select status from orders where id = $1", [orderId]))).rows[0].status).toBe("awaiting_acceptance");
  });

  it("shows the table and payment mode in the kitchen list", async () => {
    const list = await (await listOrders(staffReq("GET", staffToken), {})).json();
    const mine = list.orders.find((o: { id: string }) => o.id === orderId);
    expect(mine).toMatchObject({ orderType: "dine_in", tableLabel: "05", paymentMode: "pay_later", paidAt: null });
  });

  it("is accepted without charging anything, then served", async () => {
    expect((await accept(staffReq("POST", staffToken, { prepMinutes: 15 }), idCtx(orderId))).status).toBe(200);
    expect(await tableState()).toMatchObject({ state: "preparing" });
    expect((await ready(staffReq("POST", staffToken), idCtx(orderId))).status).toBe(200);
    expect(await tableState()).toMatchObject({ state: "ready", priority: true });
    expect((await complete(staffReq("POST", staffToken), idCtx(orderId))).status).toBe(200);
    const row = (await asOwner((c) => c.query("select served_at, paid_at from orders where id = $1", [orderId]))).rows[0];
    expect(row.served_at).not.toBeNull();
    expect(row.paid_at).toBeNull();
    expect(await tableState()).toMatchObject({ state: "served", unpaidCents: 1100 });
  });

  it("cannot clear the table until the bill is paid", async () => {
    const res = await clearTable(staffReq("POST", staffToken), idCtx(tableId));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/unpaid/i);
  });

  it("raises a bill request, which paying in cash settles", async () => {
    const req = await tableRequest(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify({ kind: "bill_cash" }) }), tokenCtx(qr));
    expect(req.status).toBe(201);
    expect(await tableState()).toMatchObject({ state: "bill", statusLabel: "Bill (Cash)", priority: true });

    expect((await payOrder(staffReq("POST", staffToken, { method: "cash" }), idCtx(orderId))).status).toBe(200);
    const row = (await asOwner((c) => c.query("select paid_at from orders where id = $1", [orderId]))).rows[0];
    expect(row.paid_at).not.toBeNull();
    const pay = (await asOwner((c) => c.query("select provider, status, method, amount_cents, fee_cents from payments where order_id = $1", [orderId]))).rows[0];
    expect(pay).toMatchObject({ provider: "manual", status: "captured", method: "cash", amount_cents: 1100, fee_cents: 0 });
    expect(await tableState()).toMatchObject({ state: "paid", requests: [] });
    expect((await payOrder(staffReq("POST", staffToken, { method: "cash" }), idCtx(orderId))).status).toBe(409);
  });

  it("counts toward sales without card fees, with the SROS fee invoiced", async () => {
    const report = await withTenant(a.restaurantId, (db) => buildReport(db, new Date(Date.now() - 86_400_000), new Date(Date.now() + 86_400_000)));
    expect(report.paidOrders).toBeGreaterThanOrEqual(1);
    expect(report.processingEstimateCents).toBe(0);
    expect(report.platformFeeInvoicedCents).toBeGreaterThan(0);
    expect(report.byMethod.cash.orders).toBe(1);
  });

  it("clears once paid, and starts fresh for the next party", async () => {
    expect((await clearTable(staffReq("POST", staffToken), idCtx(tableId))).status).toBe(200);
    await asOwner((c) => c.query("update dining_tables set last_seen_at = null where id = $1", [tableId])); // the earlier QR scan
    expect(await tableState()).toMatchObject({ state: "available", orders: [] });
  });

  it("shows the guest a status page with their table, and no payment is expected online", async () => {
    const token = await tokenFor(orderId);
    const res = await orderStatus(new Request("http://localhost/x", { headers: { "x-forwarded-for": ip() } }), tokenCtx(token));
    expect(await res.json()).toMatchObject({ orderType: "dine_in", paymentMode: "pay_later", paid: true, table: { label: "05" } });
  });
});

/** The customer's private link is derived from the idempotency key; tests recompute it the same way the server does. */
async function tokenFor(orderId: string): Promise<string> {
  const row = (await asOwner((c) => c.query("select idempotency_key, restaurant_id from orders where id = $1", [orderId]))).rows[0];
  const { orderToken } = await import("../lib/orders");
  return orderToken(row.restaurant_id, row.idempotency_key);
}

describe("a dine-in order paid now by card", () => {
  it("holds the card, then charges it when the kitchen accepts", async () => {
    const { res, body } = await dineIn(qr, { items: [{ itemId: a.itemId, quantity: 2 }], payLater: false });
    expect(res.status).toBe(201);
    expect(body.order.status).toBe("pending_payment");
    expect(body.payment).toMatchObject({ provider: "fake" });
    const orderId = await orderIdFor(body.order.number, a.restaurantId);
    const row = (await asOwner((c) => c.query("select order_type, payment_mode, fee_collection, paid_at from orders where id = $1", [orderId]))).rows[0];
    expect(row).toMatchObject({ order_type: "dine_in", payment_mode: "online", fee_collection: "platform", paid_at: null });

    const pay = (await asOwner((c) => c.query("select provider_payment_id from payments where order_id = $1", [orderId]))).rows[0];
    await webhook(
      new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId: `evt-${crypto.randomUUID()}`, type: "authorized", providerPaymentId: pay.provider_payment_id, restaurantId: a.restaurantId, orderId, account: null }) }),
      tokenCtx(""),
    );
    expect(await tableState()).toMatchObject({ state: "pending" });
    expect((await accept(staffReq("POST", staffToken, {}), idCtx(orderId))).status).toBe(200);
    const done = (await asOwner((c) => c.query("select o.paid_at, p.status from orders o join payments p on p.order_id = o.id where o.id = $1", [orderId]))).rows[0];
    expect(done.status).toBe("captured");
    expect(done.paid_at).not.toBeNull();
    // Cannot be "paid in person" a second time.
    expect((await payOrder(staffReq("POST", staffToken, { method: "cash" }), idCtx(orderId))).status).toBe(409);
    await ready(staffReq("POST", staffToken), idCtx(orderId));
    await complete(staffReq("POST", staffToken), idCtx(orderId));
    expect((await clearTable(staffReq("POST", staffToken), idCtx(tableId))).status).toBe(200);
  });
});

describe("rules and limits", () => {
  it("refuses pay-later when the owner turns it off, and all table orders when dine-in is off", async () => {
    await patchSettings(staffReq("PATCH", ownerToken, { payLaterEnabled: false }), {});
    const noLater = await dineIn(qr, { items: [{ itemId: a.itemId, quantity: 1 }], payLater: true });
    expect(noLater.res.status).toBe(409);
    await patchSettings(staffReq("PATCH", ownerToken, { payLaterEnabled: true, dineInEnabled: false }), {});
    const off = await dineIn(qr, { items: [{ itemId: a.itemId, quantity: 1 }], payLater: true });
    expect(off.res.status).toBe(409);
    expect((await tableRequest(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify({ kind: "waiter" }) }), tokenCtx(qr))).status).toBe(409);
    await patchSettings(staffReq("PATCH", ownerToken, { dineInEnabled: true }), {});
  });

  it("only lets the owner change those settings", async () => {
    expect((await patchSettings(staffReq("PATCH", staffToken, { dineInEnabled: false }), {})).status).toBe(403);
  });

  it("ignores a repeated request, and lets staff resolve one", async () => {
    const call = () => tableRequest(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify({ kind: "water" }) }), tokenCtx(qr));
    const first = await call();
    const second = await call();
    expect([first.status, second.status]).toEqual([201, 200]);
    const open = (await tableState()).requests;
    expect(open).toHaveLength(1);
    expect((await resolveRequest(staffReq("POST", staffToken), idCtx(open[0].id))).status).toBe(200);
    expect((await tableState()).requests).toHaveLength(0);
  });

  it("rejects an unknown request kind", async () => {
    const res = await tableRequest(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify({ kind: "free-dessert" }) }), tokenCtx(qr));
    expect(res.status).toBe(400);
  });

  it("limits how many orders one table can place", async () => {
    await asOwner((c) => c.query("delete from rate_limits where key_hash is not null"));
    let limited = 0;
    for (let i = 0; i < 10; i++) {
      const { res } = await dineIn(qr, { items: [{ itemId: a.itemId, quantity: 1 }], payLater: true });
      if (res.status === 429) limited++;
    }
    expect(limited).toBeGreaterThan(0);
  });

  it("will not delete a table that has order history, but can deactivate it", async () => {
    const res = await deleteTable(staffReq("DELETE", ownerToken), idCtx(tableId));
    expect(res.status).toBe(409);
    expect((await updateTable(staffReq("PUT", ownerToken, { active: false }), idCtx(tableId))).status).toBe(200);
    expect((await resolveToken(new Request("http://localhost/x"), tokenCtx(qr))).status).toBe(404);
    expect((await getBoard(staffToken)).tables.some((t) => t.id === tableId)).toBe(false);
  });

  it("deletes a table that was never used", async () => {
    const fresh = (await getBoard()).tables.find((t) => t.label === "07")!;
    expect((await deleteTable(staffReq("DELETE", ownerToken), idCtx(fresh.id))).status).toBe(200);
  });

  it("cancelling a paid pay-later order tells staff to refund in person", async () => {
    await patchSettings(staffReq("PATCH", ownerToken, { dineInEnabled: true }), {});
    await asOwner((c) => c.query("update dining_tables set active = true where id = $1", [tableId]));
    await asOwner((c) => c.query("delete from rate_limits"));
    const { body } = await dineIn(qr, { items: [{ itemId: a.itemId, quantity: 1 }], payLater: true });
    const id = await orderIdFor(body.order.number, a.restaurantId);
    await accept(staffReq("POST", staffToken, {}), idCtx(id));
    await payOrder(staffReq("POST", staffToken, { method: "cash" }), idCtx(id));
    const res = await cancel(staffReq("POST", ownerToken), idCtx(id));
    expect(await res.json()).toMatchObject({ status: "cancelled", refundInPerson: true });
    expect((await asOwner((c) => c.query("select status from payments where order_id = $1", [id]))).rows[0].status).toBe("refunded");
  });
});
