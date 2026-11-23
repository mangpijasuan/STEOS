import crypto from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { diningTables, orderItems, orders, payments, restaurants } from "../db/schema";
import { priceCart, type CartLineInput } from "./cart";
import { PromoError, loadPromo, normalizeCode, promoRule, redeemPromo, retakePromoUse, returnPromoUse } from "./promos";
import { pool, withTenant, type Tx } from "./db";
import { applicationFee, type FeeModel } from "./fees";
import { alert } from "./alerts";
import { HttpError, OperationalError } from "./http";
import { log } from "./log";
import { getProvider } from "./payments/provider";
import type { PaymentEvent, Refund } from "./payments/provider";
import { asapPickup, orderingEnabled, pickupSlots, type Store } from "./storefront";

export const ACCEPT_WINDOW_MINUTES = 5;
const MIN_CHARGE_CENTS = 50;

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

function orderTokenSecret(): string {
  const secret = process.env.ORDER_TOKEN_SECRET;
  if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32 || /change-me|dev-only/i.test(secret))) {
    throw new Error("Production requires a strong ORDER_TOKEN_SECRET");
  }
  if (secret) return secret;
  return "dev-only-order-token-secret";
}

// Preserve status links issued before orders had their own token source.
export function orderToken(restaurantId: string, legacyKey: string): string {
  return crypto.createHmac("sha256", orderTokenSecret()).update(`${restaurantId}:${legacyKey}`).digest("base64url");
}

function newOrderToken(restaurantId: string, orderId: string): string {
  return crypto.createHmac("sha256", orderTokenSecret()).update(`order-link:${restaurantId}:${orderId}`).digest("base64url");
}

export type CheckoutInput = {
  items: CartLineInput[];
  tipCents: number;
  promoCode?: string;
  pickupTime?: string;
  customer: { name: string; phone: string };
};

type OrderRow = typeof orders.$inferSelect;

/** Set when the order comes from a table's QR code. */
export type DineInContext = { tableId: string; tableLabel: string; payLater: boolean };

async function loadPayment(db: Tx, orderId: string) {
  const rows = await db.select().from(payments).where(eq(payments.orderId, orderId));
  return rows[0] ?? null;
}

/** A keyed fingerprint of a request, so a reused idempotency key can be told apart from a genuine retry. */
export function signRequest(...parts: unknown[]): string {
  return crypto.createHmac("sha256", orderTokenSecret()).update(JSON.stringify(parts)).digest("hex");
}

function fingerprint(input: CheckoutInput, retryProof?: string, dineIn?: DineInContext): string {
  const lines = input.items.map((line) => JSON.stringify([
    line.itemId, line.quantity, [...line.optionIds].sort(), line.note?.trim() || null,
  ])).sort();
  return crypto.createHmac("sha256", orderTokenSecret()).update(JSON.stringify([
    "checkout-v1", retryProof ?? null, lines, input.tipCents,
    input.pickupTime ? new Date(input.pickupTime).toISOString() : null,
    input.customer.name, input.customer.phone,
    // Appended only for table orders, so fingerprints stored for pickup orders keep matching.
    ...(dineIn ? [["dine-in", dineIn.tableId, dineIn.payLater]] : []),
    // Likewise only when a code is used, so fingerprints stored for orders without one keep matching.
    ...(input.promoCode?.trim() ? [["promo", normalizeCode(input.promoCode)]] : []),
  ])).digest("hex");
}

async function legacyFingerprint(db: Tx, order: OrderRow): Promise<string> {
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return fingerprint({
    items: items.map((item) => ({
      itemId: item.itemId ?? "",
      quantity: item.quantity,
      optionIds: (item.options as { id: string }[]).map((option) => option.id),
      note: item.note ?? undefined,
    })),
    tipCents: order.tipCents,
    pickupTime: order.pickupType === "scheduled" ? order.pickupAt.toISOString() : undefined,
    customer: { name: order.customerName, phone: order.customerPhone },
  });
}

