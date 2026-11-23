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
  const compare = new URL(req.url).searchParams.get("compare") === "1";
  const result = await withTenant(staff.restaurantId, async (db) => {
    const report = await buildReport(db, from, to);
    if (!compare) return report;
    // The same length of time just before, so the dashboard can say "up 12% on the last 30 days". Sales are compared
    // after refunds (netChargedCents), the same figure the dashboard headlines.
    const before = await buildReport(db, new Date(from.getTime() - days * 86_400_000), from);
    return {
      ...report,
      previous: {
        paidOrders: before.paidOrders, grossCents: before.grossCents, netChargedCents: before.netChargedCents,
        averageOrderCents: before.averageOrderCents, netEstimateCents: before.netEstimateCents,
      },
    };
  });
  return json(result, 200, { "Cache-Control": "no-store" });
});
