import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { listActiveOrders } from "@/lib/orders";

export const GET = handle(async (req) => {
  const staff = await requireStaff(req);
  return json({ orders: await withTenant(staff.restaurantId, (db) => listActiveOrders(db)) });
});
