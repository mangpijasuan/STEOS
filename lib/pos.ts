// Orders entered by staff at the till: for a table, or for a walk-in taking food away.
import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { diningTables, locations, orderItems, orders, payments, restaurants } from "../db/schema";
import { priceCart, type CartLineInput, type DiscountRule } from "./cart";
import { withTenant, type Tx } from "./db";
import { applicationFee, type FeeModel } from "./fees";
import { HttpError } from "./http";
import { log } from "./log";
import { signRequest } from "./orders";
import { PromoError, loadPromo, manualRule, normalizeCode, promoRule, redeemPromo } from "./promos";
import { markOrderPaid, type ManualMethod } from "./tables";
import type { Store } from "./storefront";

export type PosInput = {
  items: CartLineInput[];
  orderType: "dine_in" | "counter";
  tableId?: string | null;
  customerName?: string;
  customerPhone?: string;
  tipCents: number;
  promoCode?: string;
  /** A discount typed in by the owner. Staff can only use promo codes. */
  discount?: { kind: "percent" | "fixed"; value: number };
  payment: { mode: "later" } | { mode: "now"; method: ManualMethod };
};

type Actor = { staffUserId: string; role: "owner" | "staff" };

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

async function discountFor(store: Store, input: PosInput, actor: Actor, now: Date): Promise<{ rule?: DiscountRule; promoId: string | null; promoCode: string | null }> {
  if (input.promoCode && input.discount) throw new HttpError(422, "Use either a promo code or a discount, not both");
  if (input.discount) {
    if (actor.role !== "owner") throw new HttpError(403, "Only the owner can give a custom discount");
    return { rule: manualRule(input.discount.kind, input.discount.value), promoId: null, promoCode: null };
  }
  if (input.promoCode) {
    const promo = await withTenant(store.restaurant.id, (db) => loadPromo(db, input.promoCode!));
    if (!promo) throw new PromoError("That promo code isn't valid");
    return { rule: promoRule(promo, now), promoId: promo.id, promoCode: promo.code };
  }
  return { promoId: null, promoCode: null };
}

/** Prices an order for the till screen. A wrong promo code is reported, not thrown, so the screen keeps working. */
export async function quotePos(store: Store, input: PosInput, actor: Actor, now = new Date()) {
  const options = { taxRateBps: store.restaurant.taxRateBps, tipCents: input.tipCents };
  try {
    const { rule } = await discountFor(store, input, actor, now);
    return { ...priceCart(store.menu, input.items, { ...options, discount: rule }), promoError: null as string | null };
  } catch (error) {
    if (!(error instanceof PromoError)) throw error;
    return { ...priceCart(store.menu, input.items, options), promoError: error.message };
  }
}

