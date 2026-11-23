import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { HttpError, handle, json } from "@/lib/http";
import { listActiveOrders } from "@/lib/orders";

export const GET = handle(async (req) => {
  const staff = await requireStaff(req);
  const offset = Number(new URL(req.url).searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) throw new HttpError(400, "Invalid offset");
  return json(await withTenant(staff.restaurantId, (db) => listActiveOrders(db, offset)), 200, { "Cache-Control": "no-store" });
});
