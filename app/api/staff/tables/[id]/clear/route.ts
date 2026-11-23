import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, idParam, json } from "@/lib/http";
import { clearTable } from "@/lib/tables";

// Any staff member can clear a table once its orders are served and paid.
export const POST = handle(async (req, ctx) => {
  const staff = await requireStaff(req);
  const id = await idParam(ctx);
  await withTenant(staff.restaurantId, (db) => clearTable(db, id));
  return json({ ok: true });
});
