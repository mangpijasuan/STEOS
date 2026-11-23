import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, idParam, json } from "@/lib/http";
import { resolveRequest } from "@/lib/tables";

export const POST = handle(async (req, ctx) => {
  const staff = await requireStaff(req);
  const id = await idParam(ctx);
  await withTenant(staff.restaurantId, (db) => resolveRequest(db, id));
  return json({ ok: true });
});
