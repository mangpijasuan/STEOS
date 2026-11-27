import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE, consumeLoginToken, requestLogin } from "../lib/auth";
import { outbox } from "../lib/mailer";
import { pool, withTenant } from "../lib/db";
import { sql } from "drizzle-orm";
import { GET, POST } from "../app/api/staff/pos/held/route";
import { PATCH } from "../app/api/staff/pos/held/[id]/route";
import { POST as submit } from "../app/api/staff/pos/orders/route";
import { asOwner, createFixture, deleteFixture, type Fixture } from "./helpers";

let a: Fixture, b: Fixture;
let first: string, second: string, outsider: string;
async function signIn(email: string) {
  outbox.length = 0; await requestLogin(email);
  return (await consumeLoginToken(new URL(outbox[0].url).searchParams.get("token")!))!.sessionToken;
}
const req = (method: string, token: string, body?: unknown) => new Request("http://localhost/x", { method, headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}`, "idempotency-key": crypto.randomUUID() }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const payload = () => ({ items: [{ itemId: a.itemId, quantity: 2, optionIds: [], note: "No onions" }], orderType: "counter", customerName: "Draft guest" });
const make = async () => { const id = crypto.randomUUID(); expect((await POST(req("POST", first, { id, payload: payload() }), {})).status).toBe(201); return id; };
const change = (token: string, id: string, data: unknown) => PATCH(req("PATCH", token, data), ctx(id));
const send = (token: string, heldTicket: unknown) => submit(req("POST", token, { ...payload(), payment: { mode: "later" }, heldTicket }), {});
beforeAll(async () => { a = await createFixture("held-a"); b = await createFixture("held-b"); first = await signIn(a.staffEmail); second = await signIn(a.ownerEmail); outsider = await signIn(b.ownerEmail); });
afterAll(async () => { await deleteFixture(a); await deleteFixture(b); await pool.end(); });

describe("persistent held tickets", () => {
  it("holds without creating an order and isolates drafts and events from other restaurants", async () => {
    const id = await make();
    const list = await (await GET(req("GET", first), {})).json();
    expect(list).toContainEqual(expect.objectContaining({ id, status: "held", itemCount: 2 }));
    expect(list.find((t: { id: string }) => t.id === id)).not.toHaveProperty("payload");
    expect(await (await GET(req("GET", outsider), {})).json()).toEqual([]);
    expect((await change(outsider, id, { action: "claim", version: 1, claimId: crypto.randomUUID() })).status).toBe(404);
    const hidden = await withTenant(b.restaurantId, db => db.execute(sql`select id from held_ticket_events where ticket_id=${id}`));
    expect(hidden.rows).toEqual([]);
    const orders = await asOwner(c => c.query("select id from orders where restaurant_id=$1 and customer_name='Draft guest'", [a.restaurantId]));
    expect(orders.rows).toEqual([]);
    expect((await POST(req("POST", first, { id: crypto.randomUUID(), payload: { ...payload(), items: [{ itemId: b.itemId, quantity: 1, optionIds: [] }] } }), {})).status).toBe(422);
    expect((await POST(req("POST", first, { id: crypto.randomUUID(), payload: { ...payload(), payment: { mode: "now", method: "cash" } } }), {})).status).toBe(400);
    expect((await change(first, id, { action: "cancel", version: 1 })).status).toBe(200);
  });

  it("serializes claims, allows explicit recovery, and rejects stale submission", async () => {
    const id = await make(), one = crypto.randomUUID(), two = crypto.randomUUID();
    const [r1, r2] = await Promise.all([change(first, id, { action: "claim", version: 1, claimId: one }), change(second, id, { action: "claim", version: 1, claimId: two })]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const winner = r1.ok ? first : second, loser = r1.ok ? second : first;
    const old = await (r1.ok ? r1 : r2).json();
    expect(old.payload).toMatchObject(payload());
    const recoveryId = crypto.randomUUID();
    const recovered = await change(loser, id, { action: "claim", version: old.version, claimId: recoveryId, recover: true });
    expect(recovered.status).toBe(200);
    const next = await recovered.json();
    expect((await send(winner, { id, claimId: old.claimId, version: old.version })).status).toBe(409);
    const claim = { id, claimId: next.claimId, version: next.version };
    const [x, y] = await Promise.all([send(loser, claim), send(loser, claim)]);
    expect([x.status, y.status]).toEqual([201, 201]);
    const xBody = await x.json(), yBody = await y.json();
    expect(xBody.id).toBe(yBody.id);
    const row = await asOwner(c => c.query("select status,payload,order_id from held_tickets where id=$1", [id]));
    expect(row.rows[0]).toMatchObject({ status: "submitted", payload: null, order_id: xBody.id });
    const events = await asOwner(c => c.query("select action,actor_id from held_ticket_events where ticket_id=$1 order by version", [id]));
    expect(events.rows.map(e => e.action)).toEqual(["held", "claimed", "recovered", "submitted"]);
    expect(events.rows.every(e => !!e.actor_id)).toBe(true);
  });

  it("reholds edited drafts, validates staff discount authority, and retries idempotently", async () => {
    const id = await make();
    const original = await (await change(first, id, { action: "claim", version: 1, claimId: crypto.randomUUID() })).json();
    const action = { action: "rehold", version: original.version, claimId: original.claimId, payload: { ...payload(), customerName: "Updated guest" } };
    expect((await change(first, id, { ...action, payload: { ...payload(), discount: { kind: "percent", value: 5 } } })).status).toBe(403);
    expect((await change(first, id, action)).status).toBe(200);
    expect((await change(first, id, action)).status).toBe(200);
    const restored = await (await change(second, id, { action: "claim", version: 3, claimId: crypto.randomUUID() })).json();
    expect(restored.payload.customerName).toBe("Updated guest");
    expect((await change(second, id, { action: "cancel", version: restored.version, claimId: restored.claimId })).status).toBe(200);
  });
});