async function paymentAccount(db: Tx, order: OrderRow): Promise<string | null> {
  if (order.requestFingerprint) return order.providerAccountId;
  const [restaurant] = await db.select({ account: restaurants.stripeAccountId }).from(restaurants);
  return restaurant?.account ?? null;
}

export async function createCheckout(
  store: Store, input: CheckoutInput, idempotencyKey: string, now = new Date(), retryProof?: string, dineIn?: DineInContext,
) {
  const { restaurant } = store;
  const payLater = !!dineIn?.payLater;
  const requestFingerprint = fingerprint(input, retryProof, dineIn);

  const saved = await withTenant(restaurant.id, async (db) => {
    await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${restaurant.id + ":" + idempotencyKey}, 0))`);
    const [existing] = await db.select().from(orders).where(eq(orders.idempotencyKey, idempotencyKey));
    if (existing) {
      const matches = existing.requestFingerprint
        ? existing.requestFingerprint === requestFingerprint
        : await legacyFingerprint(db, existing) === fingerprint(input);
      if (!matches) {
        throw new HttpError(409, "This request key was already used for a different order");
      }
      return existing;
    }

    const [account] = await db.select().from(restaurants).where(eq(restaurants.id, restaurant.id)).for("update");
    if (!account || !orderingEnabled({ ...restaurant, ...account })) {
      throw new HttpError(409, "Online ordering is paused right now");
    }
    if (dineIn && !account.dineInEnabled) throw new HttpError(409, "This restaurant is not taking table orders right now");
    if (payLater && !account.payLaterEnabled) throw new HttpError(409, "Paying at the table is not available. Please pay by card.");
    const currentStore = { ...store, restaurant: { ...restaurant, ...account } };
    // The code is checked again here, under the restaurant lock, whatever the quote said: it may have run out since.
    const promo = input.promoCode?.trim() ? await loadPromo(db, input.promoCode) : null;
    if (input.promoCode?.trim() && !promo) throw new PromoError("That promo code isn't valid");
    const cart = priceCart(store.menu, input.items, { taxRateBps: account.taxRateBps, tipCents: input.tipCents, discount: promo ? promoRule(promo, now) : undefined });
    // The minimum only exists because card processors reject tiny charges; a bill paid at the table has no such limit.
    if (!payLater && cart.totalCents < MIN_CHARGE_CENTS) throw new HttpError(422, "The order total must be at least $0.50");
    if (cart.totalCents > 99_999_999) throw new HttpError(422, "The order total exceeds the supported payment limit");

    let pickupAt: Date | null;
    if (dineIn) {
      // Seated guests do not choose a pickup time; this is the kitchen's estimate of when food comes out.
      pickupAt = new Date(now.getTime() + account.minPrepMinutes * 60_000);
    } else if (input.pickupTime) {
      pickupAt = new Date(input.pickupTime);
      if (!pickupSlots(currentStore, now).some((slot) => slot.getTime() === pickupAt?.getTime())) {
        throw new HttpError(422, "Cart has problems", [{ line: null, message: "That pickup time is no longer available" }]);
      }
    } else {
      pickupAt = asapPickup(currentStore, now);
      if (!pickupAt) throw new HttpError(409, "ASAP pickup is unavailable. Choose a scheduled pickup time.");
    }

    if (!payLater) {
      const provider = await getProvider();
      if (provider.name === "stripe" && (!account.stripeAccountId || !process.env.STRIPE_PUBLISHABLE_KEY)) {
        throw new HttpError(503, "This restaurant cannot take card payments yet");
      }
    }
    const fee = applicationFee({
      // The fee base is the food at its full price. A discount is the restaurant's cost, not a reduction in SROS's fee.
      // (The fee is capped at the amount charged, so a deep discount can never make it exceed the total.)
      subtotalCents: cart.subtotalCents, totalCents: cart.totalCents,
      feeBps: account.platformFeeBps, model: account.feeModel as FeeModel,
    });
    const id = crypto.randomUUID();
    await db.update(restaurants).set({ nextOrderNumber: account.nextOrderNumber + 1 }).where(eq(restaurants.id, restaurant.id));
    if (promo) await redeemPromo(db, promo.id);
    const [order] = await db.insert(orders).values({
      id,
      restaurantId: restaurant.id,
      locationId: restaurant.defaultLocationId,
      number: account.nextOrderNumber,
      // Pay-later orders go straight to the kitchen (no card to authorize) and never get an acceptance deadline, so
      // the expiry sweep, which only looks at orders with a deadline, can never release or cancel them.
      ...(payLater ? { status: "awaiting_acceptance" } : {}),
      orderType: dineIn ? "dine_in" : "pickup",
      tableId: dineIn?.tableId ?? null,
      paymentMode: payLater ? "pay_later" : "online",
      feeCollection: payLater ? "invoice" : "platform",
      customerName: input.customer.name,
      customerPhone: input.customer.phone,
      pickupType: !dineIn && input.pickupTime ? "scheduled" : "asap",
      pickupAt,
      subtotalCents: cart.subtotalCents,
      discountCents: cart.discountCents,
      promoCode: promo?.code ?? null,
      taxCents: cart.taxCents,
      tipCents: cart.tipCents,
      totalCents: cart.totalCents,
      feeCents: fee.applicationFeeCents,
      feeSnapshot: { ...fee, plan: account.pricingPlan },
      idempotencyKey,
      requestFingerprint,
      providerAccountId: account.stripeAccountId,
      publicTokenHash: sha256(newOrderToken(restaurant.id, id)),
    }).returning();
    await db.insert(orderItems).values(cart.lines.map((line) => ({
      restaurantId: restaurant.id,
      orderId: order.id,
      itemId: line.itemId,
      name: line.name,
      unitPriceCents: line.unitPriceCents,
      quantity: line.quantity,
      options: line.options,
      note: line.note,
      lineTotalCents: line.lineTotalCents,
    })));
    return order;
  });

  return withTenant(restaurant.id, async (db) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, saved.id)).for("update");
    const token = order.requestFingerprint ? newOrderToken(restaurant.id, order.id) : orderToken(restaurant.id, idempotencyKey);
    const orderSummary = { number: order.number, status: order.status, totalCents: order.totalCents, pickupAt: order.pickupAt.toISOString() };
    if (order.status !== "pending_payment") return { orderToken: token, order: orderSummary, payment: null };

    const provider = await getProvider();
    const account = await paymentAccount(db, order);
    let payment = await loadPayment(db, order.id);
    if (!payment) {
      const auth = await provider.createAuthorization({
        orderId: order.id, restaurantId: restaurant.id, amountCents: order.totalCents, feeCents: order.feeCents,
        connectedAccountId: account, description: `${restaurant.name} order #${order.number}`,
      }).catch((error: unknown) => {
        if (error instanceof HttpError) throw error;
        throw new OperationalError("payment-authorization", "We could not start the payment. Please try again.");
      });
      [payment] = await db.insert(payments).values({
        restaurantId: restaurant.id, orderId: order.id, provider: provider.name, providerPaymentId: auth.providerPaymentId,
        clientSecret: auth.clientSecret, amountCents: order.totalCents, feeCents: order.feeCents,
      }).returning();
    }
    if (payment.provider !== provider.name) throw new HttpError(503, "This order's payment provider is unavailable");
    return {
      orderToken: token, order: orderSummary,
      payment: { provider: provider.name, clientSecret: payment.clientSecret, ...provider.publicConfig(account) },
    };
  });
}

