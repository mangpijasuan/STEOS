import { STRIPE_FIXED_CENTS, STRIPE_PERCENT_BPS, type FeeModel } from "./fees";

// Every number here is an experiment (see the master plan). Changing a plan never changes past orders,
// because each order saves its own fee snapshot.

export type PlanKey = "model_a" | "model_b" | "founding" | "growth";

export type Plan = {
  key: PlanKey;
  label: string;
  summary: string;
  feeBps: number;
  model: FeeModel;
  monthlyFeeCents: number;
  /** Plans that cannot be chosen yet, with the reason. */
  unavailable?: string;
};

export const PLANS: Record<PlanKey, Plan> = {
  model_a: {
    key: "model_a",
    label: "Simple: 3% + card fees",
    summary: "STOS charges 3% of the food subtotal. You pay Stripe's card fees yourself.",
    feeBps: 300,
    model: "platform_plus_processing",
    monthlyFeeCents: 0,
  },
  model_b: {
    key: "model_b",
    label: "All-in: 6%",
    summary: "One rate of about 6% of the food subtotal, card fees included.",
    feeBps: 600,
    model: "all_in",
    monthlyFeeCents: 0,
  },
  founding: {
    key: "founding",
    label: "Founding partner: 7% all-in",
    summary: "7% all-in for the first pilot restaurants, with direct support from the founder.",
    feeBps: 700,
    model: "all_in",
    monthlyFeeCents: 0,
  },
  growth: {
    key: "growth",
    label: "Growth: 5% + card fees + $79/month",
    summary: "Lower per-order rate for busier restaurants, with a monthly subscription.",
    feeBps: 500,
    model: "platform_plus_processing",
    monthlyFeeCents: 7900,
    unavailable: "Monthly billing is not built yet",
  },
};

export const isPlanKey = (value: string): value is PlanKey => value in PLANS;

const halfUp = (n: number, d: number) => Math.floor((n + d / 2) / d);

export type Estimate = {
  plan: PlanKey;
  orders: number;
  platformFeeCents: number;
  processingCents: number;
  monthlyFeeCents: number;
  /** What the restaurant pays in total each month: STOS fee, card fees and any subscription. */
  restaurantCostCents: number;
  /** What STOS keeps: its fee plus any subscription. Card fees go to Stripe. */
  srosRevenueCents: number;
  /** Restaurant cost as a share of sales, in basis points. */
  effectiveRateBps: number;
};

/** Monthly cost of a plan for a restaurant with this much online sales. Ignores tax and tips for simplicity. */
export function estimateMonthly(plan: Plan, salesCents: number, avgOrderCents: number): Estimate {
  const orders = Math.max(1, Math.round(salesCents / Math.max(1, avgOrderCents)));
  const processingCents = halfUp(salesCents * STRIPE_PERCENT_BPS, 10000) + orders * STRIPE_FIXED_CENTS;
  const target = halfUp(salesCents * plan.feeBps, 10000);
  const platformFeeCents = plan.model === "all_in" ? Math.max(0, target - processingCents) : target;
  const restaurantCostCents = platformFeeCents + processingCents + plan.monthlyFeeCents;
  return {
    plan: plan.key,
    orders,
    platformFeeCents,
    processingCents,
    monthlyFeeCents: plan.monthlyFeeCents,
    restaurantCostCents,
    srosRevenueCents: platformFeeCents + plan.monthlyFeeCents,
    effectiveRateBps: salesCents > 0 ? Math.round((restaurantCostCents * 10000) / salesCents) : 0,
  };
}
