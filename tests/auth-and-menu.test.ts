import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE, consumeLoginToken, requestLogin } from "../lib/auth";
import { pool } from "../lib/db";
import { outbox } from "../lib/mailer";
import { GET as getMenu } from "../app/api/staff/menu/route";
import { POST as createItem } from "../app/api/staff/menu/items/route";
import { PATCH as setAvailability } from "../app/api/staff/menu/items/[id]/availability/route";
import { POST as createCategory } from "../app/api/staff/menu/categories/route";
import { DELETE as deleteCategory } from "../app/api/staff/menu/categories/[id]/route";
import { POST as createGroup } from "../app/api/staff/menu/items/[id]/modifier-groups/route";
import { POST as createOption } from "../app/api/staff/menu/modifier-groups/[id]/options/route";
import { asOwner, createFixture, deleteFixture, type Fixture } from "./helpers";

let f: Fixture;
let other: Fixture;
let ownerToken: string;
let staffToken: string;

async function signIn(email: string): Promise<string> {
  outbox.length = 0;
  await requestLogin(email);
  expect(outbox).toHaveLength(1);
  const token = new URL(outbox[0].url).searchParams.get("token")!;
  const session = await consumeLoginToken(token);
  expect(session).not.toBeNull();
  return session!.sessionToken;
}

const call = (
  handler: (req: Request, ctx: unknown) => Promise<Response>,
  method: string,
  token: string | null,
  body?: unknown,
  id?: string,
) =>
  handler(
    new Request("http://localhost/test", {
      method,
      headers: { "content-type": "application/json", ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: id ?? "" }) },
  );

beforeAll(async () => {
  f = await createFixture("menu");
  other = await createFixture("other");
  ownerToken = await signIn(f.ownerEmail);
  staffToken = await signIn(f.staffEmail);
});

afterAll(async () => {
  await deleteFixture(f);
  await deleteFixture(other);
  await pool.end();
});

describe("login", () => {
  it("sends nothing and reveals nothing for an unknown email", async () => {
    outbox.length = 0;
    await requestLogin("nobody@example.com");
    expect(outbox).toHaveLength(0);
  });

  it("makes a link usable once only", async () => {
    outbox.length = 0;
    await requestLogin(f.ownerEmail);
    const token = new URL(outbox[0].url).searchParams.get("token")!;
    expect(await consumeLoginToken(token)).not.toBeNull();
    expect(await consumeLoginToken(token)).toBeNull();
  });

  it("rejects an expired link", async () => {
    outbox.length = 0;
    await requestLogin(f.ownerEmail);
    const token = new URL(outbox[0].url).searchParams.get("token")!;
    await asOwner((c) => c.query("update login_tokens set expires_at = now() - interval '1 minute'"));
    expect(await consumeLoginToken(token)).toBeNull();
  });

  it("does not store raw tokens", async () => {
    const { rows } = await pool.query("select token_hash from sessions limit 1");
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("menu API access", () => {
  it("rejects requests with no session", async () => {
    expect((await call(getMenu, "GET", null)).status).toBe(401);
  });

  it("lets staff read the menu but only their own restaurant's", async () => {
    const res = await call(getMenu, "GET", staffToken);
    expect(res.status).toBe(200);
    const menu = await res.json();
    expect(menu).toHaveLength(1);
    expect(menu[0].items[0].id).toBe(f.itemId);
  });

  it("blocks staff from creating items but lets the owner", async () => {
    const body = { categoryId: f.categoryId, name: "New dish", priceCents: 1250 };
    expect((await call(createItem, "POST", staffToken, body)).status).toBe(403);
    const res = await call(createItem, "POST", ownerToken, body);
    expect(res.status).toBe(201);
    expect((await res.json()).priceCents).toBe(1250);
  });

  it("validates input", async () => {
    const res = await call(createItem, "POST", ownerToken, { categoryId: f.categoryId, name: "", priceCents: -5 });
    expect(res.status).toBe(400);
  });

  it("will not attach an item to another restaurant's category", async () => {
    const res = await call(createItem, "POST", ownerToken, { categoryId: other.categoryId, name: "Cross", priceCents: 100 });
    expect(res.status).toBe(409);
  });

  it("lets kitchen staff mark an item sold out, but not another restaurant's item", async () => {
    const ok = await call(setAvailability, "PATCH", staffToken, { available: false }, f.itemId);
    expect(ok.status).toBe(200);
    expect((await ok.json()).available).toBe(false);
    const foreign = await call(setAvailability, "PATCH", staffToken, { available: false }, other.itemId);
    expect(foreign.status).toBe(404);
  });

  it("builds a modifier group with options and returns them nested", async () => {
    const group = await (await call(createGroup, "POST", ownerToken, { name: "Spice", minChoices: 1, maxChoices: 1 }, f.itemId)).json();
    const optRes = await call(createOption, "POST", ownerToken, { name: "Hot", priceDeltaCents: 50 }, group.id);
    expect(optRes.status).toBe(201);
    const menu = await (await call(getMenu, "GET", ownerToken)).json();
    const dish = menu[0].items.find((i: { id: string }) => i.id === f.itemId);
    expect(dish.modifierGroups[0].options[0].name).toBe("Hot");
  });

  it("rejects an option for another restaurant's group", async () => {
    const group = await asOwner((c) =>
      c
        .query("insert into modifier_groups (restaurant_id, item_id, name) values ($1, $2, 'G') returning id", [other.restaurantId, other.itemId])
        .then((r) => r.rows[0].id as string),
    );
    const res = await call(createOption, "POST", ownerToken, { name: "X" }, group);
    expect(res.status).toBe(409);
  });

  it("refuses to delete a category that still has items", async () => {
    expect((await call(deleteCategory, "DELETE", ownerToken, undefined, f.categoryId)).status).toBe(409);
  });

  it("creates and deletes an empty category", async () => {
    const created = await (await call(createCategory, "POST", ownerToken, { name: "Desserts" })).json();
    expect((await call(deleteCategory, "DELETE", ownerToken, undefined, created.id)).status).toBe(200);
  });
});
