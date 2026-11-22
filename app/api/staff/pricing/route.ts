import { eq } from "drizzle-orm";
import { z } from "zod";
import { restaurants } from "../../../../db/schema";
import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { HttpError, handle, json } from "@/lib/http";
import { PLANS, estimateMonthly, isPlanKey } from "@/lib/pricing";

const numberParam = (url: URL, name: string, fallback: number, min: number, max: number) => {
  const raw = Number(url.searchParams.get(name) ?? fallback);
  if (!Number.isFinite(raw)) throw new HttpError(400, `${name} must be a number`);
  return Math.min(max, Math.max(min, Math.round(raw)));
};

// The plans, which one is active, and what each would cost at a given monthly online sales figure.
export const GET = handle(async (req) => {
  const staff = await requireStaff(req, ["owner"]);
  const url = new URL(req.url);
  const sales = numberParam(url, "monthlySalesCents", 1_000_000, 0, 100_000_000);
  const avg = numberParam(url, "avgOrderCents", 3000, 100, 100_000);
  const current = await withTenant(staff.restaurantId, async (db) => {
    const [r] = await db.select({ plan: restaurants.pricingPlan, changedAt: restaurants.pricingPlanChangedAt }).from(restaurants);
    return r;
  });
  return json({
    current: current.plan,
    changedAt: current.changedAt?.toISOString() ?? null,
    plans: Object.values(PLANS).map((p) => ({ ...p, estimate: estimateMonthly(p, sales, avg) })),
  });
});

const body = z.object({ plan: z.string() });

// Owners choose their own plan. It applies to new orders only; existing orders keep the fee they were created with.
export const PUT = handle(async (req) => {
  const staff = await requireStaff(req, ["owner"]);
  const { plan: key } = body.parse(await req.json());
  if (!isPlanKey(key)) throw new HttpError(400, "Unknown plan");
  const plan = PLANS[key];
  if (plan.unavailable) throw new HttpError(409, `This plan is not available yet: ${plan.unavailable}`);
  await withTenant(staff.restaurantId, (db) =>
    db
      .update(restaurants)
      .set({ pricingPlan: key, platformFeeBps: plan.feeBps, feeModel: plan.model, pricingPlanChangedAt: new Date() })
      .where(eq(restaurants.id, staff.restaurantId)),
  );
  return json({ current: key });
});
