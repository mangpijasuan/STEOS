import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, idParam, json } from "@/lib/http";
import { deleteFloor, updateFloor } from "@/lib/tables";
import { floorUpdate } from "@/lib/validation";

export const PUT = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  const id = await idParam(ctx);
  const patch = floorUpdate.parse(await req.json());
  return json(await withTenant(staff.restaurantId, (db) => updateFloor(db, id, patch)));
});

export const DELETE = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  const id = await idParam(ctx);
  await withTenant(staff.restaurantId, (db) => deleteFloor(db, id));
  return json({ ok: true });
});
