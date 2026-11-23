import crypto from "node:crypto";
import { pool } from "@/lib/db";
import { HttpError, handle, json } from "@/lib/http";
import { expireStaleOrders, reconcilePendingRefunds } from "@/lib/orders";

export const POST = handle(async (req) => {
  const expected = process.env.CRON_SECRET;
  if (!expected || (process.env.NODE_ENV === "production" && (expected.length < 32 || /change-me|dev-only/i.test(expected)))) {
    throw new HttpError(503, "Scheduler secret is not configured");
  }
  const auth = req.headers.get("authorization") ?? "";
  const digest = (value: string) => crypto.createHash("sha256").update(value).digest();
  if (!crypto.timingSafeEqual(digest(auth), digest(`Bearer ${expected}`))) throw new HttpError(401, "Unauthorized");
  await pool.query("select purge_expired_runtime_data()");
  const expired = await expireStaleOrders();
  const refundsReconciled = await reconcilePendingRefunds();
  await pool.query("select record_order_worker_run()");
  return json({ expired, refundsReconciled });
});
