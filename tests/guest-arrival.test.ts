import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE, consumeLoginToken, requestLogin } from "../lib/auth";
import { pool, withTenant } from "../lib/db";
import { outbox } from "../lib/mailer";
import { ARRIVAL_NOTE_MAX, cleanArrivalNote, listActiveOrders } from "../lib/orders";
import { POST as checkout } from "../app/api/r/[slug]/checkout/route";
import { POST as webhook } from "../app/api/webhooks/stripe/route";
import { POST as arrived } from "../app/api/orders/[token]/arrived/route";
import { GET as orderStatus } from "../app/api/orders/[token]/route";
import { POST as accept } from "../app/api/staff/orders/[id]/accept/route";
import { POST as ready } from "../app/api/staff/orders/[id]/ready/route";
import { POST as complete } from "../app/api/staff/orders/[id]/complete/route";
import { POST as cancelOrder } from "../app/api/staff/orders/[id]/cancel/route";
import { POST as posOrder } from "../app/api/staff/pos/orders/route";
import { PUT as putHours } from "../app/api/staff/hours/route";
import { asOwner, createFixture, deleteFixture, type Fixture } from "./helpers";

let a: Fixture;
let b: Fixture;
let slugA: string;
let owner: string;
let ownerB: string;

async function signIn(email: string) {
  outbox.length = 0;
  await requestLogin(email);
  return (await consumeLoginToken(new URL(outbox[0].url).searchParams.get("token")!))!.sessionToken;
}
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const tokenCtx = (token: string) => ({ params: Promise.resolve({ token }) });
const slugCtx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const req = (method: string, opts: { token?: string | null; body?: unknown; headers?: Record<string, string> } = {}) =>
  new Request("http://localhost/test", {
    method,
    headers: { "content-type": "application/json", ...(opts.token ? { cookie: `${SESSION_COOKIE}=${opts.token}` } : {}), ...opts.headers },
    body: opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
  });

let n = 0;
/** A pickup order the kitchen has not seen yet: returns its id and the guest's private link token. */
async function pickupOrder(f: Fixture = a, slug = slugA) {
  const res = await checkout(req("POST", { body: { items: [{ itemId: f.itemId, quantity: 1 }], customer: { name: "Mai", phone: "918-555-0100" } }, headers: { "idempotency-key": `arr-${Date.now()}-${n++}`, "x-forwarded-for": `10.${n % 250}.1.1` } }), slugCtx(slug));
  expect(res.status).toBe(201);
  const body = await res.json();
  const id = (await asOwner((c) => c.query("select id from orders where restaurant_id = $1 and number = $2", [f.restaurantId, body.order.number]))).rows[0].id as string;
  const pay = await asOwner((c) => c.query("select provider_payment_id from payments where order_id = $1", [id]));
  await webhook(req("POST", { body: { eventId: `evt-${crypto.randomUUID()}`, type: "authorized", providerPaymentId: pay.rows[0].provider_payment_id, restaurantId: f.restaurantId, orderId: id, account: null } }), slugCtx(""));
  return { id, token: body.orderToken as string };
}
const accepted = async (f: Fixture = a, tok = owner) => {
  const o = await pickupOrder(f, f === a ? slugA : slugB);
  expect((await accept(req("POST", { token: tok, body: { prepMinutes: 10 } }), idCtx(o.id))).status).toBe(200);
  return o;
};
let slugB: string;
const here = (token: string, note?: string, headers: Record<string, string> = {}) =>
  arrived(req("POST", { body: note === undefined ? {} : { note }, headers: { "x-forwarded-for": `10.${n++ % 250}.2.1`, ...headers } }), tokenCtx(token));

beforeAll(async () => {
  a = await createFixture("arr-a");
  b = await createFixture("arr-b");
  slugA = (await asOwner((c) => c.query("select slug from restaurants where id = $1", [a.restaurantId]))).rows[0].slug;
  slugB = (await asOwner((c) => c.query("select slug from restaurants where id = $1", [b.restaurantId]))).rows[0].slug;
  owner = await signIn(a.ownerEmail);
  ownerB = await signIn(b.ownerEmail);
  const periods = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: "00:00", closes: "23:45" }));
  for (const t of [owner, ownerB]) expect((await putHours(req("PUT", { token: t, body: { periods } }), slugCtx(""))).status).toBe(200);
});
afterAll(async () => {
  await deleteFixture(a);
  await deleteFixture(b);
  await pool.end();
});

describe("the arrival note", () => {
  it("is tidied: control characters and extra spaces go, empty means none, and it is capped at 60", () => {
    expect(cleanArrivalNote("  Blue   car,\n space\t4 ")).toBe("Blue car, space 4");
    expect(cleanArrivalNote("a\u0000b")).toBe("a b");
    expect(cleanArrivalNote("a\u202eb\u200bc\u2066d\ufeffe")).toBe("abcde"); // direction overrides and invisible characters are removed
    expect(cleanArrivalNote("\u200b\u202e")).toBeNull();
    for (const empty of [undefined, null, "", "   \n\t "]) expect(cleanArrivalNote(empty)).toBeNull();
    expect(cleanArrivalNote("x".repeat(ARRIVAL_NOTE_MAX))).toHaveLength(60);
    expect(() => cleanArrivalNote("x".repeat(ARRIVAL_NOTE_MAX + 1))).toThrow(/under 61/);
  });
});

