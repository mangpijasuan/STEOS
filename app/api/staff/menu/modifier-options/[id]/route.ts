import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, idParam, json } from "@/lib/http";
import { deleteOption, updateOption } from "@/lib/menu";
import { optionUpdate } from "@/lib/validation";

export const PUT = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  const id = await idParam(ctx);
  const input = optionUpdate.parse(await req.json());
  return json(await withTenant(staff.restaurantId, (db) => updateOption(db, id, input)));
});

export const DELETE = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  const id = await idParam(ctx);
  await withTenant(staff.restaurantId, (db) => deleteOption(db, id));
  return json({ ok: true });
});
