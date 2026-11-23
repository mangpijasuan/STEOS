import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { restaurants } from "@/db/schema";

export const GET = handle(async (req) => {
  const staff = await requireStaff(req);
  const [r] = await withTenant(staff.restaurantId, (db) => db.select({ name: restaurants.name }).from(restaurants));
  return json({ email: staff.email, name: staff.name, role: staff.role, restaurantId: staff.restaurantId, restaurantName: r?.name ?? "" });
});
