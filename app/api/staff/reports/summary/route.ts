import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { HttpError, handle, json } from "@/lib/http";
import { buildReport } from "@/lib/reports";

// Sales and fee summary for the last N days (default 30, at most 366). Owners only, because it shows money.
export const GET = handle(async (req) => {
  const staff = await requireStaff(req, ["owner"]);
  const days = Number(new URL(req.url).searchParams.get("days") ?? 30);
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new HttpError(400, "days must be between 1 and 366");
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return json(await withTenant(staff.restaurantId, (db) => buildReport(db, from, to)), 200, { "Cache-Control": "no-store" });
});
