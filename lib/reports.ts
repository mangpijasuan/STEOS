import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { orderItems, orders, payments, restaurants } from "../db/schema";
import type { Tx } from "./db";
import { estimateProcessingCents } from "./fees";

export type Report = {
  from: string;
  to: string;
  timezone: string;
  paidOrders: number;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  grossCents: number;
  /** Fees SROS earned on these orders, whether taken from the card payment or invoiced. */
  platformFeeCents: number;
  /** The part of the SROS fee on orders the restaurant collected itself (cash, own card machine). Billed separately. */
  platformFeeInvoicedCents: number;
  /** Card fees on online payments, estimated at the standard rate. Stripe's own reports have the exact figure. */
  processingEstimateCents: number;
  /** What the restaurant keeps from card payments: gross minus SROS fee and estimated card fees. Tax is not income. */
  netEstimateCents: number;
  refunds: { count: number; totalCents: number };
  notCompleted: { declined: number; expired: number; paymentFailed: number };
  averageOrderCents: number;
  /** Paid orders by how they were paid. */
  byMethod: Record<"card_online" | "cash" | "card_terminal" | "other", { orders: number; grossCents: number }>;
  /** Paid orders by where they came from. */
  byType: Record<"pickup" | "dine_in" | "counter", { orders: number; grossCents: number }>;
  days: { date: string; orders: number; grossCents: number }[];
  topItems: { name: string; quantity: number; salesCents: number }[];
};

function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Sales and fee totals for one restaurant. Runs inside withTenant, so it only ever sees that restaurant. */
export async function buildReport(db: Tx, from: Date, to: Date): Promise<Report> {
  const [r] = await db.select({ timezone: restaurants.timezone }).from(restaurants);
  const timezone = r.timezone;

  const rows = await db
    .select({
      id: orders.id,
      status: orders.status,
      createdAt: orders.createdAt,
      subtotal: orders.subtotalCents,
      tax: orders.taxCents,
      tip: orders.tipCents,
      total: orders.totalCents,
      fee: orders.feeCents,
      feeCollection: orders.feeCollection,
      orderType: orders.orderType,
      pay: payments.status,
      method: payments.method,
    })
    .from(orders)
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .where(and(gte(orders.createdAt, from), lt(orders.createdAt, to)));

  const paid = rows.filter((o) => o.pay === "captured");
  const refunded = rows.filter((o) => o.pay === "refunded");
  const sum = (list: typeof rows, pick: (o: (typeof rows)[number]) => number) => list.reduce((s, o) => s + pick(o), 0);

  const grossCents = sum(paid, (o) => o.total);
  const platformFeeCents = sum(paid, (o) => o.fee);
  // Only online card payments have fees we can estimate. Cash costs nothing, and a restaurant's own card machine
  // has terms we do not know.
  const processingEstimateCents = sum(paid.filter((o) => o.method === "card_online"), (o) => estimateProcessingCents(o.total));
  const platformFeeInvoicedCents = sum(paid.filter((o) => o.feeCollection === "invoice"), (o) => o.fee);

  const byMethod = { card_online: { orders: 0, grossCents: 0 }, cash: { orders: 0, grossCents: 0 }, card_terminal: { orders: 0, grossCents: 0 }, other: { orders: 0, grossCents: 0 } };
  const byType = { pickup: { orders: 0, grossCents: 0 }, dine_in: { orders: 0, grossCents: 0 }, counter: { orders: 0, grossCents: 0 } };
  for (const o of paid) {
    const m = byMethod[(o.method as keyof typeof byMethod) in byMethod ? (o.method as keyof typeof byMethod) : "other"];
    m.orders += 1;
    m.grossCents += o.total;
    const t = byType[(o.orderType as keyof typeof byType) in byType ? (o.orderType as keyof typeof byType) : "pickup"];
    t.orders += 1;
    t.grossCents += o.total;
  }
  const taxCents = sum(paid, (o) => o.tax);

  const byDay = new Map<string, { orders: number; grossCents: number }>();
  for (const o of paid) {
    const key = localDate(o.createdAt, timezone);
    const day = byDay.get(key) ?? { orders: 0, grossCents: 0 };
    day.orders += 1;
    day.grossCents += o.total;
    byDay.set(key, day);
  }

  const paidIds = paid.map((o) => o.id);
  const items = paidIds.length
    ? await db
        .select({ name: orderItems.name, quantity: orderItems.quantity, line: orderItems.lineTotalCents })
        .from(orderItems)
        .where(inArray(orderItems.orderId, paidIds))
    : [];
  const byItem = new Map<string, { quantity: number; salesCents: number }>();
  for (const i of items) {
    const row = byItem.get(i.name) ?? { quantity: 0, salesCents: 0 };
    row.quantity += i.quantity;
    row.salesCents += i.line;
    byItem.set(i.name, row);
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    timezone,
    paidOrders: paid.length,
    subtotalCents: sum(paid, (o) => o.subtotal),
    taxCents,
    tipCents: sum(paid, (o) => o.tip),
    grossCents,
    platformFeeCents,
    platformFeeInvoicedCents,
    processingEstimateCents,
    netEstimateCents: grossCents - taxCents - platformFeeCents - processingEstimateCents,
    refunds: { count: refunded.length, totalCents: sum(refunded, (o) => o.total) },
    notCompleted: {
      declined: rows.filter((o) => o.status === "declined").length,
      expired: rows.filter((o) => o.status === "expired").length,
      paymentFailed: rows.filter((o) => o.status === "payment_failed").length,
    },
    averageOrderCents: paid.length ? Math.round(grossCents / paid.length) : 0,
    byMethod,
    byType,
    days: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
    topItems: [...byItem.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.salesCents - a.salesCents)
      .slice(0, 10),
  };
}
