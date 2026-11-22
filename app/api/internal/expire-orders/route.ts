import crypto from "node:crypto";
import { HttpError, handle, json } from "@/lib/http";
import { expireStaleOrders } from "@/lib/orders";

// Called every minute by a scheduler. Protected by a shared secret.
export const POST = handle(async (req) => {
  const expected = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const ok = !!expected && given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) throw new HttpError(401, "Unauthorized");
  return json({ expired: await expireStaleOrders() });
});
