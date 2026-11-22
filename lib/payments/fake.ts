import crypto from "node:crypto";
import type { Authorization, AuthorizationInput, PaymentEvent, PaymentProvider } from "./provider";

/** Development and test stand-in. It records calls and never talks to the network. */
export class FakeProvider implements PaymentProvider {
  readonly name = "fake" as const;
  calls: { action: "authorize" | "capture" | "cancel" | "refund"; id: string; amountCents?: number; feeCents?: number }[] = [];
  failCapture = false;
  failRefund = false;

  async createAuthorization(input: AuthorizationInput): Promise<Authorization> {
    // Same order id -> same payment, like a real idempotency key.
    const id = `fake_pi_${crypto.createHash("sha256").update(input.orderId).digest("hex").slice(0, 24)}`;
    this.calls.push({ action: "authorize", id, amountCents: input.amountCents, feeCents: input.feeCents });
    return { providerPaymentId: id, clientSecret: `${id}_secret` };
  }
  async capture(id: string) {
    if (this.failCapture) throw new Error("capture failed");
    this.calls.push({ action: "capture", id });
  }
  async cancel(id: string) {
    this.calls.push({ action: "cancel", id });
  }
  async refund(id: string) {
    if (this.failRefund) throw new Error("refund failed");
    this.calls.push({ action: "refund", id });
  }
  parseWebhook(rawBody: string): PaymentEvent | null {
    return JSON.parse(rawBody) as PaymentEvent;
  }
  publicConfig() {
    return { publishableKey: null, connectedAccountId: null };
  }
}
