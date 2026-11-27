import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { menuItems, modifierGroups, modifierOptions } from "../db/schema";
import type { StaffContext } from "./auth";
import { withTenant, type Tx } from "./db";
import { HttpError } from "./http";
import { heldPayloadSchema, type HeldAction, type HeldClaim, type HeldPayload, type HeldSummary } from "./held-ticket-input";

type Actor = Pick<StaffContext, "restaurantId" | "staffUserId" | "role">;
type Ticket = { id: string; status: string; version: number; payload: unknown; created_by: string | null; updated_by: string | null; claim_id: string | null; claimed_by: string | null };
const conflict = () => new HttpError(409, "Ticket changed on another workstation. Refresh held tickets before continuing.");

async function locked(db: Tx, id: string): Promise<Ticket> {
  const { rows } = await db.execute<Ticket>(sql`select id,status,version,payload,created_by,updated_by,claim_id,claimed_by from held_tickets where id=${id} for update`);
  if (!rows[0]) throw new HttpError(404, "Held ticket not found");
  return rows[0];
}
async function event(db: Tx, actor: Actor, id: string, action: string, version: number) {
  await db.execute(sql`insert into held_ticket_events (restaurant_id,ticket_id,actor_id,action,version) values (${actor.restaurantId},${id},${actor.staffUserId},${action},${version})`);
}
async function validateDraft(db: Tx, actor: Actor, payload: HeldPayload) {
  if (payload.discount && actor.role !== "owner") throw new HttpError(403, "Only the owner can save a custom discount");
  if (payload.discount && payload.promoCode) throw new HttpError(422, "Use either a promo code or a discount, not both");
  // Validate tenant relationships even for incomplete drafts. Availability and current price are checked on submission.
  const ids = [...new Set(payload.items.map(line => line.itemId))];
  const items = await db.select({ id: menuItems.id }).from(menuItems).where(and(inArray(menuItems.id, ids), isNull(menuItems.deletedAt)));
  if (items.length !== ids.length) throw new HttpError(422, "A draft item is no longer on this menu");
  const optionIds = [...new Set(payload.items.flatMap(line => line.optionIds))];
  if (optionIds.length) {
    const options = await db.select({ id: modifierOptions.id, itemId: modifierGroups.itemId }).from(modifierOptions)
      .innerJoin(modifierGroups, and(eq(modifierOptions.groupId, modifierGroups.id), eq(modifierOptions.restaurantId, modifierGroups.restaurantId)))
      .where(inArray(modifierOptions.id, optionIds));
    const owners = new Map(options.map(o => [o.id, o.itemId]));
    if (payload.items.some(line => line.optionIds.some(id => owners.get(id) !== line.itemId))) throw new HttpError(422, "A draft option no longer belongs to this item");
  }
  if (payload.tableId) {
    const table = await db.execute(sql`select id from dining_tables where id=${payload.tableId} and active`);
    if (!table.rows.length) throw new HttpError(422, "Choose an active table in this restaurant");
  }
}
async function samePayload(db: Tx, id: string, payload: HeldPayload) {
  const { rows } = await db.execute<{ same: boolean }>(sql`select payload = ${JSON.stringify(payload)}::jsonb as same from held_tickets where id=${id}`);
  return rows[0]?.same === true;
}
export function listHeld(actor: Actor) {
  return withTenant(actor.restaurantId, async db => {
    const { rows } = await db.execute<HeldSummary>(sql`select id,status,version,updated_at::text as "updatedAt",
      (select coalesce(sum((i->>'quantity')::int),0)::int from jsonb_array_elements(payload->'items') i) as "itemCount",
      payload->>'orderType' as "orderType" from held_tickets where status in ('held','claimed') order by created_at,id`);
    return rows;
  });
}
export function createHeld(actor: Actor, id: string, payload: HeldPayload) {
  return withTenant(actor.restaurantId, async db => {
    // Serialize only draft creation within one restaurant; submission locks the individual ticket instead.
    await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`held-tickets:${actor.restaurantId}`},0))`);
    const { rows: existingRows } = await db.execute(sql`select id from held_tickets where id=${id}`);
    if (!existingRows.length) {
      const { rows } = await db.execute<{ n: number }>(sql`select count(*)::int as n from held_tickets where status in ('held','claimed')`);
      if (rows[0].n >= 100) throw new HttpError(409, "This restaurant has 100 open drafts. Resume or cancel one first.");
    }
    await validateDraft(db, actor, payload);
    const { rows } = await db.execute(sql`insert into held_tickets (id,restaurant_id,payload,created_by,updated_by)
      values (${id},${actor.restaurantId},${JSON.stringify(payload)}::jsonb,${actor.staffUserId},${actor.staffUserId}) on conflict (id) do nothing returning id`);
    if (rows.length) { await event(db, actor, id, "held", 1); return { id, version: 1 }; }
    const existing = await locked(db, id);
    if (existing.status !== "held" || existing.version !== 1 || existing.created_by !== actor.staffUserId || !await samePayload(db, id, payload)) throw conflict();
    return { id, version: 1 };
  });
}
export function changeHeld(actor: Actor, id: string, action: HeldAction) {
  return withTenant(actor.restaurantId, async db => {
    const row = await locked(db, id);
    if (action.action === "claim" && row.status === "claimed" && row.claim_id === action.claimId && row.claimed_by === actor.staffUserId) {
      return { id, claimId: action.claimId, version: row.version, payload: heldPayloadSchema.parse(row.payload) };
    }
    if (action.action === "rehold" && row.status === "held" && row.version === action.version + 1 && row.updated_by === actor.staffUserId && await samePayload(db, id, action.payload)) return { id, version: row.version };
    if (row.version !== action.version) throw conflict();
    const version = row.version + 1;
    if (action.action === "claim") {
      if (row.status !== "held" && !(action.recover && row.status === "claimed")) throw conflict();
      const payload = heldPayloadSchema.parse(row.payload);
      await db.execute(sql`update held_tickets set status='claimed',version=${version},claim_id=${action.claimId},claimed_by=${actor.staffUserId},updated_by=${actor.staffUserId} where id=${id}`);
      await event(db, actor, id, row.status === "held" ? "claimed" : "recovered", version);
      return { id, claimId: action.claimId, version, payload };
    }
    if (row.status !== "claimed" && !(action.action === "cancel" && row.status === "held")) throw conflict();
    if (row.status === "claimed" && (row.claim_id !== action.claimId || row.claimed_by !== actor.staffUserId)) throw conflict();
    if (action.action === "rehold") await validateDraft(db, actor, action.payload);
    const payload = action.action === "rehold" ? JSON.stringify(action.payload) : null;
    await db.execute(sql`update held_tickets set status=${action.action === "rehold" ? "held" : "cancelled"},version=${version},payload=${payload}::jsonb,claim_id=null,claimed_by=null,updated_by=${actor.staffUserId} where id=${id}`);
    await event(db, actor, id, action.action === "rehold" ? "reheld" : "cancelled", version);
    return { id, version };
  });
}
// Called inside the SAME transaction that creates the final order; the row lock serializes claims and submissions.
export async function lockHeldForSubmission(db: Tx, actor: Actor, claim: HeldClaim) {
  const row = await locked(db, claim.id);
  // A concurrent retry may have waited for the winning transaction. The caller must replay the matching order only.
  if (row.status === "submitted") return true;
  if (row.status !== "claimed" || row.claim_id !== claim.claimId || row.claimed_by !== actor.staffUserId || row.version !== claim.version) throw conflict();
  return false;
}
export async function finishHeldSubmission(db: Tx, actor: Actor, claim: HeldClaim, orderId: string) {
  const version = claim.version + 1;
  await db.execute(sql`update held_tickets set status='submitted',version=${version},payload=null,claim_id=null,claimed_by=null,order_id=${orderId},updated_by=${actor.staffUserId} where id=${claim.id}`);
  await event(db, actor, claim.id, "submitted", version);
}
