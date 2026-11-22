import { describe, expect, it } from "vitest";
import { PLANS, estimateMonthly } from "../lib/pricing";

const SALES = 1_000_000; // $10,000
const AVG = 3000; // $30

describe("plan estimates at $10,000 a month and $30 orders", () => {
  it("simple 3% + card fees", () => {
    const e = estimateMonthly(PLANS.model_a, SALES, AVG);
    expect(e.processingCents).toBe(29_000 + 333 * 30);
    expect(e.platformFeeCents).toBe(30_000);
    expect(e.srosRevenueCents).toBe(30_000);
    expect(e.restaurantCostCents).toBe(30_000 + e.processingCents);
  });

  it("all-in 6%: the restaurant pays 6% and SROS keeps it minus card fees", () => {
    const e = estimateMonthly(PLANS.model_b, SALES, AVG);
    expect(e.restaurantCostCents).toBe(60_000);
    expect(e.srosRevenueCents).toBe(60_000 - e.processingCents);
    expect(e.effectiveRateBps).toBe(600);
  });

  it("founding 7% all-in", () => {
    const e = estimateMonthly(PLANS.founding, SALES, AVG);
    expect(e.restaurantCostCents).toBe(70_000);
    expect(e.srosRevenueCents).toBe(70_000 - e.processingCents);
  });

  it("growth plan adds the monthly subscription", () => {
    const e = estimateMonthly(PLANS.growth, SALES, AVG);
    expect(e.srosRevenueCents).toBe(50_000 + 7_900);
    expect(e.restaurantCostCents).toBe(50_000 + 7_900 + e.processingCents);
  });

  it("all-in never makes SROS pay for a small restaurant's card fees", () => {
    const e = estimateMonthly(PLANS.model_b, 5_000, 500); // $50 a month in $5 orders: card fees exceed 6%
    expect(e.platformFeeCents).toBe(0);
    expect(e.srosRevenueCents).toBe(0);
  });

  it("handles zero sales", () => {
    expect(estimateMonthly(PLANS.model_a, 0, AVG).effectiveRateBps).toBe(0);
  });
});
