import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { priceCart, type MenuTree } from "../lib/cart";
import { SESSION_COOKIE, consumeLoginToken, requestLogin } from "../lib/auth";
import { pool } from "../lib/db";
import { outbox } from "../lib/mailer";
import { manualRule, normalizeCode, promoRule, type Promo } from "../lib/promos";
import { GET as listPromos, POST as createPromo } from "../app/api/staff/promos/route";
import { PUT as updatePromo, DELETE as deletePromo } from "../app/api/staff/promos/[id]/route";
import { POST as quote } from "../app/api/r/[slug]/quote/route";
import { POST as checkout } from "../app/api/r/[slug]/checkout/route";
import { PUT as putHours } from "../app/api/staff/hours/route";
import { asOwner, createFixture, deleteFixture, type Fixture } from "./helpers";

const menu = [{ id: "c1", name: "Mains", sortOrder: 0, items: [{ id: "i1", name: "Bowl", priceCents: 1000, available: true, modifierGroups: [] }] }] as unknown as MenuTree;
const promo = (over: Partial<Promo> = {}): Promo => ({ id: "p1", restaurantId: "r", code: "SAVE10", kind: "percent", value: 10, minSubtotalCents: 0, active: true, expiresAt: null, maxUses: null, uses: 0, createdAt: new Date(), updatedAt: new Date(), ...over });
const line = [{ itemId: "i1", quantity: 2, optionIds: [] }];

describe("pricing with a discount", () => {
  it("takes the discount off the food first, then taxes what is left; tips are never taxed", () => {
    const cart = priceCart(menu, line, { taxRateBps: 1000, tipCents: 300, discount: promoRule(promo()) });
    expect(cart).toMatchObject({ subtotalCents: 2000, discountCents: 200, discountLabel: "Promo SAVE10", taxCents: 180, totalCents: 2000 - 200 + 180 + 300 });
  });
  it("never discounts more than the food, so a total cannot go negative", () => {
    const cart = priceCart(menu, line, { taxRateBps: 1000, discount: promoRule(promo({ kind: "fixed", value: 99_999 })) });
    expect(cart).toMatchObject({ discountCents: 2000, taxCents: 0, totalCents: 0 });
  });
  it("rounds a percentage half up", () => {
    expect(priceCart(menu, [{ itemId: "i1", quantity: 1, optionIds: [] }], { taxRateBps: 0, discount: promoRule(promo({ value: 15 })) }).discountCents).toBe(150);
    expect(priceCart(menu, [{ itemId: "i1", quantity: 1, optionIds: [] }], { taxRateBps: 0, discount: manualRule("percent", 33) }).discountCents).toBe(330);
  });
  it("does nothing without a discount", () => {
    expect(priceCart(menu, line, { taxRateBps: 0 })).toMatchObject({ discountCents: 0, discountLabel: null, totalCents: 2000 });
  });
});

describe("when a code does not apply", () => {
  const reason = (p: Promo | null, subtotal = 2000) => {
    try {
      promoRule(p, new Date("2026-06-01T00:00:00Z"))(subtotal);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };
  it("explains why", () => {
    expect(reason(null)).toMatch(/isn't valid/);
    expect(reason(promo({ active: false }))).toMatch(/isn't valid/);
    expect(reason(promo({ expiresAt: new Date("2026-05-01T00:00:00Z") }))).toMatch(/expired/);
    expect(reason(promo({ maxUses: 5, uses: 5 }))).toMatch(/limit/);
    expect(reason(promo({ minSubtotalCents: 3000 }))).toMatch(/Spend \$30\.00 or more/);
    expect(reason(promo())).toBeNull();
  });
  it("ignores case and spaces in what a customer types", () => {
    expect(normalizeCode("  save 10 ")).toBe("SAVE10");
  });
});

let a: Fixture;
let b: Fixture;
let ownerToken: string;
let staffToken: string;
let otherOwner: string;
let slugA: string;

async function signIn(email: string) {
  outbox.length = 0;
  await requestLogin(email);
  return (await consumeLoginToken(new URL(outbox[0].url).searchParams.get("token")!))!.sessionToken;
}
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
const staffReq = (method: string, token: string | null, body?: unknown) =>
  new Request("http://localhost/x", { method, headers: { "content-type": "application/json", ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) } as Record<string, string>, body: body === undefined ? undefined : JSON.stringify(body) });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const slugCtx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const q = async (body: Record<string, unknown>) => {
  const res = await quote(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify(body) }), slugCtx(slugA));
  return { res, body: await res.json() };
};

beforeAll(async () => {
  a = await createFixture("promo-a");
  b = await createFixture("promo-b");
  slugA = (await asOwner((c) => c.query("select slug from restaurants where id = $1", [a.restaurantId]))).rows[0].slug;
  await asOwner((c) => c.query("update restaurants set tax_rate_bps = 1000 where id = $1", [a.restaurantId]));
  ownerToken = await signIn(a.ownerEmail);
  staffToken = await signIn(a.staffEmail);
  const periods = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: "00:00", closes: "23:45" }));
  expect((await putHours(staffReq("PUT", ownerToken, { periods }), {})).status).toBe(200);
  otherOwner = await signIn(b.ownerEmail);
});
afterAll(async () => {
  await deleteFixture(a);
  await deleteFixture(b);
  await pool.end();
});

