import crypto from "node:crypto";
import { HttpError, handle, json } from "@/lib/http";
import { expireStaleOrders } from "@/lib/orders";
import { pruneRateLimits } from "@/lib/ratelimit";

// Called every minute by a scheduler. Protected by a shared secret. Also clears finished rate-limit windows.
export const POST = handle(async (req) => {
  const expected = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const ok = !!expected && given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) throw new HttpError(401, "Unauthorized");
  const expired = await expireStaleOrders();
  const rateLimitsPruned = await pruneRateLimits();
  return json({ expired, rateLimitsPruned });
});
