import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE, consumeLoginToken, requestLogin } from "../lib/auth";
import { pool } from "../lib/db";
import { outbox } from "../lib/mailer";
import { getProvider } from "../lib/payments/provider";
import { POST as checkout } from "../app/api/r/[slug]/checkout/route";
import { POST as webhook } from "../app/api/webhooks/stripe/route";
import { POST as accept } from "../app/api/staff/orders/[id]/accept/route";
import { POST as cancelOrder } from "../app/api/staff/orders/[id]/cancel/route";
import { PUT as putHours } from "../app/api/staff/hours/route";
import { GET as getPricing, PUT as putPricing } from "../app/api/staff/pricing/route";
import { GET as getReport } from "../app/api/staff/reports/summary/route";
import { asOwner, createFixture, deleteFixture, type Fixture } from "./helpers";

let a: Fixture;
let b: Fixture;
let slugA: string;
let ownerToken: string;
let staffToken: string;
let counter = 0;

async function signIn(email: string) {
  outbox.length = 0;
  await requestLogin(email);
  return (await consumeLoginToken(new URL(outbox[0].url).searchParams.get("token")!))!.sessionToken;
}
const ctx = { params: Promise.resolve({ slug: "", id: "" }) };
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method: string, token: string | null, body?: unknown, url = "http://localhost/test", headers: Record<string, string> = {}) =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json", ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** Places an order of 2 x $10.00 (subtotal $20.00) and returns its id. */
async function order(opts: { pay?: boolean; accept?: boolean } = {}) {
  const res = await checkout(
    req("POST", null, { items: [{ itemId: a.itemId, quantity: 2 }], customer: { name: "Mai", phone: "9185550100" } }, "http://localhost/test", {
      "idempotency-key": `pr-${Date.now()}-${counter++}`,
      "x-forwarded-for": `10.1.${counter % 250}.1`,
    }),
    { params: Promise.resolve({ slug: slugA }) },
  );
  expect(res.status).toBe(201);
  const body = await res.json();
  const id = (await asOwner((c) => c.query("select id from orders where restaurant_id = $1 and number = $2", [a.restaurantId, body.order.number]))).rows[0].id as string;
  if (opts.pay !== false) {
    const pay = await asOwner((c) => c.query("select provider_payment_id from payments where order_id = $1", [id]));
    await webhook(
      req("POST", null, { eventId: `evt-${crypto.randomUUID()}`, type: "authorized", providerPaymentId: pay.rows[0].provider_payment_id, restaurantId: a.restaurantId, orderId: id, account: null }),
      ctx,
    );
    if (opts.accept !== false) expect((await accept(req("POST", ownerToken), idCtx(id))).status).toBe(200);
  }
  return id;
}
const snapshot = async (id: string) => (await asOwner((c) => c.query("select fee_cents, fee_snapshot from orders where id = $1", [id]))).rows[0];

beforeAll(async () => {
  a = await createFixture("pr-a");
  b = await createFixture("pr-b");
  slugA = (await asOwner((c) => c.query("select slug from restaurants where id = $1", [a.restaurantId]))).rows[0].slug;
  await asOwner((c) => c.query("update restaurants set tax_rate_bps = 1000 where id = $1", [a.restaurantId]));
  ownerToken = await signIn(a.ownerEmail);
  staffToken = await signIn(a.staffEmail);
  await getProvider();
  const periods = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: "00:00", closes: "23:45" }));
  expect((await putHours(req("PUT", ownerToken, { periods }), ctx)).status).toBe(200);
});

afterAll(async () => {
  await deleteFixture(a);
  await deleteFixture(b);
  await pool.end();
});

