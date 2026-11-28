import crypto from "node:crypto";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { diningTables, floors, orderItems, orders, payments, tableRequests } from "../db/schema";
import { pool, type Tx } from "./db";
import { HttpError } from "./http";
import { allow } from "./ratelimit";

const MAX_TABLES = 200;
const BROWSING_WINDOW_MS = 3 * 60_000;
const PENDING_PRIORITY_MS = 3 * 60_000;

export type TableState = "available" | "browsing" | "pending" | "preparing" | "ready" | "served" | "bill" | "service" | "paid";
export type RequestKind = "waiter" | "bill_cash" | "bill_card" | "water" | "other";

const REQUEST_LABELS: Record<RequestKind, string> = {
  waiter: "Call waiter",
  bill_cash: "Bill (Cash)",
  bill_card: "Bill (Card)",
  water: "Water",
  other: "Help",
};
export const requestLabel = (kind: RequestKind) => REQUEST_LABELS[kind];

/** Orders that count toward a table: not failed, declined, cancelled, expired or still waiting on a card. */
const LIVE = ["awaiting_acceptance", "accepted", "ready", "completed"];

export type DeriveInput = {
  orders: { status: string; paidAt: Date | null; createdAt: Date }[];
  requests: { kind: RequestKind }[];
  lastSeenAt: Date | null;
  now: Date;
};

/**
 * What a table's tile should say. Most urgent first: a customer asking for something, then food waiting to be
 * served, then an order the kitchen has not answered, then cooking, then waiting for the bill, then paid.
 */
export function deriveTableState({ orders: all, requests, lastSeenAt, now }: DeriveInput): { state: TableState; statusLabel: string; priority: boolean } {
  const live = all.filter((o) => LIVE.includes(o.status));
  const bill = requests.find((r) => r.kind === "bill_cash" || r.kind === "bill_card");
  if (bill) return { state: "bill", statusLabel: requestLabel(bill.kind), priority: true };
  const other = requests[0];
  if (other) return { state: "service", statusLabel: "Service Request", priority: true };

  if (live.some((o) => o.status === "ready")) return { state: "ready", statusLabel: "Ready", priority: true };
  const pending = live.filter((o) => o.status === "awaiting_acceptance");
  if (pending.length) {
    const waited = now.getTime() - Math.min(...pending.map((o) => o.createdAt.getTime()));
    return { state: "pending", statusLabel: "Pending", priority: waited > PENDING_PRIORITY_MS };
  }
  if (live.some((o) => o.status === "accepted")) return { state: "preparing", statusLabel: "Preparing", priority: false };
  if (live.length) {
    return live.every((o) => o.paidAt) ? { state: "paid", statusLabel: "Paid", priority: false } : { state: "served", statusLabel: "Served", priority: false };
  }
  if (lastSeenAt && now.getTime() - lastSeenAt.getTime() < BROWSING_WINDOW_MS) return { state: "browsing", statusLabel: "Browsing", priority: false };
  return { state: "available", statusLabel: "Available", priority: false };
}

// -------------------------------------------------------------------- board
export type BoardOrder = {
  id: string;
  number: number;
  status: string;
  paymentMode: string;
  paidAt: string | null;
  totalCents: number;
  tipCents: number;
  createdAt: string;
  items: { name: string; quantity: number; options: { name: string }[]; note: string | null }[];
};

/**
 * Active staff of the current restaurant, by display name. The runtime role cannot read staff_users (it holds
 * sign-in data), so this goes through a function that returns only ids and names, scoped to the current tenant.
 */
export async function staffDirectory(db: Tx): Promise<{ id: string; name: string }[]> {
  const res = await db.execute(sql`select id, display_name from tenant_staff_directory() order by display_name`);
  return res.rows.map((r) => ({ id: String(r.id), name: String(r.display_name) }));
}

