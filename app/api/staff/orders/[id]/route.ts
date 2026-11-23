import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, idParam, json } from "@/lib/http";
import { getReceipt } from "@/lib/pos";

// Everything needed to print a receipt for one order.
export const GET = handle(async (req, ctx) => {
  const staff = await requireStaff(req);
  const id = await idParam(ctx);
  return json(await withTenant(staff.restaurantId, (db) => getReceipt(db, id)), 200, { "Cache-Control": "no-store" });
});
