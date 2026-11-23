import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, consumeLoginToken, requestLogin } from "../lib/auth";
import { pool } from "../lib/db";
import { outbox } from "../lib/mailer";
import { getProvider, resetProviderForTests } from "../lib/payments/provider";
import type { FakeProvider } from "../lib/payments/fake";
import { StripeProvider } from "../lib/payments/stripe";
import { applyPaymentEvent, expireStaleOrders, reconcilePendingRefunds } from "../lib/orders";
import { POST as checkout } from "../app/api/r/[slug]/checkout/route";
import { GET as orderStatus } from "../app/api/orders/[token]/route";
import { POST as webhook } from "../app/api/webhooks/stripe/route";
import { POST as accept } from "../app/api/staff/orders/[id]/accept/route";
import { POST as decline } from "../app/api/staff/orders/[id]/decline/route";
import { GET as listOrders } from "../app/api/staff/orders/route";
import { POST as ready } from "../app/api/staff/orders/[id]/ready/route";
import { POST as complete } from "../app/api/staff/orders/[id]/complete/route";
import { POST as cancelOrder } from "../app/api/staff/orders/[id]/cancel/route";
import { PUT as putHours } from "../app/api/staff/hours/route";
import { POST as cron } from "../app/api/internal/expire-orders/route";
import { asOwner, createFixture, deleteFixture, type Fixture } from "./helpers";

let a: Fixture;
let b: Fixture;
let slugA: string;
let ownerToken: string;
let provider: FakeProvider;

async function signIn(email: string) {
  outbox.length = 0;
  await requestLogin(email);
  const token = new URL(outbox[0].url).searchParams.get("token")!;
  return (await consumeLoginToken(token))!.sessionToken;
}

const slugCtx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method: string, opts: { token?: string | null; body?: unknown; headers?: Record<string, string> } = {}) =>
  new Request("http://localhost/test", {
    method,
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { cookie: `${SESSION_COOKIE}=${opts.token}` } : {}),
      ...opts.headers,
    },
    body: opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
  });

const customer = { name: "Mai", phone: "918-555-0100" };
let keyCounter = 0;
const newKey = () => `test-key-${Date.now()}-${keyCounter++}`;

async function placeOrder(f: Fixture = a, slug = slugA, quantity = 2, key = newKey()) {
  const res = await checkout(
    req("POST", { body: { items: [{ itemId: f.itemId, quantity }], customer, pickupTime: undefined }, headers: { "idempotency-key": key, "x-forwarded-for": `10.${keyCounter++ % 250}.0.1` } }),
    slugCtx(slug),
  );
  return { res, key, body: await res.json() };
}

/** Pretends the card form succeeded and the provider told us so. */
async function authorize(orderId: string, restaurantId: string, type: "authorized" | "failed" | "canceled" | "captured" = "authorized") {
  const pay = await asOwner((c) => c.query("select provider_payment_id from payments where order_id = $1", [orderId]));
  return webhook(
    req("POST", {
      body: {
        eventId: `evt-${crypto.randomUUID()}`,
        type,
        providerPaymentId: pay.rows[0].provider_payment_id,
        restaurantId,
        orderId,
        account: null,
      },
    }),
    slugCtx(""),
  );
}

const orderIdFor = async (number: number, restaurantId: string) =>
  (await asOwner((c) => c.query("select id from orders where restaurant_id = $1 and number = $2", [restaurantId, number]))).rows[0].id as string;

beforeAll(async () => {
  a = await createFixture("orders-a");
  b = await createFixture("orders-b");
  slugA = (await asOwner((c) => c.query("select slug from restaurants where id = $1", [a.restaurantId]))).rows[0].slug;
  await asOwner((c) => c.query("update restaurants set tax_rate_bps = 875 where id = $1", [a.restaurantId]));
  ownerToken = await signIn(a.ownerEmail);
  provider = (await getProvider()) as FakeProvider;
  const periods = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: "00:00", closes: "23:45" }));
  expect((await putHours(req("PUT", { token: ownerToken, body: { periods } }), slugCtx(""))).status).toBe(200);
});

