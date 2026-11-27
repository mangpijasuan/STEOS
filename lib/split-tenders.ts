import { z } from "zod";

export const tenderSchema = z.object({ method: z.enum(["cash", "card_terminal", "other"]), amountCents: z.number().int().min(1).max(2147483647) }).strict();
export const splitTenderSchema = z.array(tenderSchema).min(2).max(20);
export type Tender = z.infer<typeof tenderSchema>;

/** Strict decimal entry: reject fractional pennies, scientific notation, negatives and out-of-range amounts. */
export function parseTenderAmount(text: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 2147483647 ? cents : null;
}

/** Divide integer cents deterministically; the first remainder guests receive one extra cent. */
export function equalShares(total: number, count: number): number[] {
  if (!Number.isSafeInteger(total) || !Number.isInteger(count) || count < 2 || count > 20 || total < count) return [];
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => base + (i < total % count ? 1 : 0));
}
export function matchesTotal(parts: Tender[], total: number): boolean {
  return Number.isSafeInteger(total) && splitTenderSchema.safeParse(parts).success && parts.reduce((sum, p) => sum + p.amountCents, 0) === total;
}
