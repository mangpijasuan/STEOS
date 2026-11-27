import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE, consumeLoginToken, requestLogin } from "../lib/auth";
import { pool } from "../lib/db";
import { outbox } from "../lib/mailer";
import { GET as publicMenu } from "../app/api/r/[slug]/menu/route";
import { GET as publicSlots } from "../app/api/r/[slug]/pickup-slots/route";
import { POST as quote } from "../app/api/r/[slug]/quote/route";
import { GET as getSettings, PATCH as patchSettings } from "../app/api/staff/settings/route";
import { GET as getHours, PUT as putHours } from "../app/api/staff/hours/route";
import { asOwner, createFixture, deleteFixture, type Fixture } from "./helpers";

let a: Fixture;
let b: Fixture;
let slugA: string;
let ownerToken: string;
let staffToken: string;

async function signIn(email: string) {
  outbox.length = 0;
  await requestLogin(email);
  const token = new URL(outbox[0].url).searchParams.get("token")!;
  return (await consumeLoginToken(token))!.sessionToken;
}

const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const req = (method: string, token: string | null, body?: unknown) =>
  new Request("http://localhost/test", {
    method,
    headers: { "content-type": "application/json", ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const everyDay = (opens: string, closes: string) => [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens, closes }));

beforeAll(async () => {
  a = await createFixture("store-a");
  b = await createFixture("store-b");
  slugA = (await asOwner((c) => c.query("select slug from restaurants where id = $1", [a.restaurantId]))).rows[0].slug;
  ownerToken = await signIn(a.ownerEmail);
  staffToken = await signIn(a.staffEmail);
  // open around the clock so slot tests do not depend on when they run
  const res = await putHours(req("PUT", ownerToken, { periods: everyDay("00:00", "23:45") }), ctx(""));
  expect(res.status).toBe(200);
});

afterAll(async () => {
  await deleteFixture(a);
  await deleteFixture(b);
  await pool.end();
});

describe("public menu", () => {
  it("returns the menu without internal ids of other tenants", async () => {
    const res = await publicMenu(req("GET", null), ctx(slugA));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.restaurant.slug).toBe(slugA);
    expect(body.categories[0].items.map((i: { id: string }) => i.id)).toEqual([a.itemId]);
    expect(JSON.stringify(body)).not.toContain(a.restaurantId);
    expect(JSON.stringify(body)).not.toContain(b.itemId);
  });

  it("returns 404 for unknown or malformed slugs", async () => {
    expect((await publicMenu(req("GET", null), ctx("no-such-place"))).status).toBe(404);
    expect((await publicMenu(req("GET", null), ctx("a'; drop table restaurants;--"))).status).toBe(404);
  });
});

describe("quote", () => {
  it("prices a cart from server-side prices", async () => {
    const res = await quote(req("POST", null, { items: [{ itemId: a.itemId, quantity: 2 }] }), ctx(slugA));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subtotalCents).toBe(2000);
    expect(body.totalCents).toBe(2000 + body.taxCents);
  });

  it("rejects an item from another restaurant", async () => {
    const res = await quote(req("POST", null, { items: [{ itemId: b.itemId, quantity: 1 }] }), ctx(slugA));
    expect(res.status).toBe(422);
    expect((await res.json()).issues[0].message).toMatch(/no longer/);
  });

  it("rejects bad input", async () => {
    expect((await quote(req("POST", null, { items: [{ itemId: a.itemId, quantity: 0 }] }), ctx(slugA))).status).toBe(400);
  });

  it("accepts an offered pickup time and rejects an invented one", async () => {
    const slots = (await (await publicSlots(req("GET", null), ctx(slugA))).json()).slots as string[];
    expect(slots.length).toBeGreaterThan(0);
    const ok = await quote(req("POST", null, { items: [{ itemId: a.itemId, quantity: 1 }], pickupTime: slots[3] }), ctx(slugA));
    expect(ok.status).toBe(200);
    const bad = await quote(req("POST", null, { items: [{ itemId: a.itemId, quantity: 1 }], pickupTime: "2020-01-01T00:00:00Z" }), ctx(slugA));
    expect(bad.status).toBe(422);
  });
});

describe("pausing and settings", () => {
  it("lets kitchen staff pause ordering, which empties pickup slots", async () => {
    expect((await patchSettings(req("PATCH", staffToken, { acceptingOrders: false }), ctx(""))).status).toBe(200);
    const body = await (await publicSlots(req("GET", null), ctx(slugA))).json();
    expect(body.orderingOpen).toBe(false);
    expect(body.slots).toEqual([]);
    expect((await patchSettings(req("PATCH", staffToken, { acceptingOrders: true }), ctx(""))).status).toBe(200);
  });

  it("keeps other settings owner-only", async () => {
    expect((await patchSettings(req("PATCH", staffToken, { minPrepMinutes: 45 }), ctx(""))).status).toBe(403);
    const res = await patchSettings(req("PATCH", ownerToken, { minPrepMinutes: 45 }), ctx(""));
    expect(res.status).toBe(200);
    expect((await res.json()).minPrepMinutes).toBe(45);
    expect((await (await getSettings(req("GET", staffToken), ctx(""))).json()).minPrepMinutes).toBe(45);
  });

  it("lets the owner change the time zone, rejects unknown zones and keeps it owner-only", async () => {
    expect((await patchSettings(req("PATCH", staffToken, { timezone: "America/Denver" }), ctx(""))).status).toBe(403);
    expect((await patchSettings(req("PATCH", ownerToken, { timezone: "Not/AZone" }), ctx(""))).status).toBe(400);
    const res = await patchSettings(req("PATCH", ownerToken, { timezone: "America/Denver" }), ctx(""));
    expect(res.status).toBe(200);
    expect((await res.json()).timezone).toBe("America/Denver");
    expect((await (await getSettings(req("GET", staffToken), ctx(""))).json()).timezone).toBe("America/Denver");
    expect((await patchSettings(req("PATCH", ownerToken, { timezone: "America/Chicago" }), ctx(""))).status).toBe(200);
  });

  it("requires sign-in", async () => {
    expect((await getSettings(req("GET", null), ctx(""))).status).toBe(401);
  });
});

describe("hours", () => {
  it("is owner-only to change, any staff to read", async () => {
    expect((await putHours(req("PUT", staffToken, { periods: [] }), ctx(""))).status).toBe(403);
    expect((await getHours(req("GET", staffToken), ctx(""))).status).toBe(200);
  });

  it("rejects overlapping and backwards periods", async () => {
    const overlap = [
      { weekday: 1, opens: "09:00", closes: "12:00" },
      { weekday: 1, opens: "11:00", closes: "14:00" },
    ];
    expect((await putHours(req("PUT", ownerToken, { periods: overlap }), ctx(""))).status).toBe(400);
    expect((await putHours(req("PUT", ownerToken, { periods: [{ weekday: 1, opens: "12:00", closes: "09:00" }] }), ctx(""))).status).toBe(400);
  });

  it("does not touch another restaurant's hours", async () => {
    const before = await asOwner((c) => c.query("select count(*)::int n from business_hours where restaurant_id = $1", [b.restaurantId]));
    await putHours(req("PUT", ownerToken, { periods: [{ weekday: 2, opens: "10:00", closes: "14:00" }] }), ctx(""));
    const after = await asOwner((c) => c.query("select count(*)::int n from business_hours where restaurant_id = $1", [b.restaurantId]));
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});
