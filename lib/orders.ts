import crypto from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { orderItems, orders, payments, restaurants } from "../db/schema";
import { priceCart, type CartLineInput } from "./cart";
import { pool, withTenant, type Tx } from "./db";
import { alert } from "./alerts";
import { applicationFee, type FeeModel } from "./fees";
import { HttpError } from "./http";
import { isOpenNow } from "./hours";
import { log } from "./log";
import { getProvider } from "./payments/provider";
import type { PaymentEvent } from "./payments/provider";
import { orderingEnabled, pickupSlots, type Store } from "./storefront";

export const ACCEPT_WINDOW_MINUTES = 5;
const MIN_CHARGE_CENTS = 50;

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

function orderTokenSecret(): string {
  const secret = process.env.ORDER_TOKEN_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("ORDER_TOKEN_SECRET is required");
  return "dev-only-order-token-secret";
}

/**
 * The customer's private link. It is derived from the idempotency key, so a retried checkout gets the same link
 * back, while only its hash is stored. Nobody can guess it without the server secret.
 */
export function orderToken(restaurantId: string, idempotencyKey: string): string {
  return crypto.createHmac("sha256", orderTokenSecret()).update(`${restaurantId}:${idempotencyKey}`).digest("base64url");
}

export type CheckoutInput = {
  items: CartLineInput[];
  tipCents: number;
  pickupTime?: string;
  customer: { name: string; phone: string };
};

type OrderRow = typeof orders.$inferSelect;

async function loadPayment(db: Tx, orderId: string) {
  const rows = await db.select().from(payments).where(eq(payments.orderId, orderId));
  return rows[0] ?? null;
}

