import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, idParam, json } from "@/lib/http";
import { deleteTable, updateTable } from "@/lib/tables";
import { tableUpdate } from "@/lib/validation";

export const PUT = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  const id = await idParam(ctx);
  const input = tableUpdate.parse(await req.json());
  return json(await withTenant(staff.restaurantId, (db) => updateTable(db, id, input)));
});

export const DELETE = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  const id = await idParam(ctx);
  await withTenant(staff.restaurantId, (db) => deleteTable(db, id));
  return json({ ok: true });
});