/** What the customer's private status page may show. */
export async function getOrderByToken(token: string) {
  const found = await pool.query("select * from public_order_by_token($1)", [sha256(token)]);
  const row = found.rows[0];
  if (!row) throw new HttpError(404, "Order not found");
  return withTenant(row.restaurant_id, async (db) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, row.order_id));
    if (!order) throw new HttpError(404, "Order not found");
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const payment = await loadPayment(db, order.id);
    const [r] = await db.select({ name: restaurants.name, timezone: restaurants.timezone }).from(restaurants);
    const [table] = order.tableId ? await db.select({ label: diningTables.label }).from(diningTables).where(eq(diningTables.id, order.tableId)) : [];
    const inPersonRefunded = order.paymentMode === "pay_later" && (payment?.status === "refunded" || !!payment?.refundedAt);
    return {
      restaurant: r,
      orderType: order.orderType,
      paymentMode: order.paymentMode,
      // Money taken in person and later handed back is "refunded", not "paid": paidAt keeps the historical capture time
      // for reports, but the guest must never be told a cancelled order was paid.
      paid: !!order.paidAt && !inPersonRefunded,
      paymentState: (inPersonRefunded ? "refunded" : order.paidAt ? "paid" : "unpaid") as "paid" | "refunded" | "unpaid",
      tableLabel: table?.label ?? null,
      number: order.number,
      status: order.status,
      // In-person refunds on pay-later orders are the restaurant's to hand back, so no card-refund message.
      refundStatus: order.paymentMode === "online" ? payment?.refundStatus ?? null : null,
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

async function recordRefund(
  db: Tx, order: OrderRow, payment: NonNullable<Awaited<ReturnType<typeof loadPayment>>>,
  refund: Refund, attempt: number, at: Date,
) {
  if (payment.refundedAt || attempt < payment.refundAttempt) return;
  if (attempt === payment.refundAttempt && payment.refundStatus === "failed" && refund.status === "pending") return;
  const succeeded = refund.status === "succeeded";
  await db.update(payments).set({
    status: succeeded ? "refunded" : "captured",
    refundId: refund.id, refundAttempt: attempt, refundStatus: refund.status, refundCheckedAt: new Date(),
    refundedAt: succeeded ? at : null,
  }).where(eq(payments.id, payment.id));

  if (refund.status !== "failed") {
    await db.update(orders).set({ status: "cancelled", cancelledAt: order.cancelledAt ?? at }).where(eq(orders.id, order.id));
  } else if (order.status === "cancelled" && payment.refundStatus === "pending") {
    await db.update(orders).set({ status: order.readyAt ? "ready" : "accepted", cancelledAt: null }).where(eq(orders.id, order.id));
  }
}

/** Records a provider event and applies it in the same transaction. */
export async function applyPaymentEvent(event: PaymentEvent): Promise<"applied" | "duplicate" | "ignored"> {
  if (!event.restaurantId || !event.orderId) return "ignored";
  const orderId = event.orderId;
  const provider = await getProvider();
  return withTenant(event.restaurantId, async (db) => {
    const seen = await db.execute(
      sql`insert into webhook_events (provider, event_id, type) values (${provider.name}, ${event.eventId}, ${event.type}) on conflict do nothing returning event_id`,
    );
    if (seen.rows.length === 0) return "duplicate";

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order || (provider.name === "stripe" && event.account !== await paymentAccount(db, order))) return "ignored";
    const payment = await loadPayment(db, order.id);
    if (!payment) throw new HttpError(503, "The payment is still being registered. Retry this event.");
    if (payment.provider !== provider.name || payment.providerPaymentId !== event.providerPaymentId) return "ignored";

    const at = event.occurredAt ?? new Date();
    if (event.type === "refund" && event.refund) {
      if (!payment.capturedAt) throw new HttpError(503, "The capture is still being registered. Retry this event.");
      await recordRefund(db, order, payment, event.refund, event.refund.attempt, at);
    } else if (event.type === "captured") {
      if (!payment.capturedAt && !payment.refundedAt && payment.status !== "refunded") {
        await db.update(payments).set({ status: "captured", capturedAt: at, clientSecret: null }).where(eq(payments.id, payment.id));
        if (["pending_payment", "awaiting_acceptance", "payment_failed"].includes(order.status)) {
          // A failed payment gave its promo use back; the order is going ahead after all, so take it again.
          if (order.status === "payment_failed") await retakePromoUse(db, order.promoCode);
          await db.update(orders).set({ status: "accepted", decidedAt: at, paidAt: at }).where(eq(orders.id, order.id));
        }
      }
    } else if (payment.capturedAt || ["canceled", "refunded"].includes(payment.status)) {
      return "ignored";
    } else if (event.type === "authorized" && order.status === "pending_payment") {
      await db.update(payments).set({ status: "authorized", clientSecret: null }).where(eq(payments.id, payment.id));
      await db.update(orders).set({
        status: "awaiting_acceptance", acceptDeadline: new Date(Date.now() + ACCEPT_WINDOW_MINUTES * 60_000),
      }).where(eq(orders.id, order.id));
    } else if (event.type === "failed" && !event.retryable && order.status === "pending_payment") {
      await db.update(payments).set({ status: "failed", clientSecret: null }).where(eq(payments.id, payment.id));
      await db.update(orders).set({ status: "payment_failed" }).where(eq(orders.id, order.id));
      await returnPromoUse(db, order.promoCode);
    } else if (event.type === "canceled" && ["pending_payment", "awaiting_acceptance", "payment_failed"].includes(order.status)) {
      await db.update(payments).set({ status: "canceled", clientSecret: null }).where(eq(payments.id, payment.id));
      await db.update(orders).set({ status: "cancelled", decidedAt: at }).where(eq(orders.id, order.id));
      if (order.status !== "payment_failed") await returnPromoUse(db, order.promoCode);
    }
    return "applied";
  });
}