export async function createCheckout(store: Store, input: CheckoutInput, idempotencyKey: string, now = new Date()) {
  const { restaurant } = store;
  if (!orderingEnabled(restaurant)) throw new HttpError(409, "Online ordering is paused right now");

  const cart = priceCart(store.menu, input.items, { taxRateBps: restaurant.taxRateBps, tipCents: input.tipCents });
  if (cart.totalCents < MIN_CHARGE_CENTS) throw new HttpError(422, "The order total must be at least $0.50");

  const slots = pickupSlots(store, now);
  let pickupType: "asap" | "scheduled" = "asap";
  let pickupAt: Date;
  if (input.pickupTime) {
    const wanted = new Date(input.pickupTime);
    if (!slots.some((s) => s.getTime() === wanted.getTime())) {
      throw new HttpError(422, "Cart has problems", [{ line: null, message: "That pickup time is no longer available" }]);
    }
    pickupType = "scheduled";
    pickupAt = wanted;
  } else {
    if (!isOpenNow(now, restaurant.timezone, store.periods) || slots.length === 0) {
      throw new HttpError(409, "We are closed right now. Choose a pickup time.");
    }
    pickupAt = new Date(now.getTime() + restaurant.minPrepMinutes * 60_000);
  }

  const provider = await getProvider();
  const account = await withTenant(restaurant.id, async (db) => {
    const r = await db.select({ a: restaurants.stripeAccountId, bps: restaurants.platformFeeBps, model: restaurants.feeModel, plan: restaurants.pricingPlan }).from(restaurants);
    return r[0];
  });
  if (provider.name === "stripe" && !account.a) throw new HttpError(503, "This restaurant cannot take card payments yet");

  const fee = applicationFee({
    subtotalCents: cart.subtotalCents,
    totalCents: cart.totalCents,
    feeBps: account.bps,
    model: account.model as FeeModel,
  });
  const token = orderToken(restaurant.id, idempotencyKey);

  // Step 1: save the order (or find the one this key already created).
  const create = () =>
    withTenant(restaurant.id, async (db) => {
      const existing = await db.select().from(orders).where(eq(orders.idempotencyKey, idempotencyKey));
      if (existing[0]) {
        if (existing[0].totalCents !== cart.totalCents) throw new HttpError(409, "This request key was already used for a different order");
        return existing[0];
      }
      const bumped = await db
        .update(restaurants)
        .set({ nextOrderNumber: sql`${restaurants.nextOrderNumber} + 1` })
        .where(eq(restaurants.id, restaurant.id))
        .returning({ n: restaurants.nextOrderNumber });
      const [order] = await db
        .insert(orders)
        .values({
          restaurantId: restaurant.id,
          locationId: restaurant.defaultLocationId,
          number: bumped[0].n - 1,
          customerName: input.customer.name,
          customerPhone: input.customer.phone,
          pickupType,
          pickupAt,
          subtotalCents: cart.subtotalCents,
          taxCents: cart.taxCents,
          tipCents: cart.tipCents,
          totalCents: cart.totalCents,
          feeCents: fee.applicationFeeCents,
          feeSnapshot: { ...fee, plan: account.plan },
          idempotencyKey,
          publicTokenHash: sha256(token),
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
      return order;
    });

  let order: OrderRow;
  try {
    order = await create();
  } catch (error) {
    // Two requests with the same key raced; the loser finds the winner's order.
    if ((error as { code?: string }).code === "23505") order = await create();
    else throw error;
  }

  // Step 2: ask the provider to hold the money, unless that already happened.
  let payment = await withTenant(restaurant.id, (db) => loadPayment(db, order.id));
  if (!payment && order.status === "pending_payment") {
    let auth;
    try {
      auth = await provider.createAuthorization({
        orderId: order.id,
        restaurantId: restaurant.id,
        amountCents: order.totalCents,
        feeCents: order.feeCents,
        connectedAccountId: account.a,
        description: `${restaurant.name} order #${order.number}`,
      });
    } catch (error) {
      await withTenant(restaurant.id, (db) =>
        db.update(orders).set({ status: "payment_failed" }).where(and(eq(orders.id, order.id), eq(orders.status, "pending_payment"))),
      );
      if (error instanceof HttpError) throw error;
      await alert("payment-authorize", "A card hold could not be started at checkout", { restaurantId: restaurant.id, orderId: order.id, error });
      throw new HttpError(502, "We could not start the payment. Please try again.");
    }
    payment = await withTenant(restaurant.id, async (db) => {
      await db
        .insert(payments)
        .values({
          restaurantId: restaurant.id,
          orderId: order.id,
          provider: provider.name,
          providerPaymentId: auth.providerPaymentId,
          clientSecret: auth.clientSecret,
          amountCents: order.totalCents,
          feeCents: order.feeCents,
        })
        .onConflictDoNothing();
      return loadPayment(db, order.id);
    });
  }

  return {
    orderToken: token,
    order: { number: order.number, status: order.status, totalCents: order.totalCents, pickupAt: order.pickupAt.toISOString() },
    payment:
      payment && order.status === "pending_payment"
        ? { provider: provider.name, clientSecret: payment.clientSecret, ...provider.publicConfig(account.a) }
        : null,
  };
}

/** What the customer's private status page may show. */
export async function getOrderByToken(token: string) {
  const found = await pool.query("select * from public_order_by_token($1)", [sha256(token)]);
  const row = found.rows[0];
  if (!row) throw new HttpError(404, "Order not found");
  return withTenant(row.restaurant_id, async (db) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, row.order_id));
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const [r] = await db.select({ name: restaurants.name, timezone: restaurants.timezone }).from(restaurants);
    return {
      restaurant: r,
      number: order.number,
      status: order.status,
      customerName: order.customerName,
      pickupAt: order.pickupAt.toISOString(),
      pickupType: order.pickupType,
      prepMinutes: order.prepMinutes,
      subtotalCents: order.subtotalCents,
      taxCents: order.taxCents,
      tipCents: order.tipCents,
      totalCents: order.totalCents,
      items: items.map((i) => ({ name: i.name, quantity: i.quantity, options: i.options, note: i.note, lineTotalCents: i.lineTotalCents })),
    };
  });
}

/**
 * Applies a provider event. Runs in one transaction with the de-duplication record, so a failure can be retried
 * by the provider and a repeat is ignored.
 */
