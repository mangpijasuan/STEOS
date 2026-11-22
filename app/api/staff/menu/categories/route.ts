import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { createCategory } from "@/lib/menu";
import { categoryInput } from "@/lib/validation";

export const POST = handle(async (req) => {
  const staff = await requireStaff(req, ["owner"]);
  const input = categoryInput.parse(await req.json());
  return json(await withTenant(staff.restaurantId, (db) => createCategory(db, staff.restaurantId, input)), 201);
});
