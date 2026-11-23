// What the customer's status page needs to decide, kept apart from the page so it can be tested.

type Watched = {
  status: string;
  paymentMode: string;
  paymentState: "paid" | "refunded" | "unpaid";
  refundStatus: "pending" | "succeeded" | "failed" | null;
};

const FINAL = new Set(["completed", "declined", "expired", "cancelled", "payment_failed"]);

/**
 * True while something can still change for the guest: the order is moving, a card refund is in progress, or a pay-later
 * bill is still open. A seated guest's order is "completed" once served, but they have not paid until staff take payment,
 * so the page keeps watching until it is settled.
 */
export function shouldKeepPolling(o: Watched): boolean {
  if (!FINAL.has(o.status)) return true;
  if (o.refundStatus === "pending") return true;
  return o.paymentMode === "pay_later" && o.status === "completed" && o.paymentState === "unpaid";
}

/** What a seated guest on a pay-later order is told once it has ended, with no mention of a card hold or card refund. */
export function endedPayLaterNote(o: Pick<Watched, "status" | "paymentState">): string | null {
  if (!["declined", "expired", "cancelled"].includes(o.status)) return null;
  if (o.paymentState === "refunded") return "Your payment was handed back to you in person.";
  return "Nothing has been charged. Please ask a member of staff if you have questions.";
}
