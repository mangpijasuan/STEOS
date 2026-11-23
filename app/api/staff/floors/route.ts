import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { createFloor } from "@/lib/tables";
import { floorInput } from "@/lib/validation";

export const POST = handle(async (req) => {
  const staff = await requireStaff(req, ["owner"]);
  const { name } = floorInput.parse(await req.json());
  return json(await withTenant(staff.restaurantId, (db) => createFloor(db, staff.restaurantId, name)), 201);
});