export async function loadBoard(db: Tx, role: "owner" | "staff", now = new Date()) {
  const [floorRows, tableRows, staffRows, requestRows] = await Promise.all([
    db.select().from(floors).orderBy(asc(floors.sortOrder), asc(floors.name)),
    db.select().from(diningTables).orderBy(asc(diningTables.sortOrder), asc(diningTables.label)),
    staffDirectory(db),
    db.select().from(tableRequests).where(eq(tableRequests.status, "open")).orderBy(asc(tableRequests.createdAt)),
  ]);

  // Only orders since each table was last cleared.
  const orderRows = await db
    .select({ order: orders })
    .from(orders)
    .innerJoin(diningTables, eq(orders.tableId, diningTables.id))
    .where(and(gt(orders.createdAt, diningTables.clearedAt), inArray(orders.status, LIVE)))
    .orderBy(asc(orders.createdAt));
  const items = orderRows.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderRows.map((r) => r.order.id)))
    : [];

  const tables = tableRows.map((t) => {
    const own = orderRows.filter((r) => r.order.tableId === t.id).map((r) => r.order);
    const reqs = requestRows.filter((r) => r.tableId === t.id).map((r) => ({ id: r.id, kind: r.kind as RequestKind, createdAt: r.createdAt.toISOString() }));
    const derived = deriveTableState({ orders: own, requests: reqs, lastSeenAt: t.lastSeenAt, now });
    const assigned = staffRows.find((s) => s.id === t.assignedTo);
    return {
      id: t.id,
      label: t.label,
      floorId: t.floorId,
      seats: t.seats,
      active: t.active,
      assignedTo: assigned ? { id: assigned.id, name: assigned.name } : null,
      ...derived,
      requests: reqs,
      orders: own.map<BoardOrder>((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        paymentMode: o.paymentMode,
        paidAt: o.paidAt?.toISOString() ?? null,
        totalCents: o.totalCents,
        tipCents: o.tipCents,
        createdAt: o.createdAt.toISOString(),
        items: items.filter((i) => i.orderId === o.id).map((i) => ({ name: i.name, quantity: i.quantity, options: i.options as { name: string }[], note: i.note })),
      })),
      unpaidCents: own.filter((o) => !o.paidAt).reduce((s, o) => s + o.totalCents, 0),
      // Only owners need the QR secret (to print codes).
      ...(role === "owner" ? { qrToken: t.qrToken } : {}),
    };
  });

  return {
    floors: floorRows.map((f) => ({ id: f.id, name: f.name, sortOrder: f.sortOrder })),
    tables: tables.filter((t) => t.active || role === "owner"),
    staff: staffRows,
  };
}

// ------------------------------------------------------------- floors/tables
const newQrToken = () => crypto.randomBytes(24).toString("base64url");

function found<T>(rows: T[]): T {
  if (!rows[0]) throw new HttpError(404, "Not found");
  return rows[0];
}

export async function createFloor(db: Tx, restaurantId: string, name: string) {
  try {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(floors);
    return found(await db.insert(floors).values({ restaurantId, name, sortOrder: n }).returning());
  } catch (error) {
    if ((error as { cause?: { code?: string } })?.cause?.code === "23505") throw new HttpError(409, "There is already a floor with that name");
    throw error;
  }
}

export async function updateFloor(db: Tx, id: string, patch: { name?: string; sortOrder?: number }) {
  if (Object.keys(patch).length === 0) throw new HttpError(400, "Nothing to update");
  try {
    return found(await db.update(floors).set(patch).where(eq(floors.id, id)).returning());
  } catch (error) {
    if ((error as { cause?: { code?: string } })?.cause?.code === "23505") throw new HttpError(409, "There is already a floor with that name");
    throw error;
  }
}

export async function deleteFloor(db: Tx, id: string) {
  // Tables on this floor stay; they just lose their floor.
  found(await db.delete(floors).where(eq(floors.id, id)).returning({ id: floors.id }));
}

