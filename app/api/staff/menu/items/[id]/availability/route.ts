import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, idParam, json } from "@/lib/http";
import { setItemAvailability } from "@/lib/menu";
import { availabilityInput } from "@/lib/validation";

// Kitchen staff may mark items sold out, so this route allows both roles.
export const PATCH = handle(async (req, ctx) => {
  const staff = await requireStaff(req);
  const id = await idParam(ctx);
  const { available } = availabilityInput.parse(await req.json());
  return json(await withTenant(staff.restaurantId, (db) => setItemAvailability(db, id, available)));
});
