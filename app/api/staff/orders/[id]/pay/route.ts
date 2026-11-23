import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, idParam, json } from "@/lib/http";
import { log } from "@/lib/log";
import { markOrderPaid } from "@/lib/tables";
import { payInput } from "@/lib/validation";

// Staff record that a pay-later order was paid in person (cash or the restaurant's own card machine).
export const POST = handle(async (req, ctx) => {
  const staff = await requireStaff(req);
  const id = await idParam(ctx);
  const { method } = payInput.parse(await req.json());
  await withTenant(staff.restaurantId, (db) => markOrderPaid(db, staff.restaurantId, id, method));
  log.info("order.paid_in_person", { restaurantId: staff.restaurantId, orderId: id, method, staffUserId: staff.staffUserId });
  return json({ ok: true });
});