export type Decision = "accept" | "decline" | "expire";

/** Kitchen decision on an order that is waiting. Accept captures the money; decline and expiry release the hold. */
export async function decideOrder(
  restaurantId: string, orderId: string, decision: Decision, requestedAt?: Date, prepMinutes?: number, inPersonRefundReturned = false,
) {
  return withTenant(restaurantId, async (db) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new HttpError(404, "Order not found");
    // A repeated confirmation of a decline whose refund was already recorded is answered, not refused, so a lost
    // response can be retried safely.
    if (order.status === "declined" && decision === "decline" && inPersonRefundReturned && order.paymentMode === "pay_later") {
      const settled = await loadPayment(db, order.id);
      if (settled?.provider === "manual" && settled.status === "refunded") return { status: "declined" as const, refundInPerson: true };
    }
    if (order.status !== "awaiting_acceptance") throw new HttpError(409, `This order is already ${order.status.replaceAll("_", " ")}`);
    // Pay-later orders have no card payment at all: accepting only tells the kitchen to start.
    const online = order.paymentMode === "online";
    const payment = online ? await loadPayment(db, order.id) : null;
    if (online && !payment) throw new HttpError(409, "This order has no payment");

    const now = requestedAt ?? new Date();
    const lapsed = order.acceptDeadline !== null && order.acceptDeadline.getTime() <= now.getTime();
    const effective: Decision = lapsed ? "expire" : decision;
    if (effective === "expire" && !lapsed) throw new HttpError(409, "The acceptance deadline has not passed");

    const provider = payment ? await getProvider() : null;
    const account = payment ? await paymentAccount(db, order) : null;
    if (effective === "accept") {
      if (payment && provider) {
        try {
          await provider.capture(payment.providerPaymentId, account);
        } catch {
          throw new OperationalError("payment-capture", "The payment could not be captured. Try again.");
        }
      }
      const decidedAt = new Date();
      const readyAt = prepMinutes === undefined ? order.pickupAt : new Date(decidedAt.getTime() + prepMinutes * 60_000);
      const pickupAt = order.pickupType === "scheduled" && order.pickupAt > readyAt ? order.pickupAt : readyAt;
      if (payment) await db.update(payments).set({ status: "captured", capturedAt: decidedAt, clientSecret: null }).where(eq(payments.id, payment.id));
      await db.update(orders)
        .set({ status: "accepted", decidedAt, prepMinutes: prepMinutes ?? null, pickupAt, ...(payment ? { paidAt: decidedAt } : {}) })
        .where(eq(orders.id, order.id));
      return { status: "accepted" as const, refundInPerson: false };
    }

    if (payment && provider) {
      try {
        await provider.cancel(payment.providerPaymentId, account);
      } catch {
        throw new OperationalError("payment-hold-release", "The card hold could not be released. Try again.");
      }
      await db.update(payments).set({ status: "canceled", clientSecret: null }).where(eq(payments.id, payment.id));
    }
    const status = effective === "decline" ? ("declined" as const) : ("expired" as const);
    // Declining an order the guest already paid for in person means handing the money back. The refund is only
    // recorded once staff confirm the money has been returned, never on a guess.
    const refundInPerson = !payment && !!order.paidAt;
    if (refundInPerson) {
      const manual = await loadPayment(db, order.id);
      if (!manual || manual.provider !== "manual" || manual.status !== "captured") {
        throw new HttpError(409, "There is no settled in-person payment to refund");
      }
      if (!inPersonRefundReturned) {
        throw new HttpError(409, "Return the payment in person and confirm the refund before declining this order");
      }
      await db.update(payments).set({ status: "refunded", refundStatus: "succeeded", refundedAt: now }).where(eq(payments.id, manual.id));
    }
    await db.update(orders).set({ status, decidedAt: now }).where(eq(orders.id, order.id));
    await returnPromoUse(db, order.promoCode);
    return { status, refundInPerson };
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
    const patch = step === "ready"
      ? { status: "ready", readyAt: now }
      : { status: "completed", completedAt: now, readyAt: order.readyAt ?? now, ...(order.orderType === "dine_in" ? { servedAt: now } : {}) };
    await db.update(orders).set(patch).where(eq(orders.id, order.id));
    return { status: patch.status };
  });
}