beforeEach(() => {
  provider.calls = [];
  provider.failCapture = false;
  provider.failRefund = false;
});

afterAll(async () => {
  await deleteFixture(a);
  await deleteFixture(b);
  await pool.end();
});

describe("checkout", () => {
  it("saves the order with server prices and a fee snapshot, and starts a card authorization", async () => {
    const { res, body } = await placeOrder();
    expect(res.status).toBe(201);
    expect(body.order.totalCents).toBe(2000 + 175); // 8.75% tax on $20.00
    expect(body.order.status).toBe("pending_payment");
    expect(body.payment.clientSecret).toMatch(/^fake_pi_/);
    const row = (await asOwner((c) => c.query("select * from orders where restaurant_id = $1", [a.restaurantId]))).rows[0];
    expect(row.subtotal_cents).toBe(2000);
    expect(row.fee_snapshot.model).toBe("all_in");
    expect(row.fee_snapshot.feeBase).toBe("subtotal");
    expect(provider.calls[0]).toMatchObject({ action: "authorize", amountCents: row.total_cents, feeCents: row.fee_cents });
  });

  it("requires an idempotency key", async () => {
    const res = await checkout(req("POST", { body: { items: [{ itemId: a.itemId, quantity: 1 }], customer } }), slugCtx(slugA));
    expect(res.status).toBe(400);
  });

  it("a retried request returns the same order and does not charge twice", async () => {
    const key = newKey();
    const first = await placeOrder(a, slugA, 1, key);
    const second = await placeOrder(a, slugA, 1, key);
    expect(second.body.orderToken).toBe(first.body.orderToken);
    expect(second.body.order.number).toBe(first.body.order.number);
    const count = await asOwner((c) => c.query("select count(*)::int n from orders where idempotency_key = $1", [key]));
    expect(count.rows[0].n).toBe(1);
  });

  it("allows identical concurrent retries to recover payment after ordering pauses", async () => {
    const key = newKey();
    const [first, second] = await Promise.all([placeOrder(a, slugA, 1, key), placeOrder(a, slugA, 1, key)]);
    expect(first.res.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(provider.calls.filter((call) => call.action === "authorize")).toHaveLength(1);
    await asOwner((c) => c.query("update restaurants set accepting_orders = false where id = $1", [a.restaurantId]));
    try {
      expect((await placeOrder(a, slugA, 1, key)).body).toEqual(first.body);
    } finally {
      await asOwner((c) => c.query("update restaurants set accepting_orders = true where id = $1", [a.restaurantId]));
    }
  });

  it("rejects a same-price replay with changed customer details", async () => {
    const { key } = await placeOrder(a, slugA, 1);
    const changed = await checkout(req("POST", {
      body: { items: [{ itemId: a.itemId, quantity: 1 }], customer: { ...customer, name: "Other Name" } },
      headers: { "idempotency-key": key },
    }), slugCtx(slugA));
    expect(changed.status).toBe(409);
  });

  it("binds a browser checkout to its independent retry session", async () => {
    const key = newKey();
    const proof = crypto.randomUUID();
    const submit = (session?: string) => checkout(req("POST", {
      body: { items: [{ itemId: a.itemId, quantity: 1 }], customer },
      headers: { "idempotency-key": key, ...(session ? { "checkout-session": session } : {}) },
    }), slugCtx(slugA));
    const started = await submit(proof);
    expect(started.status).toBe(201);
    expect((await submit()).status).toBe(409);
    expect(await (await submit(proof)).json()).toEqual(await started.json());
  });

  it("refuses to reuse a key for a different order", async () => {
    const key = newKey();
    await placeOrder(a, slugA, 1, key);
    const other = await placeOrder(a, slugA, 3, key);
    expect(other.res.status).toBe(409);
  });

  it("rejects items from another restaurant and bad phone numbers", async () => {
    expect((await placeOrder(b, slugA)).res.status).toBe(422);
    const bad = await checkout(
      req("POST", { body: { items: [{ itemId: a.itemId, quantity: 1 }], customer: { name: "x", phone: "abc" } }, headers: { "idempotency-key": newKey() } }),
      slugCtx(slugA),
    );
    expect(bad.status).toBe(400);
  });

  it("numbers orders per restaurant", async () => {
    const x = await placeOrder();
    const y = await placeOrder();
    expect(y.body.order.number).toBe(x.body.order.number + 1);
    await asOwner((c) =>
      c.query(
        `insert into business_hours (restaurant_id, location_id, weekday, opens, closes)
         select $1, l.id, d, '00:00', '23:45' from locations l, generate_series(0, 6) d where l.restaurant_id = $1 and l.is_default`,
        [b.restaurantId],
      ),
    );
    const other = await placeOrder(b, (await asOwner((c) => c.query("select slug from restaurants where id = $1", [b.restaurantId]))).rows[0].slug);
    expect(other.body.order.number).toBe(1);
  });
});

describe("payment events and the kitchen", () => {
  it("moves an order to awaiting acceptance when the card is authorized, then captures on accept", async () => {
    const { body } = await placeOrder();
    const id = await orderIdFor(body.order.number, a.restaurantId);
    expect(await (await authorize(id, a.restaurantId)).json()).toMatchObject({ result: "applied" });

    const status = await (await orderStatus(req("GET"), { params: Promise.resolve({ token: body.orderToken }) })).json();
    expect(status.status).toBe("awaiting_acceptance");

    const queue = await (await listOrders(req("GET", { token: ownerToken }), slugCtx(""))).json();
    expect(queue.orders.map((o: { id: string }) => o.id)).toContain(id);

    expect((await accept(req("POST", { token: ownerToken }), idCtx(id))).status).toBe(200);
    expect(provider.calls.some((c) => c.action === "capture")).toBe(true);
    const row = (await asOwner((c) => c.query("select o.status, p.status as pay from orders o join payments p on p.order_id = o.id where o.id = $1", [id]))).rows[0];
    expect(row).toMatchObject({ status: "accepted", pay: "captured" });
  });

  it("ignores a repeated event", async () => {
    const { body } = await placeOrder();
    const id = await orderIdFor(body.order.number, a.restaurantId);
    const pay = await asOwner((c) => c.query("select provider_payment_id from payments where order_id = $1", [id]));
    const event = { eventId: `dup-${crypto.randomUUID()}`, type: "authorized", providerPaymentId: pay.rows[0].provider_payment_id, restaurantId: a.restaurantId, orderId: id, account: null };
    expect(await (await webhook(req("POST", { body: event }), slugCtx(""))).json()).toMatchObject({ result: "applied" });
    expect(await (await webhook(req("POST", { body: event }), slugCtx(""))).json()).toMatchObject({ result: "duplicate" });
  });

  it("retries a webhook delivered before the payment row exists", async () => {
    const { body } = await placeOrder();
    const orderId = await orderIdFor(body.order.number, a.restaurantId);
    const payment = await asOwner((c) => c.query("delete from payments where order_id = $1 returning *", [orderId]));
    const event = {
      eventId: crypto.randomUUID(), type: "authorized" as const, orderId, restaurantId: a.restaurantId,
      providerPaymentId: payment.rows[0].provider_payment_id, account: null,
    };
    await expect(applyPaymentEvent(event)).rejects.toMatchObject({ status: 503 });
    await asOwner((c) => c.query(
      "insert into payments (restaurant_id, order_id, provider, provider_payment_id, amount_cents, fee_cents) values ($1, $2, 'fake', $3, $4, $5)",
      [a.restaurantId, orderId, event.providerPaymentId, payment.rows[0].amount_cents, payment.rows[0].fee_cents],
    ));
    await expect(applyPaymentEvent(event)).resolves.toBe("applied");
    await expect(applyPaymentEvent(event)).resolves.toBe("duplicate");
  });

  it("advances a retryable card failure after the next authorization", async () => {
    const { body } = await placeOrder();
    const orderId = await orderIdFor(body.order.number, a.restaurantId);
    const payment = await asOwner((c) => c.query("select provider_payment_id from payments where order_id = $1", [orderId]));
    await applyPaymentEvent({
      eventId: crypto.randomUUID(), type: "failed", retryable: true, orderId, restaurantId: a.restaurantId,
      providerPaymentId: payment.rows[0].provider_payment_id, account: null,
    });
    expect((await asOwner((c) => c.query("select status from orders where id = $1", [orderId]))).rows[0].status).toBe("pending_payment");
    await authorize(orderId, a.restaurantId);
    expect((await asOwner((c) => c.query("select status from orders where id = $1", [orderId]))).rows[0].status).toBe("awaiting_acceptance");
  });

  it("declining releases the hold and never captures", async () => {
    const { body } = await placeOrder();
    const id = await orderIdFor(body.order.number, a.restaurantId);
    await authorize(id, a.restaurantId);
    expect((await decline(req("POST", { token: ownerToken }), idCtx(id))).status).toBe(200);
    expect(provider.calls.map((c) => c.action)).toContain("cancel");
    expect(provider.calls.map((c) => c.action)).not.toContain("capture");
    expect((await asOwner((c) => c.query("select status from orders where id = $1", [id]))).rows[0].status).toBe("declined");
  });

  it("cannot accept an order twice or one that was never paid", async () => {
    const { body } = await placeOrder();
    const id = await orderIdFor(body.order.number, a.restaurantId);
    expect((await accept(req("POST", { token: ownerToken }), idCtx(id))).status).toBe(409);
    await authorize(id, a.restaurantId);
    expect((await accept(req("POST", { token: ownerToken }), idCtx(id))).status).toBe(200);
    expect((await accept(req("POST", { token: ownerToken }), idCtx(id))).status).toBe(409);
  });

  it("keeps the order waiting if the capture fails", async () => {
    const { body } = await placeOrder();
    const id = await orderIdFor(body.order.number, a.restaurantId);
    await authorize(id, a.restaurantId);
    provider.failCapture = true;
    expect((await accept(req("POST", { token: ownerToken }), idCtx(id))).status).toBe(502);
    expect((await asOwner((c) => c.query("select status from orders where id = $1", [id]))).rows[0].status).toBe("awaiting_acceptance");
  });

  it("a failed card marks the order failed", async () => {
    const { body } = await placeOrder();
    const id = await orderIdFor(body.order.number, a.restaurantId);
    await authorize(id, a.restaurantId, "failed");
    expect((await asOwner((c) => c.query("select status from orders where id = $1", [id]))).rows[0].status).toBe("payment_failed");
  });

  it("releases orders nobody answered, and refuses a late accept", async () => {
    const { body } = await placeOrder();
    const id = await orderIdFor(body.order.number, a.restaurantId);
    await authorize(id, a.restaurantId);
    await asOwner((c) => c.query("update orders set accept_deadline = now() - interval '1 minute' where id = $1", [id]));

    expect((await accept(req("POST", { token: ownerToken }), idCtx(id))).status).toBe(409);
    expect(provider.calls.map((c) => c.action)).not.toContain("capture");
    expect((await asOwner((c) => c.query("select status from orders where id = $1", [id]))).rows[0].status).toBe("expired");

    const second = await placeOrder();
    const id2 = await orderIdFor(second.body.order.number, a.restaurantId);
    await authorize(id2, a.restaurantId);
    await asOwner((c) => c.query("update orders set accept_deadline = now() - interval '1 minute' where id = $1", [id2]));
    expect(await expireStaleOrders()).toBeGreaterThanOrEqual(1);
    expect((await asOwner((c) => c.query("select status from orders where id = $1", [id2]))).rows[0].status).toBe("expired");
  });

  it("protects the expiry endpoint with a secret", async () => {
    expect((await cron(req("POST"), slugCtx(""))).status).toBe(401);
    expect((await cron(req("POST", { headers: { authorization: "Bearer test-cron-secret" } }), slugCtx(""))).status).toBe(200);
  });
});

describe("tenant isolation", () => {
  it("another restaurant's staff cannot see or decide these orders", async () => {
    const { body } = await placeOrder();
    const id = await orderIdFor(body.order.number, a.restaurantId);
    await authorize(id, a.restaurantId);
    const bToken = await signIn(b.ownerEmail);
    const queue = await (await listOrders(req("GET", { token: bToken }), slugCtx(""))).json();
    expect(queue.orders).toEqual([]);
    expect((await accept(req("POST", { token: bToken }), idCtx(id))).status).toBe(404);
  });

  it("an unknown or malformed order link shows nothing", async () => {
    expect((await orderStatus(req("GET"), { params: Promise.resolve({ token: "x".repeat(43) }) })).status).toBe(404);
    expect((await orderStatus(req("GET"), { params: Promise.resolve({ token: "short" }) })).status).toBe(404);
  });

  it("the app role sees no orders without a tenant", async () => {
    expect((await pool.query("select id from orders")).rows).toHaveLength(0);
  });
});

async function acceptedOrder() {
  const { body } = await placeOrder();
  const id = await orderIdFor(body.order.number, a.restaurantId);
  await authorize(id, a.restaurantId);
  expect((await accept(req("POST", { token: ownerToken, body: { prepMinutes: 25 } }), idCtx(id))).status).toBe(200);
  return { id, token: body.orderToken as string };
}
const statusOf = async (id: string) => (await asOwner((c) => c.query("select status from orders where id = $1", [id]))).rows[0].status;

describe("kitchen workflow", () => {
  it("stores the promised prep time and shows it to the customer", async () => {
    const { id, token } = await acceptedOrder();
    const view = await (await orderStatus(req("GET"), { params: Promise.resolve({ token }) })).json();
    expect(view.prepMinutes).toBe(25);
    expect(await statusOf(id)).toBe("accepted");
  });

  it("moves accepted -> ready -> completed and refuses going backwards", async () => {
    const { id } = await acceptedOrder();
    expect((await ready(req("POST", { token: ownerToken }), idCtx(id))).status).toBe(200);
    expect(await statusOf(id)).toBe("ready");
    expect((await ready(req("POST", { token: ownerToken }), idCtx(id))).status).toBe(409);
    expect((await complete(req("POST", { token: ownerToken }), idCtx(id))).status).toBe(200);
    expect(await statusOf(id)).toBe("completed");
    expect((await complete(req("POST", { token: ownerToken }), idCtx(id))).status).toBe(409);
    const queue = await (await listOrders(req("GET", { token: ownerToken }), slugCtx(""))).json();
    expect(queue.orders.map((o: { id: string }) => o.id)).not.toContain(id);
  });

  it("cannot mark an order ready before the kitchen accepted it", async () => {
    const { body } = await placeOrder();
    const id = await orderIdFor(body.order.number, a.restaurantId);
    await authorize(id, a.restaurantId);
    expect((await ready(req("POST", { token: ownerToken }), idCtx(id))).status).toBe(409);
  });

  it("cancelling an accepted order refunds the customer in full", async () => {
    const { id } = await acceptedOrder();
    expect((await cancelOrder(req("POST", { token: ownerToken }), idCtx(id))).status).toBe(200);
    expect(provider.calls.map((c) => c.action)).toContain("refund");
    const row = (await asOwner((c) => c.query("select o.status, p.status as pay from orders o join payments p on p.order_id = o.id where o.id = $1", [id]))).rows[0];
    expect(row).toMatchObject({ status: "cancelled", pay: "refunded" });
    expect((await cancelOrder(req("POST", { token: ownerToken }), idCtx(id))).status).toBe(409);
  });

  it("reconciles a pending refund and ignores stale capture after confirmation", async () => {
    const { body } = await placeOrder();
    const orderId = await orderIdFor(body.order.number, a.restaurantId);
    await authorize(orderId, a.restaurantId);
    await accept(req("POST", { token: ownerToken }), idCtx(orderId));
    const { rows: [payment] } = await asOwner((c) => c.query("select provider_payment_id from payments where order_id = $1", [orderId]));
    const refundEvent = {
      type: "refund" as const, orderId, restaurantId: a.restaurantId, providerPaymentId: payment.provider_payment_id, account: null,
    };
    await applyPaymentEvent({ ...refundEvent, eventId: crypto.randomUUID(), refund: { id: "pending", attempt: 1, status: "pending" } });
    let result = await (await orderStatus(req("GET"), { params: Promise.resolve({ token: body.orderToken }) })).json();
    expect(result).toMatchObject({ status: "cancelled", refundStatus: "pending" });
    await applyPaymentEvent({ ...refundEvent, eventId: crypto.randomUUID(), refund: { id: "pending", attempt: 1, status: "succeeded" } });
    await authorize(orderId, a.restaurantId, "captured");
    result = await (await orderStatus(req("GET"), { params: Promise.resolve({ token: body.orderToken }) })).json();
    expect(result).toMatchObject({ status: "cancelled", refundStatus: "succeeded" });
    expect((await asOwner((c) => c.query("select status from payments where order_id = $1", [orderId]))).rows[0].status).toBe("refunded");
  });

  it("keeps the order if the refund fails", async () => {
    const { id } = await acceptedOrder();
    provider.failRefund = true;
    expect((await cancelOrder(req("POST", { token: ownerToken }), idCtx(id))).status).toBe(502);
    provider.failRefund = false;
    expect(await statusOf(id)).toBe("accepted");
  });

  it("only owners can cancel, and other restaurants cannot touch the order", async () => {
    const { id } = await acceptedOrder();
    const staffToken = await signIn(a.staffEmail);
    expect((await cancelOrder(req("POST", { token: staffToken }), idCtx(id))).status).toBe(403);
    expect((await ready(req("POST", { token: staffToken }), idCtx(id))).status).toBe(200);
    const bToken = await signIn(b.ownerEmail);
    expect((await complete(req("POST", { token: bToken }), idCtx(id))).status).toBe(404);
    expect((await cancelOrder(req("POST", { token: bToken }), idCtx(id))).status).toBe(404);
  });

  it("reconciles pending refunds through the worker if no webhook arrives", async () => {
    const { body } = await placeOrder();
    const id = await orderIdFor(body.order.number, a.restaurantId);
    await authorize(id, a.restaurantId);
    await accept(req("POST", { token: ownerToken }), idCtx(id));
    await asOwner((c) => c.query(
      "update payments set provider = 'stripe', refund_id = 'refund-fixture', refund_status = 'pending', refund_attempt = 1 where order_id = $1",
      [id],
    ));
    const retrieve = vi.spyOn(StripeProvider.prototype, "retrieveRefund")
      .mockResolvedValue({ id: "refund-fixture", status: "succeeded" });
    vi.stubEnv("PAYMENTS_PROVIDER", "stripe");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
    resetProviderForTests();
    try {
      expect(await reconcilePendingRefunds()).toBe(1);
      expect(retrieve).toHaveBeenCalledWith("refund-fixture", null);
      expect((await asOwner((c) => c.query("select status, refund_status from payments where order_id = $1", [id]))).rows[0])
        .toEqual({ status: "refunded", refund_status: "succeeded" });
    } finally {
      retrieve.mockRestore();
      vi.unstubAllEnvs();
      resetProviderForTests();
      provider = await getProvider() as FakeProvider;
    }
  });

});
