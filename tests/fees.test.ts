import { describe, expect, it } from "vitest";
import { applicationFee, estimateProcessingCents } from "../lib/fees";

describe("fees", () => {
  it("estimates card processing at 2.9% + 30 cents", () => {
    expect(estimateProcessingCents(3000)).toBe(117); // 87 + 30
  });

  it("all-in: restaurant's total cost is the target, so STOS takes target minus processing", () => {
    const f = applicationFee({ subtotalCents: 3000, totalCents: 3263, feeBps: 600, model: "all_in" });
    expect(f.targetCents).toBe(180);
    expect(f.applicationFeeCents).toBe(180 - f.processingEstimateCents);
  });

  it("all-in never goes negative on small orders", () => {
    const f = applicationFee({ subtotalCents: 500, totalCents: 544, feeBps: 600, model: "all_in" });
    expect(f.applicationFeeCents).toBe(0);
  });

  it("platform plus processing: fee is the platform rate on the subtotal only", () => {
    const f = applicationFee({ subtotalCents: 3000, totalCents: 3263, feeBps: 300, model: "platform_plus_processing" });
    expect(f.applicationFeeCents).toBe(90);
    expect(f.feeBase).toBe("subtotal");
  });
});
