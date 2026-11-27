import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { HttpError, handle, json } from "@/lib/http";
import { brandingEditSchema } from "@/lib/restaurant-branding";
import { getBranding, updateBranding } from "@/lib/settings";

// The restaurant's storefront look. Owner-only to read or change: it is edited on the owner's settings screen.
export const GET = handle(async (req) => {
  const staff = await requireStaff(req);
  if (staff.role !== "owner") throw new HttpError(403, "Not allowed for your role");
  return json(await withTenant(staff.restaurantId, (db) => getBranding(db)));
});

export const PUT = handle(async (req) => {
  const staff = await requireStaff(req);
  if (staff.role !== "owner") throw new HttpError(403, "Not allowed for your role");
  const edit = brandingEditSchema.parse(await req.json());
  return json(await withTenant(staff.restaurantId, (db) => updateBranding(db, staff.restaurantId, edit)));
});