export async function applyPaymentEvent(event: PaymentEvent): Promise<"applied" | "duplicate" | "ignored"> {
  if (!event.restaurantId || !event.orderId) return "ignored";
  const provider = await getProvider();
  return withTenant(event.restaurantId, async (db) => {
    const seen = await db.execute(
      sql`insert into webhook_events (provider, event_id, type) values (${provider.name}, ${event.eventId}, ${event.type}) on conflict do nothing returning event_id`,
    );
    if (seen.rows.length === 0) return "duplicate";

    const [r] = await db.select({ account: restaurants.stripeAccountId }).from(restaurants);
    if (provider.name === "stripe" && event.account !== r?.account) {
      log.warn("webhook.account_mismatch", { restaurantId: event.restaurantId, eventId: event.eventId });
      return "ignored";
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, event.orderId!)).for("update");
    const payment = order ? await loadPayment(db, order.id) : null;
    if (!order || !payment || payment.providerPaymentId !== event.providerPaymentId) return "ignored";

    const paymentStatus = { authorized: "authorized", captured: "captured", canceled: "canceled", failed: "failed" } as const;
    // Never move a payment backwards once it has been captured.
    if (!(payment.status === "captured" && event.type !== "captured")) {
      await db.update(payments).set({ status: paymentStatus[event.type] }).where(eq(payments.id, payment.id));
    }

    if (event.type === "authorized" && order.status === "pending_payment") {
      await db
        .update(orders)
        .set({ status: "awaiting_acceptance", acceptDeadline: new Date(Date.now() + ACCEPT_WINDOW_MINUTES * 60_000) })
        .where(eq(orders.id, order.id));
    } else if (event.type === "failed" && order.status === "pending_payment") {
      await db.update(orders).set({ status: "payment_failed" }).where(eq(orders.id, order.id));
    } else if (event.type === "canceled" && ["pending_payment", "awaiting_acceptance"].includes(order.status)) {
      await db.update(orders).set({ status: "cancelled", decidedAt: new Date() }).where(eq(orders.id, order.id));
    } else if (event.type === "captured" && order.status === "awaiting_acceptance") {
      // Recovers the case where we captured but crashed before saving the acceptance.
      await db.update(orders).set({ status: "accepted", decidedAt: new Date() }).where(eq(orders.id, order.id));
    }
    return "applied";
  });
}

export type Decision = "accept" | "decline" | "expire";

/** Kitchen decision on an order that is waiting. Accept captures the money; decline and expiry release the hold. */
export async function decideOrder(restaurantId: string, orderId: string, decision: Decision, now = new Date(), prepMinutes?: number) {
  const provider = await getProvider();
  return withTenant(restaurantId, async (db) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new HttpError(404, "Order not found");
    if (order.status !== "awaiting_acceptance") throw new HttpError(409, `This order is already ${order.status.replaceAll("_", " ")}`);
    const payment = await loadPayment(db, order.id);
    if (!payment) throw new HttpError(409, "This order has no payment");
    const [r] = await db.select({ account: restaurants.stripeAccountId }).from(restaurants);

    const lapsed = order.acceptDeadline !== null && order.acceptDeadline.getTime() < now.getTime();
    const effective: Decision = decision === "accept" && lapsed ? "expire" : decision;

    if (effective === "accept") {
      try {
        await provider.capture(payment.providerPaymentId, r?.account ?? null);
      } catch (error) {
        await alert("payment-capture", "An accepted order's payment could not be captured", { restaurantId, orderId, error });
        throw new HttpError(502, "The payment could not be captured. Try again.");
      }
      await db.update(payments).set({ status: "captured" }).where(eq(payments.id, payment.id));
      await db.update(orders).set({ status: "accepted", decidedAt: now, prepMinutes: prepMinutes ?? null }).where(eq(orders.id, order.id));
      log.info("order.accepted", { restaurantId, orderId, totalCents: order.totalCents, prepMinutes });
      return { status: "accepted" as const };
    }

    try {
      await provider.cancel(payment.providerPaymentId, r?.account ?? null);
    } catch (error) {
      await alert("payment-cancel", "A card hold could not be released", { restaurantId, orderId, decision: effective, error });
      throw new HttpError(502, "The card hold could not be released. Try again.");
    }
    const status = effective === "decline" ? ("declined" as const) : ("expired" as const);
    await db.update(payments).set({ status: "canceled" }).where(eq(payments.id, payment.id));
    await db.update(orders).set({ status, decidedAt: now }).where(eq(orders.id, order.id));
    log.info(`order.${status}`, { restaurantId, orderId, totalCents: order.totalCents });
    return { status };
  });
}

