import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, idParam, json } from "@/lib/http";
import { deletePromo, updatePromo } from "@/lib/promos";
import { promoUpdate } from "@/lib/validation";

export const PUT = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  const id = await idParam(ctx);
  const patch = promoUpdate.parse(await req.json());
  return json(await withTenant(staff.restaurantId, (db) => updatePromo(db, id, patch)));
});

export const DELETE = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  const id = await idParam(ctx);
  await withTenant(staff.restaurantId, (db) => deletePromo(db, id));
  return json({ ok: true });
});
