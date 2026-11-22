import Stripe from "stripe";
import { HttpError } from "../http";
import type { Authorization, AuthorizationInput, PaymentEvent, PaymentProvider } from "./provider";

/**
 * Stripe Connect direct charges: the payment lives on the restaurant's own connected account and SROS
 * takes an application fee. Cards are authorized with manual capture, then captured when the kitchen accepts.
 */
export class StripeProvider implements PaymentProvider {
  readonly name = "stripe" as const;
  private stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  async createAuthorization(input: AuthorizationInput): Promise<Authorization> {
    if (!input.connectedAccountId) throw new HttpError(503, "This restaurant cannot take card payments yet");
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: "usd",
        capture_method: "manual",
        automatic_payment_methods: { enabled: true },
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
    await this.stripe.paymentIntents.capture(id, undefined, { stripeAccount: account ?? undefined });
  }

  async cancel(id: string, account: string | null) {
    await this.stripe.paymentIntents.cancel(id, undefined, { stripeAccount: account ?? undefined });
  }

  async refund(id: string, account: string | null) {
    // Direct charge: refund on the connected account and give back SROS's application fee too.
    await this.stripe.refunds.create({ payment_intent: id, refund_application_fee: true }, { stripeAccount: account ?? undefined });
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
    const types: Record<string, PaymentEvent["type"]> = {
      "payment_intent.amount_capturable_updated": "authorized",
      "payment_intent.succeeded": "captured",
      "payment_intent.canceled": "canceled",
      "payment_intent.payment_failed": "failed",
    };
    const type = types[event.type];
    if (!type) return null;
    const intent = event.data.object as Stripe.PaymentIntent;
    return {
      eventId: event.id,
      type,
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
