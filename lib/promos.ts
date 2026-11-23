import { and, desc, eq, sql } from "drizzle-orm";
import { promoCodes } from "../db/schema";
import type { DiscountRule } from "./cart";
import type { Tx } from "./db";
import { HttpError } from "./http";
import { allow } from "./ratelimit";
import { money } from "./format";

export type Promo = typeof promoCodes.$inferSelect;

/** A code that does not apply to this cart. Carried as a 422 so checkout can show the reason. */
export class PromoError extends HttpError {
  constructor(message: string) {
    super(422, "Cart has problems", [{ line: null, message }]);
    this.message = message;
  }
}

export const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");

export async function loadPromo(db: Tx, code: string): Promise<Promo | null> {
  const rows = await db.select().from(promoCodes).where(eq(promoCodes.code, normalizeCode(code)));
  return rows[0] ?? null;
}

/**
 * How much a code takes off, or a PromoError saying why it cannot be used. The reasons are specific on purpose:
 * someone holding a real code should know whether it expired or needs a bigger order.
 */
export function promoRule(promo: Promo | null, now = new Date()): DiscountRule {
  return (subtotalCents) => {
    if (!promo || !promo.active) throw new PromoError("That promo code isn't valid");
    if (promo.expiresAt && promo.expiresAt.getTime() <= now.getTime()) throw new PromoError("That promo code has expired");
    if (promo.maxUses !== null && promo.uses >= promo.maxUses) throw new PromoError("That promo code has reached its limit");
    if (subtotalCents < promo.minSubtotalCents) throw new PromoError(`Spend ${money(promo.minSubtotalCents)} or more to use ${promo.code}`);
    const cents = promo.kind === "percent" ? Math.floor((subtotalCents * promo.value + 50) / 100) : promo.value;
    return { cents, label: `Promo ${promo.code}` };
  };
}

/** A discount the owner types in at the till, with no code. */
export function manualRule(kind: "percent" | "fixed", value: number): DiscountRule {
  return (subtotalCents) => ({
    cents: kind === "percent" ? Math.floor((subtotalCents * value + 50) / 100) : value,
    label: kind === "percent" ? `Discount ${value}%` : "Discount",
  });
}

/** Counts one use. Done in the same transaction as the order, and refuses if the last use was just taken. */
export async function redeemPromo(db: Tx, id: string): Promise<void> {
  const res = await db.execute(
    sql`update promo_codes set uses = uses + 1
        where id = ${id} and active and (expires_at is null or expires_at > now()) and (max_uses is null or uses < max_uses)
        returning id`,
  );
  if (res.rows.length === 0) throw new PromoError("That promo code has reached its limit");
}

/**
 * Gives a use back when an order that redeemed a code never completes (declined, expired, or its payment failed or
 * was cancelled), so abandoned or failed checkouts cannot use up a limited code. Runs inside the order's tenant scope.
 */
export async function returnPromoUse(db: Tx, promoId: string | null): Promise<void> {
  if (promoId) await db.execute(sql`update promo_codes set uses = greatest(uses - 1, 0) where id = ${promoId}`);
}

/** The opposite, for a payment that failed and was later captured after all: the order keeps its discount. */
export async function retakePromoUse(db: Tx, promoId: string | null): Promise<void> {
  if (promoId) await db.execute(sql`update promo_codes set uses = uses + 1 where id = ${promoId}`);
}

/** Wrong guesses are limited per person, so codes cannot be found by trying them all. */
export async function allowPromoMiss(ip: string): Promise<boolean> {
  return allow(`promo-miss:${ip}`, 8, 10 * 60_000);
}

// ---------------------------------------------------------------- owner CRUD
export type PromoInput = {
  code: string;
  kind: "percent" | "fixed";
  value: number;
  minSubtotalCents?: number;
  active?: boolean;
  expiresAt?: string | null;
  maxUses?: number | null;
};

const found = <T>(rows: T[]): T => {
  if (!rows[0]) throw new HttpError(404, "Not found");
  return rows[0];
};

const dupe = (error: unknown) => {
  if ((error as { cause?: { code?: string } })?.cause?.code === "23505") throw new HttpError(409, "You already have a code with that name");
  throw error;
};

export async function listPromos(db: Tx) {
  return db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
}

export async function createPromo(db: Tx, restaurantId: string, input: PromoInput) {
  try {
    return found(
      await db
        .insert(promoCodes)
        .values({
          restaurantId,
          code: normalizeCode(input.code),
          kind: input.kind,
          value: input.value,
          minSubtotalCents: input.minSubtotalCents ?? 0,
          active: input.active ?? true,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          maxUses: input.maxUses ?? null,
        })
        .returning(),
    );
  } catch (error) {
    return dupe(error);
  }
}

export async function updatePromo(db: Tx, id: string, patch: Partial<PromoInput>) {
  const set: Record<string, unknown> = {};
  if (patch.code !== undefined) set.code = normalizeCode(patch.code);
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.value !== undefined) set.value = patch.value;
  if (patch.minSubtotalCents !== undefined) set.minSubtotalCents = patch.minSubtotalCents;
  if (patch.active !== undefined) set.active = patch.active;
  if (patch.expiresAt !== undefined) set.expiresAt = patch.expiresAt ? new Date(patch.expiresAt) : null;
  if (patch.maxUses !== undefined) set.maxUses = patch.maxUses;
  if (Object.keys(set).length === 0) throw new HttpError(400, "Nothing to update");
  try {
    return found(await db.update(promoCodes).set(set).where(eq(promoCodes.id, id)).returning());
  } catch (error) {
    const code = (error as { cause?: { code?: string } })?.cause?.code;
    if (code === "23514") throw new HttpError(400, "A percentage must be between 1 and 100");
    return dupe(error);
  }
}

export async function deletePromo(db: Tx, id: string) {
  // Orders keep the code text for receipts. Their link to the promotion clears, so nothing is returned to a deleted code.
  found(await db.delete(promoCodes).where(and(eq(promoCodes.id, id))).returning({ id: promoCodes.id }));
}