export async function createPosOrder(store: Store, input: PosInput, actor: Actor, idempotencyKey: string, now = new Date()) {
  const { restaurant } = store;
  if (input.orderType === "dine_in" && !input.tableId) throw new HttpError(422, "Choose a table for a dine-in order");

  // What identifies this request. A reused key with anything different is refused, not quietly answered with another order.
  const requestFingerprint = signRequest(
    "pos-v1", actor.staffUserId,
    input.items.map((l) => JSON.stringify([l.itemId, l.quantity, [...l.optionIds].sort(), l.note?.trim() || null])).sort(),
    input.orderType, input.tableId ?? null, input.customerName?.trim() ?? "", input.customerPhone?.trim() ?? "", input.tipCents,
    input.promoCode?.trim() ? normalizeCode(input.promoCode) : null, input.discount ?? null, input.payment,
  );


  // An attempt that already succeeded is answered from the order it created, before the menu, prices or promo are looked
  // at again. A later menu edit, or the promo's last use being taken, must not turn a retry into an error.
  const replay = await withTenant(restaurant.id, async (db) => {
    const [existing] = await db.select().from(orders).where(eq(orders.idempotencyKey, idempotencyKey));
    if (!existing) return null;
    if (existing.requestFingerprint !== requestFingerprint) throw new HttpError(409, "This request key was already used for a different order");
    return existing;
  });
  if (replay) return { id: replay.id, number: replay.number, totalCents: replay.totalCents, discountCents: replay.discountCents, paid: input.payment.mode === "now" };

  const { rule, promoId, promoCode } = await discountFor(store, input, actor, now);
  const cart = priceCart(store.menu, input.items, { taxRateBps: restaurant.taxRateBps, tipCents: input.tipCents, discount: rule });

  const create = () =>
    withTenant(restaurant.id, async (db) => {
      const existing = await db.select().from(orders).where(eq(orders.idempotencyKey, idempotencyKey));
      if (existing[0]) {
        if (existing[0].requestFingerprint !== requestFingerprint) throw new HttpError(409, "This request key was already used for a different order");
        return { order: existing[0], created: false };
      }

      let tableLabel: string | null = null;
      if (input.orderType === "dine_in") {
        // Row-level security means this only finds this restaurant's tables.
        const [table] = await db.select({ id: diningTables.id, label: diningTables.label }).from(diningTables).where(and(eq(diningTables.id, input.tableId!), eq(diningTables.active, true)));
        if (!table) throw new HttpError(404, "Table not found");
        tableLabel = table.label;
      }

      const [r] = await db
        .select({ bps: restaurants.platformFeeBps, model: restaurants.feeModel, plan: restaurants.pricingPlan })
        .from(restaurants);
      // The fee base is the food at its full price; discounts are the restaurant's cost. The fee is capped at the total.
      const fee = applicationFee({ subtotalCents: cart.subtotalCents, totalCents: cart.totalCents, feeBps: r.bps, model: r.model as FeeModel });

      const bumped = await db
        .update(restaurants)
        .set({ nextOrderNumber: sql`${restaurants.nextOrderNumber} + 1` })
        .where(eq(restaurants.id, restaurant.id))
        .returning({ n: restaurants.nextOrderNumber });
      if (promoId) await redeemPromo(db, promoId);

      const name = input.customerName?.trim() || (tableLabel ? `Table ${tableLabel}` : "Walk-in");
      const [order] = await db
        .insert(orders)
        .values({
          restaurantId: restaurant.id,
          locationId: restaurant.defaultLocationId,
          number: bumped[0].n - 1,
          // Goes to the kitchen like any other order, which rings and shows it as new.
          status: "awaiting_acceptance",
          orderType: input.orderType,
          tableId: input.orderType === "dine_in" ? input.tableId! : null,
          paymentMode: "pay_later",
          feeCollection: "invoice",
          createdBy: actor.staffUserId,
          customerName: name,
          customerPhone: input.customerPhone?.trim() ?? "",
          pickupType: "asap",
          pickupAt: new Date(now.getTime() + restaurant.minPrepMinutes * 60_000),
          subtotalCents: cart.subtotalCents,
          discountCents: cart.discountCents,
          promoCode,
          promoId,
          taxCents: cart.taxCents,
          tipCents: cart.tipCents,
          totalCents: cart.totalCents,
          feeCents: fee.applicationFeeCents,
          feeSnapshot: { ...fee, plan: r.plan, discountLabel: cart.discountLabel },
          idempotencyKey,
          requestFingerprint,
          publicTokenHash: sha256(crypto.randomBytes(32).toString("base64url")),
        })
        .returning();
      await db.insert(orderItems).values(
        cart.lines.map((l) => ({
          restaurantId: restaurant.id,
          orderId: order.id,
          itemId: l.itemId,
          name: l.name,
          unitPriceCents: l.unitPriceCents,
          quantity: l.quantity,
          options: l.options,
          note: l.note,
          lineTotalCents: l.lineTotalCents,
        })),
      );
      if (input.payment.mode === "now") await markOrderPaid(db, restaurant.id, order.id, input.payment.method, now, { allowUnaccepted: true });
      return { order, created: true };
    });

  let result;
  try {
    result = await create();
  } catch (error) {
    // Two taps of the same button raced; the loser finds the winner's order.
    if ((error as { code?: string; cause?: { code?: string } }).code === "23505" || (error as { cause?: { code?: string } }).cause?.code === "23505") result = await create();
    else throw error;
  }
  const { order } = result;
  if (result.created) {
    log.info("order.placed", { restaurantId: restaurant.id, orderId: order.id, type: input.orderType, byStaff: actor.staffUserId, paid: input.payment.mode === "now" });
  }
  return { id: order.id, number: order.number, totalCents: order.totalCents, discountCents: order.discountCents, paid: input.payment.mode === "now" };
}

// ----------------------------------------------------------------- receipt
export async function getReceipt(db: Tx, orderId: string) {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o) throw new HttpError(404, "Order not found");
  const [items, [r], [loc], [table], [pay]] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId)),
    db.select({ name: restaurants.name, timezone: restaurants.timezone }).from(restaurants),
    db.select().from(locations).where(eq(locations.isDefault, true)),
    o.tableId ? db.select({ label: diningTables.label }).from(diningTables).where(eq(diningTables.id, o.tableId)) : Promise.resolve([] as { label: string }[]),
    db.select({ method: payments.method, status: payments.status }).from(payments).where(eq(payments.orderId, orderId)),
  ]);
  return {
    restaurant: {
      name: r.name,
      timezone: r.timezone,
      address: [loc?.addressLine1, [loc?.city, loc?.state, loc?.postalCode].filter(Boolean).join(" ")].filter(Boolean) as string[],
      phone: loc?.phone ?? null,
    },
    number: o.number,
    createdAt: o.createdAt.toISOString(),
    orderType: o.orderType,
    tableLabel: table?.label ?? null,
    customerName: o.customerName,
    status: o.status,
    paymentMode: o.paymentMode,
    paid: !!o.paidAt,
    paidAt: o.paidAt?.toISOString() ?? null,
    paymentMethod: pay?.method ?? null,
    paymentStatus: pay?.status ?? null,
    subtotalCents: o.subtotalCents,
    discountCents: o.discountCents,
    discountLabel: o.discountCents > 0 ? (o.promoCode ? `Promo ${o.promoCode}` : "Discount") : null,
    taxCents: o.taxCents,
    tipCents: o.tipCents,
    totalCents: o.totalCents,
    items: items.map((i) => ({ name: i.name, quantity: i.quantity, unitPriceCents: i.unitPriceCents, options: i.options as { name: string }[], note: i.note, lineTotalCents: i.lineTotalCents })),
  };
}
