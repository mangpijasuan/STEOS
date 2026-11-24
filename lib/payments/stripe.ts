import Stripe from "stripe";
import { HttpError } from "../http";
import type { Authorization, AuthorizationInput, PaymentEvent, PaymentProvider, Refund, RefundInput } from "./provider";

/**
 * Stripe Connect direct charges: the payment lives on the restaurant's own connected account and STOS
 * takes an application fee. Cards are authorized with manual capture, then captured when the kitchen accepts.
 */
function refundStatus(status: Stripe.Refund["status"]): Refund["status"] {
  if (status === "succeeded") return "succeeded";
  if (status === "failed" || status === "canceled") return "failed";
  return "pending";
}

export class StripeProvider implements PaymentProvider {
  readonly name = "stripe" as const;
  private stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, { timeout: 5000, maxNetworkRetries: 1 });
  }

  async createAuthorization(input: AuthorizationInput): Promise<Authorization> {
    if (!input.connectedAccountId) throw new HttpError(503, "This restaurant cannot take card payments yet");
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: "usd",
        capture_method: "manual",
        allowed_payment_method_types: ["card"],
        ...(input.feeCents > 0 ? { application_fee_amount: input.feeCents } : {}),
        description: input.description,
        metadata: { order_id: input.orderId, restaurant_id: input.restaurantId },
      },
      { stripeAccount: input.connectedAccountId, idempotencyKey: `order-${input.orderId}` },
    );
    if (!intent.client_secret) throw new Error("Stripe returned no client secret");
    return { providerPaymentId: intent.id, clientSecret: intent.client_secret };
  }

  async capture(id: string, account: string | null) {
    const intent = await this.stripe.paymentIntents.capture(id, undefined, { stripeAccount: account ?? undefined, idempotencyKey: `capture-${id}` });
    if (intent.status !== "succeeded") throw new Error("Stripe has not confirmed capture");
  }

  async cancel(id: string, account: string | null) {
    const options = { stripeAccount: account ?? undefined };
    try {
      await this.stripe.paymentIntents.cancel(id, undefined, { ...options, idempotencyKey: `cancel-${id}` });
    } catch (error) {
      const intent = await this.stripe.paymentIntents.retrieve(id, undefined, options);
      if (intent.status !== "canceled") throw error;
    }
  }

  async refund(input: RefundInput): Promise<Refund> {
    const refund = await this.stripe.refunds.create({
      payment_intent: input.providerPaymentId,
      ...(input.feeCents > 0 ? { refund_application_fee: true } : {}),
      metadata: {
        order_id: input.orderId,
        restaurant_id: input.restaurantId,
        refund_attempt: String(input.attempt),
      },
    }, {
      stripeAccount: input.connectedAccountId ?? undefined,
      idempotencyKey: `refund-${input.orderId}-${input.attempt}`,
    });
    return { id: refund.id, status: refundStatus(refund.status) };
  }

  async retrieveRefund(id: string, account: string | null): Promise<Refund> {
    const refund = await this.stripe.refunds.retrieve(id, undefined, { stripeAccount: account ?? undefined });
    return { id: refund.id, status: refundStatus(refund.status) };
  }

  parseWebhook(rawBody: string, signature: string | null): PaymentEvent | null {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new HttpError(503, "Webhook secret is not configured");
    if (!signature) throw new HttpError(400, "Missing signature");
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new HttpError(400, "Invalid signature");
    }
    const occurredAt = new Date(event.created * 1000);
    if (event.type === "refund.created" || event.type === "refund.updated" || event.type === "refund.failed") {
      const refund = event.data.object;
      const attempt = Number(refund.metadata?.refund_attempt);
      const intentId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
      if (!intentId || !Number.isSafeInteger(attempt) || attempt < 1) return null;
      return {
        eventId: event.id,
        type: "refund",
        occurredAt,
        providerPaymentId: intentId,
        restaurantId: refund.metadata?.restaurant_id ?? null,
        orderId: refund.metadata?.order_id ?? null,
        account: event.account ?? null,
        refund: { id: refund.id, status: refundStatus(refund.status), attempt },
      };
    }

    const types: Record<string, PaymentEvent["type"]> = {
      "payment_intent.amount_capturable_updated": "authorized",
      "payment_intent.succeeded": "captured",
      "payment_intent.canceled": "canceled",
      "payment_intent.payment_failed": "failed",
    };
    const type = types[event.type];
    if (!type) return null;
    const intent = event.data.object as Stripe.PaymentIntent;
    if (type === "authorized" && (intent.status !== "requires_capture" || intent.amount_capturable <= 0)) return null;
    return {
      eventId: event.id,
      type,
      occurredAt,
      retryable: type === "failed" && intent.status === "requires_payment_method",
      providerPaymentId: intent.id,
      restaurantId: intent.metadata?.restaurant_id ?? null,
      orderId: intent.metadata?.order_id ?? null,
      account: event.account ?? null,
    };
  }

  publicConfig(connectedAccountId: string | null) {
    return { publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null, connectedAccountId };
  }
}
