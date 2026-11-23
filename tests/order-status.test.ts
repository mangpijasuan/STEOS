import { describe, expect, it } from "vitest";
import { endedPayLaterNote, shouldKeepPolling } from "../lib/order-status";

const o = (over: Record<string, unknown>) => ({ status: "accepted", paymentMode: "online", paymentState: "unpaid", refundStatus: null, ...over }) as Parameters<typeof shouldKeepPolling>[0];

describe("when the customer's status page keeps watching", () => {
  it("watches an order that is still moving", () => {
    for (const status of ["pending_payment", "awaiting_acceptance", "accepted", "ready"]) expect(shouldKeepPolling(o({ status }))).toBe(true);
  });
  it("stops once a card order is finished", () => {
    expect(shouldKeepPolling(o({ status: "completed", paymentState: "paid" }))).toBe(false);
    for (const status of ["declined", "expired", "cancelled", "payment_failed"]) expect(shouldKeepPolling(o({ status }))).toBe(false);
  });
  it("keeps watching while a card refund is in progress", () => {
    expect(shouldKeepPolling(o({ status: "cancelled", refundStatus: "pending" }))).toBe(true);
  });
  it("keeps watching a served pay-later order until the bill is paid", () => {
    expect(shouldKeepPolling(o({ status: "completed", paymentMode: "pay_later", paymentState: "unpaid" }))).toBe(true);
    expect(shouldKeepPolling(o({ status: "completed", paymentMode: "pay_later", paymentState: "paid" }))).toBe(false);
  });
  it("does not keep watching an ended pay-later order, paid or not", () => {
    expect(shouldKeepPolling(o({ status: "cancelled", paymentMode: "pay_later", paymentState: "refunded" }))).toBe(false);
    expect(shouldKeepPolling(o({ status: "declined", paymentMode: "pay_later", paymentState: "unpaid" }))).toBe(false);
  });
});

describe("what a seated guest is told when a pay-later order ends", () => {
  it("never mentions a card hold or a card refund", () => {
    for (const status of ["declined", "expired", "cancelled"]) {
      expect(endedPayLaterNote({ status, paymentState: "unpaid" })).toMatch(/Nothing has been charged/);
      expect(endedPayLaterNote({ status, paymentState: "unpaid" })).not.toMatch(/card|hold/i);
    }
  });
  it("says a payment taken in person was handed back", () => {
    expect(endedPayLaterNote({ status: "cancelled", paymentState: "refunded" })).toBe("Your payment was handed back to you in person.");
  });
  it("says nothing for an order that is still going", () => {
    expect(endedPayLaterNote({ status: "accepted", paymentState: "unpaid" })).toBeNull();
  });
});