/** Adds several tables at once, with auto-generated QR secrets. Existing labels are skipped, not an error. */
export async function createTables(db: Tx, restaurantId: string, input: { labels: string[]; floorId: string | null; seats: number }) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(diningTables);
  if (n + input.labels.length > MAX_TABLES) throw new HttpError(409, `A restaurant can have up to ${MAX_TABLES} tables`);
  const existing = new Set((await db.select({ label: diningTables.label }).from(diningTables)).map((t) => t.label.toLowerCase()));
  const fresh = [...new Set(input.labels)].filter((l) => !existing.has(l.toLowerCase()));
  if (fresh.length === 0) throw new HttpError(409, "Those table names already exist");
  try {
    const rows = await db
      .insert(diningTables)
      .values(fresh.map((label, i) => ({ restaurantId, floorId: input.floorId, label, seats: input.seats, sortOrder: n + i, qrToken: newQrToken() })))
      .returning({ id: diningTables.id, label: diningTables.label });
    return { created: rows.length, skipped: input.labels.length - rows.length };
  } catch (error) {
    if ((error as { cause?: { code?: string } })?.cause?.code === "23503") throw new HttpError(404, "Floor not found");
    throw error;
  }
}

export async function updateTable(
  db: Tx,
  id: string,
  patch: { label?: string; seats?: number; floorId?: string | null; active?: boolean; assignedTo?: string | null },
) {
  if (Object.keys(patch).length === 0) throw new HttpError(400, "Nothing to update");
  if (patch.assignedTo) {
    // The directory only lists active staff of this restaurant (the database also enforces it with a composite key).
    if (!(await staffDirectory(db)).some((s) => s.id === patch.assignedTo)) throw new HttpError(404, "Staff member not found");
  }
  try {
    return found(await db.update(diningTables).set(patch).where(eq(diningTables.id, id)).returning({ id: diningTables.id }));
  } catch (error) {
    const code = (error as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") throw new HttpError(409, "There is already a table with that name");
    if (code === "23503") throw new HttpError(404, "Floor not found");
    throw error;
  }
}

/** Invalidates the old QR code. Printed codes for this table stop working. */
export async function regenerateQr(db: Tx, id: string) {
  return found(await db.update(diningTables).set({ qrToken: newQrToken() }).where(eq(diningTables.id, id)).returning({ qrToken: diningTables.qrToken }));
}

export async function deleteTable(db: Tx, id: string) {
  try {
    found(await db.delete(diningTables).where(eq(diningTables.id, id)).returning({ id: diningTables.id }));
  } catch (error) {
    if ((error as { cause?: { code?: string } })?.cause?.code === "23503") throw new HttpError(409, "This table has order history. Deactivate it instead.");
    throw error;
  }
}

/**
 * Ends the current party's visit. Refuses while any order is still being made or is unpaid, so a bill
 * cannot be lost by clearing the table too early.
 */
export async function clearTable(db: Tx, id: string, now = new Date()) {
  const [table] = await db.select().from(diningTables).where(eq(diningTables.id, id)).for("update");
  if (!table) throw new HttpError(404, "Table not found");
  const open = await db
    .select({ id: orders.id, status: orders.status, paidAt: orders.paidAt })
    .from(orders)
    .where(and(eq(orders.tableId, id), gt(orders.createdAt, table.clearedAt), inArray(orders.status, LIVE)));
  if (open.some((o) => ["awaiting_acceptance", "accepted", "ready"].includes(o.status))) {
    throw new HttpError(409, "There are orders still in progress. Serve or cancel them first.");
  }
  if (open.some((o) => !o.paidAt)) throw new HttpError(409, "This table has an unpaid bill. Mark it paid first.");
  await db.update(diningTables).set({ clearedAt: now }).where(eq(diningTables.id, id));
  await db.update(tableRequests).set({ status: "done", resolvedAt: now }).where(and(eq(tableRequests.tableId, id), eq(tableRequests.status, "open")));
}

// ----------------------------------------------------------------- requests
export async function resolveRequest(db: Tx, id: string, now = new Date()) {
  found(await db.update(tableRequests).set({ status: "done", resolvedAt: now }).where(and(eq(tableRequests.id, id), eq(tableRequests.status, "open"))).returning({ id: tableRequests.id }));
}

// -------------------------------------------------------------- manual pay
export type ManualMethod = "cash" | "card_terminal" | "other";

/**
 * Records that the restaurant collected payment itself (cash, or its own card machine) for a pay-later order.
 * Siamsil's fee for these orders is invoiced, not taken from a card payment.
 */
export async function markOrderPaid(db: Tx, restaurantId: string, orderId: string, method: ManualMethod, now = new Date(), opts: { allowUnaccepted?: boolean } = {}) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!order) throw new HttpError(404, "Order not found");
  if (order.paidAt) throw new HttpError(409, "This order is already paid");
  if (order.paymentMode !== "pay_later") throw new HttpError(409, "This order was paid online");
  // An order a staff member just rang up and took cash for is paid before the kitchen has seen it.
  if (!["accepted", "ready", "completed"].includes(order.status) && !(opts.allowUnaccepted && order.status === "awaiting_acceptance")) {
    throw new HttpError(409, order.status === "awaiting_acceptance" ? "Accept the order in the kitchen first" : `This order is ${order.status.replaceAll("_", " ")}`);
  }
  await db.insert(payments).values({
    restaurantId,
    orderId,
    provider: "manual",
    providerPaymentId: `manual_${orderId}`,
    status: "captured",
    // Reports count money by when it was captured, so cash must carry a timestamp like a card payment does.
    capturedAt: now,
    amountCents: order.totalCents,
    feeCents: 0,
    method,
  });
  await db.update(orders).set({ paidAt: now }).where(eq(orders.id, orderId));
  if (order.tableId) {
    // Paying settles the bill request, if there was one.
    await db
      .update(tableRequests)
      .set({ status: "done", resolvedAt: now })
      .where(and(eq(tableRequests.tableId, order.tableId), eq(tableRequests.status, "open"), inArray(tableRequests.kind, ["bill_cash", "bill_card"])));
  }
}