describe("choosing a plan", () => {
  it("lists plans with estimates for the owner only", async () => {
    const res = await getPricing(req("GET", ownerToken, undefined, "http://localhost/t?monthlySalesCents=1000000&avgOrderCents=3000"), ctx);
    const body = await res.json();
    expect(body.current).toBe("model_b");
    expect(body.plans.map((p: { key: string }) => p.key)).toEqual(["model_a", "model_b", "founding", "growth"]);
    expect(body.plans.find((p: { key: string }) => p.key === "model_b").estimate.restaurantCostCents).toBe(60_000);
    expect((await getPricing(req("GET", staffToken), ctx)).status).toBe(403);
    expect((await getPricing(req("GET", null), ctx)).status).toBe(401);
  });

  it("applies a new plan to new orders only", async () => {
    const before = await order({ pay: false });
    expect((await snapshot(before)).fee_snapshot.plan).toBe("model_b");

    expect((await putPricing(req("PUT", ownerToken, { plan: "model_a" }), ctx)).status).toBe(200);
    const after = await order({ pay: false });
    const s = await snapshot(after);
    expect(s.fee_snapshot).toMatchObject({ plan: "model_a", model: "platform_plus_processing", feeBps: 300 });
    expect(s.fee_cents).toBe(60); // 3% of $20.00

    expect((await snapshot(before)).fee_snapshot.plan).toBe("model_b");
    await putPricing(req("PUT", ownerToken, { plan: "model_b" }), ctx);
  });

  it("refuses staff, unknown plans and plans that are not available yet", async () => {
    expect((await putPricing(req("PUT", staffToken, { plan: "model_a" }), ctx)).status).toBe(403);
    expect((await putPricing(req("PUT", ownerToken, { plan: "nope" }), ctx)).status).toBe(400);
    expect((await putPricing(req("PUT", ownerToken, { plan: "growth" }), ctx)).status).toBe(409);
  });

  it("does not change another restaurant's plan", async () => {
    await putPricing(req("PUT", ownerToken, { plan: "founding" }), ctx);
    const other = await asOwner((c) => c.query("select pricing_plan, platform_fee_bps from restaurants where id = $1", [b.restaurantId]));
    expect(other.rows[0]).toMatchObject({ pricing_plan: "model_b", platform_fee_bps: 600 });
    await putPricing(req("PUT", ownerToken, { plan: "model_b" }), ctx);
  });
});

describe("sales report", () => {
  it("reports gross captures and refunds independently and leaves out unpaid orders", async () => {
    await asOwner((c) => c.query("delete from orders where restaurant_id = $1", [a.restaurantId]));
    await order(); // paid
    await order(); // paid
    const refunded = await order();
    expect((await cancelOrder(req("POST", ownerToken), idCtx(refunded))).status).toBe(200);
    await order({ pay: false }); // never paid

    const res = await getReport(req("GET", ownerToken, undefined, "http://localhost/t?days=7"), ctx);
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.paidOrders).toBe(3);
    expect(r.subtotalCents).toBe(6000);
    expect(r.taxCents).toBe(600);
    expect(r.grossCents).toBe(6600);
    expect(r.netChargedCents).toBe(4400);
    expect(r.netSalesCents).toBe(4000);
    const fee = (await snapshot(await lastPaid())).fee_cents;
    expect(r.platformFeeCents).toBe(3 * fee);
    expect(r.refunds).toEqual({ count: 1, totalCents: 2200 });
    expect(r.averageOrderCents).toBe(2200);
    expect(r.topItems[0]).toMatchObject({ name: "Test dish", quantity: 6, salesCents: 6000 });
    expect(r.days.reduce((s: number, d: { orders: number }) => s + d.orders, 0)).toBe(3);
    expect(r.netEstimateCents).toBe(r.grossCents - r.taxCents - r.platformFeeCents - r.processingEstimateCents - (2200 - 200 - fee));
  });

  it("attributes a later refund to its own period without removing the original capture", async () => {
    const id = await order();
    await cancelOrder(req("POST", ownerToken), idCtx(id));
    await asOwner((c) => c.query("update payments set captured_at = now() - interval '2 days' where order_id = $1", [id]));
    const narrow = await (await getReport(req("GET", ownerToken, undefined, "http://localhost/t?days=1"), ctx)).json();
    const wide = await (await getReport(req("GET", ownerToken, undefined, "http://localhost/t?days=7"), ctx)).json();
    expect(wide.grossCents - narrow.grossCents).toBe(2200);
    expect(wide.refunds).toEqual(narrow.refunds);
  });

  it("is owner-only and validates the period", async () => {
    expect((await getReport(req("GET", staffToken), ctx)).status).toBe(403);
    expect((await getReport(req("GET", ownerToken, undefined, "http://localhost/t?days=0"), ctx)).status).toBe(400);
    expect((await getReport(req("GET", ownerToken, undefined, "http://localhost/t?days=9999"), ctx)).status).toBe(400);
  });

  it("another restaurant sees none of these orders", async () => {
    const bToken = await signIn(b.ownerEmail);
    const r = await (await getReport(req("GET", bToken), ctx)).json();
    expect(r.paidOrders).toBe(0);
    expect(r.grossCents).toBe(0);
    expect(r.topItems).toEqual([]);
  });
});

async function lastPaid() {
  const r = await asOwner((c) => c.query("select o.id from orders o join payments p on p.order_id = o.id where o.restaurant_id = $1 and p.status = 'captured' limit 1", [a.restaurantId]));
  return r.rows[0].id as string;
}
