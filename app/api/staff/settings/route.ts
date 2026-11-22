import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { HttpError, handle, json } from "@/lib/http";
import { getSettings, updateSettings } from "@/lib/settings";
import { settingsUpdate } from "@/lib/validation";

export const GET = handle(async (req) => {
  const staff = await requireStaff(req);
  return json(await withTenant(staff.restaurantId, (db) => getSettings(db)));
});

// Kitchen staff may pause or resume online ordering. Everything else is owner-only.
export const PATCH = handle(async (req) => {
  const staff = await requireStaff(req);
  const patch = settingsUpdate.parse(await req.json());
  const onlyPause = Object.keys(patch).every((k) => k === "acceptingOrders");
  if (!onlyPause && staff.role !== "owner") throw new HttpError(403, "Not allowed for your role");
  return json(await withTenant(staff.restaurantId, (db) => updateSettings(db, staff.restaurantId, patch)));
});
