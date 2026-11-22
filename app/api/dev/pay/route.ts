import { z } from "zod";
import { HttpError, handle, json } from "@/lib/http";
import { applyPaymentEvent } from "@/lib/orders";
import { pool } from "@/lib/db";

// Development only: stands in for the card form and Stripe's webhook when PAYMENTS_PROVIDER=fake.
export const POST = handle(async (req) => {
  if (process.env.PAYMENTS_PROVIDER !== "fake" || process.env.NODE_ENV === "production") throw new HttpError(404, "Not found");
  const { orderToken, outcome } = z.object({ orderToken: z.string().min(20), outcome: z.enum(["authorized", "failed"]) }).parse(await req.json());
  const { createHash } = await import("node:crypto");
  const found = await pool.query("select * from public_order_by_token($1)", [createHash("sha256").update(orderToken).digest("hex")]);
  const row = found.rows[0];
  if (!row) throw new HttpError(404, "Order not found");
  const { withTenant } = await import("@/lib/db");
  const { payments } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const payment = await withTenant(row.restaurant_id, async (db) => (await db.select().from(payments).where(eq(payments.orderId, row.order_id)))[0]);
  if (!payment) throw new HttpError(409, "No payment yet");
  const result = await applyPaymentEvent({
    eventId: `fake_evt_${crypto.randomUUID()}`,
    type: outcome,
    providerPaymentId: payment.providerPaymentId,
    restaurantId: row.restaurant_id,
    orderId: row.order_id,
    account: null,
  });
  return json({ result });
});
