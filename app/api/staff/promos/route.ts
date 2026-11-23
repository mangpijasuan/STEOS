import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { createPromo, listPromos } from "@/lib/promos";
import { promoInput } from "@/lib/validation";

export const GET = handle(async (req) => {
  const staff = await requireStaff(req, ["owner"]);
  return json(await withTenant(staff.restaurantId, (db) => listPromos(db)));
});

export const POST = handle(async (req) => {
  const staff = await requireStaff(req, ["owner"]);
  const input = promoInput.parse(await req.json());
  return json(await withTenant(staff.restaurantId, (db) => createPromo(db, staff.restaurantId, input)), 201);
});
