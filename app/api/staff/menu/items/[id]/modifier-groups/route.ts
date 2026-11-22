import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, idParam, json } from "@/lib/http";
import { createGroup } from "@/lib/menu";
import { groupInput } from "@/lib/validation";

export const POST = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  const itemId = await idParam(ctx);
  const input = groupInput.parse(await req.json());
  return json(await withTenant(staff.restaurantId, (db) => createGroup(db, staff.restaurantId, itemId, input)), 201);
});
