import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { getMenu } from "@/lib/menu";

export const GET = handle(async (req) => {
  const staff = await requireStaff(req);
  return json(await withTenant(staff.restaurantId, (db) => getMenu(db)));
});
