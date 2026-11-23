import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, idParam, json } from "@/lib/http";
import { regenerateQr } from "@/lib/tables";

// Makes the table's old printed QR code stop working. Use it if a code was photographed or leaked.
export const POST = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  const id = await idParam(ctx);
  return json(await withTenant(staff.restaurantId, (db) => regenerateQr(db, id)));
});