describe("a pickup guest telling the kitchen they have arrived", () => {
  it("is refused until the kitchen has accepted the order", async () => {
    const o = await pickupOrder();
    const res = await here(o.token);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/hasn't accepted/);
    expect((await asOwner((c) => c.query("select arrived_at from orders where id=$1", [o.id]))).rows[0].arrived_at).toBeNull();
  });

  it("records the arrival and note, shows it to the kitchen and to the guest, and works for a ready order too", async () => {
    const o = await accepted();
    const res = await here(o.token, "  Blue car,  space 4 ");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.arrivedNote).toBe("Blue car, space 4");
    expect(Date.now() - new Date(body.arrivedAt).getTime()).toBeLessThan(10_000);
    const guest = await (await orderStatus(req("GET"), tokenCtx(o.token))).json();
    expect(guest).toMatchObject({ arrivedAt: body.arrivedAt, arrivedNote: "Blue car, space 4" });
    const list = await withTenant(a.restaurantId, (db) => listActiveOrders(db));
    expect(list.orders.find((x) => x.id === o.id)).toMatchObject({ arrivedAt: body.arrivedAt, arrivedNote: "Blue car, space 4" });
    expect((await ready(req("POST", { token: owner }), idCtx(o.id))).status).toBe(200);
    expect((await here(o.token)).status).toBe(200); // still fine once the order is ready, and unchanged
    const r = await (await orderStatus(req("GET"), tokenCtx(o.token))).json();
    expect(r.arrivedAt).toBe(body.arrivedAt);
  });

  it("happens once: pressing again, or at the same moment from many taps, keeps the first time and note", async () => {
    const o = await accepted();
    const results = await Promise.all([here(o.token, "first"), here(o.token, "second"), here(o.token, "third"), here(o.token), here(o.token, "fifth")]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const bodies = await Promise.all(results.map((r) => r.json()));
    expect(new Set(bodies.map((x) => x.arrivedAt)).size).toBe(1);
    expect(new Set(bodies.map((x) => x.arrivedNote)).size).toBe(1);
    expect(["first", "second", "third", "fifth", null]).toContain(bodies[0].arrivedNote);
    const row = (await asOwner((c) => c.query("select arrived_at, arrived_note from orders where id=$1", [o.id]))).rows[0];
    expect(row.arrived_note).toBe(bodies[0].arrivedNote);
    const again = await (await here(o.token, "changed my mind")).json();
    expect(again).toEqual(bodies[0]);
  });

  it("is refused for orders that are not an active pickup", async () => {
    const o = await accepted();
    expect((await ready(req("POST", { token: owner }), idCtx(o.id))).status).toBe(200);
    expect((await complete(req("POST", { token: owner }), idCtx(o.id))).status).toBe(200);
    expect((await here(o.token)).status).toBe(409); // picked up already
    const c = await accepted();
    expect((await cancelOrder(req("POST", { token: owner, body: {} }), idCtx(c.id))).status).toBe(200);
    expect((await here(c.token)).status).toBe(409); // cancelled
    // a till takeaway order has a link too, but is not a pickup
    const till = await posOrder(req("POST", { token: owner, body: { items: [{ itemId: a.itemId, quantity: 1, optionIds: [] }], orderType: "counter", customerName: "Walk-in", payment: { mode: "later" } }, headers: { "idempotency-key": `arr-till-${Date.now()}` } }), {} as never);
    expect(till.status).toBe(201);
  });

  it("rejects bad input and unknown links without touching anything", async () => {
    const o = await accepted();
    expect((await here(o.token, "x".repeat(61))).status).toBe(400);
    expect((await arrived(req("POST", { body: { note: "ok", extra: 1 }, headers: { "x-forwarded-for": "10.9.9.9" } }), tokenCtx(o.token))).status).toBe(400);
    for (const bad of ["short", "has spaces in it padded to be long enough", `${"A".repeat(30)}!`, "A".repeat(101)]) expect((await here(bad)).status, bad).toBe(404);
    expect((await here("A".repeat(43))).status).toBe(404); // well-formed but unknown
    expect((await asOwner((c) => c.query("select arrived_at from orders where id=$1", [o.id]))).rows[0].arrived_at).toBeNull();
  });

  it("is rate limited per link", async () => {
    const o = await accepted();
    const codes: number[] = [];
    for (let i = 0; i < 14; i++) codes.push((await here(o.token, undefined, { "x-forwarded-for": `10.${100 + i}.3.1` })).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes.slice(10)).toContain(429);
  });

  it("never reaches another restaurant: a link only ever opens its own order, and other kitchens see nothing", async () => {
    const mine = await accepted();
    const theirs = await accepted(b, ownerB);
    expect((await here(mine.token, "mine")).status).toBe(200);
    const rows = (await asOwner((c) => c.query("select restaurant_id, arrived_at is not null as arrived from orders where id = any($1)", [[mine.id, theirs.id]]))).rows;
    expect(rows.find((r) => r.restaurant_id === a.restaurantId)).toMatchObject({ arrived: true });
    expect(rows.find((r) => r.restaurant_id === b.restaurantId)).toMatchObject({ arrived: false });
    const listB = await withTenant(b.restaurantId, (db) => listActiveOrders(db));
    expect(listB.orders.some((x) => x.id === mine.id)).toBe(false);
    expect(listB.orders.every((x) => x.arrivedAt === null)).toBe(true);
  });

  it("the database refuses a note without an arrival time, or one that is too long", async () => {
    const o = await accepted();
    await expect(asOwner((c) => c.query("update orders set arrived_note='x' where id=$1", [o.id]))).rejects.toThrow(/needs_arrival/);
    await expect(asOwner((c) => c.query("update orders set arrived_at=now(), arrived_note=$2 where id=$1", [o.id, "x".repeat(61)]))).rejects.toThrow(/length/);
  });
});
