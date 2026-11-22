import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, idParam, json } from "@/lib/http";
import { deleteCategory, updateCategory } from "@/lib/menu";
import { categoryUpdate } from "@/lib/validation";

export const PUT = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  const id = await idParam(ctx);
  const input = categoryUpdate.parse(await req.json());
  return json(await withTenant(staff.restaurantId, (db) => updateCategory(db, id, input)));
});

export const DELETE = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  const id = await idParam(ctx);
  await withTenant(staff.restaurantId, (db) => deleteCategory(db, id));
  return json({ ok: true });
});
