import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { createItem } from "@/lib/menu";
import { itemInput } from "@/lib/validation";

export const POST = handle(async (req) => {
  const staff = await requireStaff(req, ["owner"]);
  const input = itemInput.parse(await req.json());
  return json(await withTenant(staff.restaurantId, (db) => createItem(db, staff.restaurantId, input)), 201);
});
