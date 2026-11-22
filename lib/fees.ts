// Platform fee on an order. Rates are experimental (see the master plan): every number here is a setting on the
// restaurant, and the exact calculation is saved on each order so past orders never change when pricing does.

export const STRIPE_PERCENT_BPS = 290; // 2.9%
export const STRIPE_FIXED_CENTS = 30;

export type FeeModel = "all_in" | "platform_plus_processing";

export type FeeSnapshot = {
  model: FeeModel;
  feeBps: number;
  feeBase: "subtotal";
  targetCents: number;
  processingEstimateCents: number;
  applicationFeeCents: number;
};

const halfUp = (numerator: number, denominator: number) => Math.floor((numerator + denominator / 2) / denominator);

export const estimateProcessingCents = (totalCents: number) =>
  halfUp(totalCents * STRIPE_PERCENT_BPS, 10000) + STRIPE_FIXED_CENTS;

/**
 * Application fee taken by SROS on a direct charge. The restaurant's own Stripe account pays the card processing.
 * - platform_plus_processing: SROS fee is feeBps of the food subtotal; the restaurant also pays processing.
 * - all_in: the restaurant's total cost is about feeBps of the subtotal, so SROS takes that target minus the
 *   estimated processing, never below zero.
 */
export function applicationFee(opts: { subtotalCents: number; totalCents: number; feeBps: number; model: FeeModel }): FeeSnapshot {
  const targetCents = halfUp(opts.subtotalCents * opts.feeBps, 10000);
  const processingEstimateCents = estimateProcessingCents(opts.totalCents);
  const raw = opts.model === "all_in" ? Math.max(0, targetCents - processingEstimateCents) : targetCents;
  return {
    model: opts.model,
    feeBps: opts.feeBps,
    feeBase: "subtotal",
    targetCents,
    processingEstimateCents,
    applicationFeeCents: Math.min(raw, opts.totalCents),
  };
}
