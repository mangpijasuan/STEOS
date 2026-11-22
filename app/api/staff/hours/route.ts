import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { getHours, replaceHours } from "@/lib/settings";
import { hoursInput } from "@/lib/validation";

export const GET = handle(async (req) => {
  const staff = await requireStaff(req);
  return json({ periods: await withTenant(staff.restaurantId, (db) => getHours(db)) });
});

export const PUT = handle(async (req) => {
  const staff = await requireStaff(req, ["owner"]);
  const { periods } = hoursInput.parse(await req.json());
  return json({ periods: await withTenant(staff.restaurantId, (db) => replaceHours(db, staff.restaurantId, periods)) });
});