export type Step = "ready" | "complete";

/** Moves an accepted order along the kitchen line: accepted -> ready -> completed. */
export async function advanceOrder(restaurantId: string, orderId: string, step: Step, now = new Date()) {
  return withTenant(restaurantId, async (db) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new HttpError(404, "Order not found");
    const allowed: Record<Step, string[]> = { ready: ["accepted"], complete: ["accepted", "ready"] };
    if (!allowed[step].includes(order.status)) throw new HttpError(409, `This order is ${order.status.replaceAll("_", " ")}`);
    const patch = step === "ready" ? { status: "ready", readyAt: now } : { status: "completed", completedAt: now, readyAt: order.readyAt ?? now };
    await db.update(orders).set(patch).where(eq(orders.id, order.id));
    return { status: patch.status };
  });
}

/** Cancels an order the kitchen already accepted. The customer gets a full refund. */
export async function cancelAcceptedOrder(restaurantId: string, orderId: string, now = new Date()) {
  const provider = await getProvider();
  return withTenant(restaurantId, async (db) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new HttpError(404, "Order not found");
    if (!["accepted", "ready"].includes(order.status)) throw new HttpError(409, `This order is ${order.status.replaceAll("_", " ")}`);
    const payment = await loadPayment(db, order.id);
    if (!payment || payment.status !== "captured") throw new HttpError(409, "There is no captured payment to refund");
    const [r] = await db.select({ account: restaurants.stripeAccountId }).from(restaurants);
    try {
      await provider.refund(payment.providerPaymentId, r?.account ?? null);
    } catch (error) {
      await alert("payment-refund", "A refund for a cancelled order failed. The customer has not been refunded", { restaurantId, orderId, error });
      throw new HttpError(502, "The refund could not be made. Try again.");
    }
    await db.update(payments).set({ status: "refunded" }).where(eq(payments.id, payment.id));
    await db.update(orders).set({ status: "cancelled", cancelledAt: now }).where(eq(orders.id, order.id));
    log.info("order.refunded", { restaurantId, orderId, totalCents: order.totalCents });
    return { status: "cancelled" as const };
  });
}

/** Releases every order that waited past its deadline. Meant to run every minute or so. */
export async function expireStaleOrders(limit = 50): Promise<number> {
  const due = await pool.query("select * from orders_past_deadline($1)", [limit]);
  let expired = 0;
  for (const row of due.rows) {
    try {
      await decideOrder(row.restaurant_id, row.order_id, "expire");
      expired++;
    } catch (error) {
      // 409: another process got there first. Anything else (a provider failure already alerted on) is
      // logged; the next sweep tries again.
      if (!(error instanceof HttpError && error.status === 409)) {
        log.warn("order.expire_failed", { restaurantId: row.restaurant_id, orderId: row.order_id, error });
      }
    }
  }
  return expired;
}

export async function listActiveOrders(db: Tx) {
  const rows = await db
    .select()
    .from(orders)
    .where(inArray(orders.status, ["awaiting_acceptance", "accepted", "ready"]))
    .orderBy(desc(orders.createdAt))
    .limit(100);
  const items = rows.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, rows.map((o) => o.id))) : [];
  return rows.map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    pickupAt: o.pickupAt.toISOString(),
    totalCents: o.totalCents,
    acceptDeadline: o.acceptDeadline?.toISOString() ?? null,
    prepMinutes: o.prepMinutes,
    createdAt: o.createdAt.toISOString(),
    tipCents: o.tipCents,
    items: items.filter((i) => i.orderId === o.id).map((i) => ({ name: i.name, quantity: i.quantity, options: i.options, note: i.note })),
  }));
}
