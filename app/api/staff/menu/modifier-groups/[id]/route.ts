import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, idParam, json } from "@/lib/http";
import { deleteGroup, updateGroup } from "@/lib/menu";
import { groupUpdate } from "@/lib/validation";

export const PUT = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  const id = await idParam(ctx);
  const input = groupUpdate.parse(await req.json());
  return json(await withTenant(staff.restaurantId, (db) => updateGroup(db, id, input)));
});

export const DELETE = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  const id = await idParam(ctx);
  await withTenant(staff.restaurantId, (db) => deleteGroup(db, id));
  return json({ ok: true });
});