/** Cancels an accepted order and refunds a card charge or records a confirmed in-person refund. */
export async function cancelAcceptedOrder(
  restaurantId: string, orderId: string, now = new Date(), inPersonRefundReturned = false,
) {
  return withTenant(restaurantId, async (db) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new HttpError(404, "Order not found");
    const payment = await loadPayment(db, order.id);
    if (order.status === "cancelled" && order.paymentMode === "pay_later"
      && payment?.provider === "manual" && payment.status === "refunded" && inPersonRefundReturned) {
      return { status: "cancelled" as const, refundStatus: null, refundInPerson: true };
    }
    if (!["accepted", "ready"].includes(order.status)) throw new HttpError(409, `This order is ${order.status.replaceAll("_", " ")}`);

    if (order.paymentMode === "pay_later") {
      if (payment) {
        if (payment.provider !== "manual" || payment.status !== "captured") {
          throw new HttpError(409, "There is no settled in-person payment to refund");
        }
        if (!inPersonRefundReturned) {
          throw new HttpError(409, "Return the payment in person and confirm the refund before cancelling this order");
        }
        await db.update(payments).set({ status: "refunded", refundStatus: "succeeded", refundedAt: now }).where(eq(payments.id, payment.id));
      }
      await db.update(orders).set({ status: "cancelled", cancelledAt: now }).where(eq(orders.id, order.id));
      return { status: "cancelled" as const, refundStatus: null, refundInPerson: !!payment };
    }
    if (!payment || payment.status !== "captured") throw new HttpError(409, "There is no captured payment to refund");
    const provider = await getProvider();
    const attempt = payment.refundAttempt + 1;
    const refund = await provider.refund({
      orderId: order.id, restaurantId,
      providerPaymentId: payment.providerPaymentId, connectedAccountId: await paymentAccount(db, order),
      feeCents: payment.feeCents, attempt,
    }).catch(() => { throw new OperationalError("payment-refund", "The refund could not be started. Try again."); });
    await recordRefund(db, order, payment, refund, attempt, now);
    return { status: refund.status === "failed" ? order.status : "cancelled", refundStatus: refund.status, refundInPerson: false };
  });
}

