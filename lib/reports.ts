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
  /** Fees SROS took on these orders. */
  platformFeeCents: number;
  /** Card fees, estimated at the standard rate. Stripe's own reports have the exact figure. */
  processingEstimateCents: number;
  /** What the restaurant keeps from card payments: gross minus SROS fee and estimated card fees. Tax is not income. */
  netEstimateCents: number;
  refunds: { count: number; totalCents: number };
  notCompleted: { declined: number; expired: number; paymentFailed: number };
  averageOrderCents: number;
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
      pay: payments.status,
    })
    .from(orders)
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .where(and(gte(orders.createdAt, from), lt(orders.createdAt, to)));

  const paid = rows.filter((o) => o.pay === "captured");
  const refunded = rows.filter((o) => o.pay === "refunded");
  const sum = (list: typeof rows, pick: (o: (typeof rows)[number]) => number) => list.reduce((s, o) => s + pick(o), 0);

  const grossCents = sum(paid, (o) => o.total);
  const platformFeeCents = sum(paid, (o) => o.fee);
  const processingEstimateCents = sum(paid, (o) => estimateProcessingCents(o.total));
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
    processingEstimateCents,
    netEstimateCents: grossCents - taxCents - platformFeeCents - processingEstimateCents,
    refunds: { count: refunded.length, totalCents: sum(refunded, (o) => o.total) },
    notCompleted: {
      declined: rows.filter((o) => o.status === "declined").length,
      expired: rows.filter((o) => o.status === "expired").length,
      paymentFailed: rows.filter((o) => o.status === "payment_failed").length,
    },
    averageOrderCents: paid.length ? Math.round(grossCents / paid.length) : 0,
    days: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
    topItems: [...byItem.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.salesCents - a.salesCents)
      .slice(0, 10),
  };
}