describe("managing codes", () => {
  it("lets only the owner create, change and delete codes, and rejects bad input", async () => {
    expect((await createPromo(staffReq("POST", staffToken, { code: "AAA", kind: "percent", value: 5 }), {})).status).toBe(403);
    const made = await createPromo(staffReq("POST", ownerToken, { code: "welcome10", kind: "percent", value: 10 }), {});
    expect(made.status).toBe(201);
    const row = await made.json();
    expect(row).toMatchObject({ code: "WELCOME10", uses: 0, active: true });
    expect((await createPromo(staffReq("POST", ownerToken, { code: "WELCOME10", kind: "fixed", value: 100 }), {})).status).toBe(409);
    expect((await createPromo(staffReq("POST", ownerToken, { code: "BIG", kind: "percent", value: 150 }), {})).status).toBe(400);
    expect((await createPromo(staffReq("POST", ownerToken, { code: "bad code!", kind: "fixed", value: 100 }), {})).status).toBe(400);
    expect((await updatePromo(staffReq("PUT", ownerToken, { value: 20 }), idCtx(row.id))).status).toBe(200);
    expect((await updatePromo(staffReq("PUT", otherOwner, { value: 99 }), idCtx(row.id))).status).toBe(404);
    expect((await listPromos(staffReq("GET", otherOwner), {}).then((r) => r.json())).length).toBe(0);
    expect((await deletePromo(staffReq("DELETE", ownerToken), idCtx(row.id))).status).toBe(200);
  });
});

describe("using a code at the storefront", () => {
  let code: string;
  beforeAll(async () => {
    const made = await createPromo(staffReq("POST", ownerToken, { code: "TENOFF", kind: "percent", value: 10, maxUses: 2 }), {});
    code = (await made.json()).code;
  });
  const items = (quantity: number) => [{ itemId: a.itemId, quantity }];

  it("prices with the code, and reports a wrong code without breaking the quote", async () => {
    const good = await q({ items: items(2), promoCode: "tenoff" });
    expect(good.body).toMatchObject({ subtotalCents: 2000, discountCents: 200, discountLabel: "Promo TENOFF", taxCents: 180, totalCents: 1980, promoError: null });
    const bad = await q({ items: items(2), promoCode: "NOPE" });
    expect(bad.res.status).toBe(200);
    expect(bad.body).toMatchObject({ discountCents: 0, totalCents: 2200, promoError: expect.stringMatching(/isn't valid/) });
  });

  it("limits wrong guesses", async () => {
    await asOwner((c) => c.query("delete from request_rate_windows"));
    const fixedIp = ip();
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await quote(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": fixedIp }, body: JSON.stringify({ items: items(1), promoCode: `GUESS${i}` }) }), slugCtx(slugA));
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 8).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(8)).toEqual([429, 429]);
  });

  async function order(promoCode: string | undefined) {
    const res = await checkout(
      new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID(), "x-forwarded-for": ip() }, body: JSON.stringify({ items: items(2), customer: { name: "Mai", phone: "918-555-0100" }, ...(promoCode ? { promoCode } : {}) }) }),
      slugCtx(slugA),
    );
    return { res, body: await res.json() };
  }

  it("saves the discount on the order, counts the use, and keeps the fee on the full price of the food", async () => {
    await asOwner((c) => c.query("update restaurants set fee_model = 'platform_plus_processing', platform_fee_bps = 300 where id = $1", [a.restaurantId]));
    const { res, body } = await order(code);
    expect(res.status).toBe(201);
    expect(body.order.totalCents).toBe(1980);
    const row = (await asOwner((c) => c.query("select subtotal_cents, discount_cents, promo_code, tax_cents, fee_cents from orders where restaurant_id = $1 and number = $2", [a.restaurantId, body.order.number]))).rows[0];
    expect(row).toMatchObject({ subtotal_cents: 2000, discount_cents: 200, promo_code: "TENOFF", tax_cents: 180, fee_cents: 60 }); // 3% of the full 2000, not of the 1800 after the code
    expect((await asOwner((c) => c.query("select uses from promo_codes where code = 'TENOFF'"))).rows[0].uses).toBe(1);
  });

  it("stops accepting the code once its limit is reached", async () => {
    expect((await order(code)).res.status).toBe(201);
    const third = await order(code);
    expect(third.res.status).toBe(422);
    expect(third.body.issues[0].message).toMatch(/limit/);
    expect((await asOwner((c) => c.query("select uses from promo_codes where code = 'TENOFF'"))).rows[0].uses).toBe(2);
  });

  it("rejects an unknown code at checkout instead of ignoring it", async () => {
    const res = await order("MISSING");
    expect(res.res.status).toBe(422);
    expect(res.body.issues[0].message).toMatch(/isn't valid/);
  });
});