// ------------------------------------------------------------------- public
export type PublicTable = {
  restaurantId: string;
  tableId: string;
  label: string;
  floorName: string | null;
  slug: string;
  restaurantName: string;
  dineInEnabled: boolean;
  payLaterEnabled: boolean;
};

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

/** Finds the table behind a scanned QR code. 404 for an unknown, retired or malformed code. */
export async function resolveTable(token: string): Promise<PublicTable> {
  if (!TOKEN.test(token)) throw new HttpError(404, "This table code is not valid");
  const res = await pool.query("select * from public_table_by_token($1)", [token]);
  const r = res.rows[0];
  if (!r) throw new HttpError(404, "This table code is not valid");
  return {
    restaurantId: r.restaurant_id,
    tableId: r.table_id,
    label: r.label,
    floorName: r.floor_name,
    slug: r.slug,
    restaurantName: r.restaurant_name,
    dineInEnabled: r.dine_in_enabled,
    payLaterEnabled: r.pay_later_enabled,
  };
}

export async function touchTable(token: string): Promise<void> {
  if (!(await allow(`touch:${token}`, 3, 60_000))) return;
  await pool.query("select touch_table($1)", [token]);
}

/** A customer asks for something at their table. A repeat of a request that is still open is ignored. */
export async function createRequest(db: Tx, restaurantId: string, tableId: string, kind: RequestKind) {
  const open = await db
    .select({ id: tableRequests.id })
    .from(tableRequests)
    .where(and(eq(tableRequests.tableId, tableId), eq(tableRequests.kind, kind), eq(tableRequests.status, "open")));
  if (open[0]) return { id: open[0].id, duplicate: true };
  const [row] = await db.insert(tableRequests).values({ restaurantId, tableId, kind }).returning({ id: tableRequests.id });
  return { id: row.id, duplicate: false };
}

