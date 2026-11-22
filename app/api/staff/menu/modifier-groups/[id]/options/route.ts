import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, idParam, json } from "@/lib/http";
import { createOption } from "@/lib/menu";
import { optionInput } from "@/lib/validation";

export const POST = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  const groupId = await idParam(ctx);
  const input = optionInput.parse(await req.json());
  return json(await withTenant(staff.restaurantId, (db) => createOption(db, staff.restaurantId, groupId, input)), 201);
});