/** Releases every order that waited past its deadline. Meant to run every minute or so. */
export async function expireStaleOrders(limit = 50): Promise<number> {
  const due = await pool.query("select * from orders_past_deadline($1)", [limit]);
  let expired = 0;
  for (let index = 0; index < due.rows.length; index += 4) {
    await Promise.all(due.rows.slice(index, index + 4).map(async (row) => {
      try {
        await decideOrder(row.restaurant_id, row.order_id, "expire");
        expired++;
      } catch (error) {
        if (error instanceof HttpError && [404, 409].includes(error.status)) return;
        await alert("order-expiry", "Unable to expire an order and release its hold", { orderId: row.order_id, restaurantId: row.restaurant_id });
        try {
          await withTenant(row.restaurant_id, (db) => db.update(orders)
            .set({ expiryRetryAt: new Date(Date.now() + 2 * 60_000) })
            .where(and(eq(orders.id, row.order_id), eq(orders.status, "awaiting_acceptance"))));
        } catch {
          log.error("order.expiry_retry_failed", { orderId: row.order_id });
        }
      }
    }));
  }
  return expired;
}

/** Checks pending Stripe refunds even if a refund webhook was delayed or missed. */
export async function reconcilePendingRefunds(limit = 12): Promise<number> {
  const due = await pool.query("select * from stripe_refunds_due($1)", [limit]);
  if (due.rows.length === 0) return 0;
  const provider = await getProvider();
  const retrieve = provider.retrieveRefund?.bind(provider);
  if (!retrieve) return 0;

  let reconciled = 0;
  for (let index = 0; index < due.rows.length; index += 4) {
    await Promise.all(due.rows.slice(index, index + 4).map(async (row) => {
      const failed = await withTenant(row.restaurant_id, async (db) => {
        const [order] = await db.select().from(orders).where(eq(orders.id, row.order_id)).for("update");
        if (!order) return;
        const payment = await loadPayment(db, order.id);
        if (!payment?.refundId || payment.refundStatus !== "pending" || payment.provider !== provider.name) return;
        if (payment.refundCheckedAt && Date.now() - payment.refundCheckedAt.getTime() < 2 * 60_000) return;
        try {
          const refund = await retrieve(payment.refundId, await paymentAccount(db, order));
          await recordRefund(db, order, payment, refund, payment.refundAttempt, new Date());
          if (refund.status !== "pending") reconciled++;
        } catch {
          await db.update(payments).set({ refundCheckedAt: new Date() }).where(eq(payments.id, payment.id));
          return true;
        }
      });
      if (failed) await alert("refund-reconciliation", "Could not reconcile a pending refund", { orderId: row.order_id });
    }));
  }

  return reconciled;
}

export async function listActiveOrders(db: Tx, offset = 0, limit = 100) {
  const joined = await db
    .select({ o: orders, tableLabel: diningTables.label })
    .from(orders)
    .leftJoin(diningTables, eq(orders.tableId, diningTables.id))
    .where(inArray(orders.status, ["awaiting_acceptance", "accepted", "ready"]))
    .orderBy(sql`(${orders.status} = 'awaiting_acceptance') desc`, sql`${orders.acceptDeadline} asc nulls last`, desc(orders.createdAt), orders.id)
    .limit(limit + 1)
    .offset(offset);
  const rows = joined.map((j) => j.o);
  const labels = new Map(joined.map((j) => [j.o.id, j.tableLabel]));
  const page = rows.slice(0, limit);
  const items = page.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, page.map((o) => o.id))) : [];
  return { hasMore: rows.length > limit, orders: page.map((o) => ({
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
    orderType: o.orderType,
    tableLabel: labels.get(o.id) ?? null,
    paymentMode: o.paymentMode,
    paidAt: o.paidAt?.toISOString() ?? null,
    items: items.filter((i) => i.orderId === o.id).map((i) => ({ name: i.name, quantity: i.quantity, options: i.options, note: i.note })),
  })) };
}
