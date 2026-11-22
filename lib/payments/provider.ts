import { HttpError } from "../http";

export type AuthorizationInput = {
  orderId: string;
  restaurantId: string;
  amountCents: number;
  feeCents: number;
  connectedAccountId: string | null;
  description: string;
};

export type Authorization = { providerPaymentId: string; clientSecret: string };

/** What a provider tells us happened, in our own words. */
export type PaymentEvent = {
  eventId: string;
  type: "authorized" | "captured" | "canceled" | "failed";
  providerPaymentId: string;
  restaurantId: string | null;
  orderId: string | null;
  account: string | null;
};

export interface PaymentProvider {
  readonly name: "stripe" | "fake";
  /** Holds the money on the customer's card. Nothing is charged until capture. */
  createAuthorization(input: AuthorizationInput): Promise<Authorization>;
  capture(providerPaymentId: string, connectedAccountId: string | null): Promise<void>;
  cancel(providerPaymentId: string, connectedAccountId: string | null): Promise<void>;
  /** Returns the whole payment to the customer, including SROS's application fee. */
  refund(providerPaymentId: string, connectedAccountId: string | null): Promise<void>;
  /** Checks the signature and translates the event. Returns null for events we do not use. */
  parseWebhook(rawBody: string, signature: string | null): PaymentEvent | null;
  publicConfig(connectedAccountId: string | null): { publishableKey: string | null; connectedAccountId: string | null };
}

let cached: PaymentProvider | undefined;

export async function getProvider(): Promise<PaymentProvider> {
  if (cached) return cached;
  if (process.env.PAYMENTS_PROVIDER === "fake") {
    if (process.env.NODE_ENV === "production") throw new Error("The fake payment provider cannot run in production");
    const { FakeProvider } = await import("./fake");
    return (cached = new FakeProvider());
  }
  if (!process.env.STRIPE_SECRET_KEY) throw new HttpError(503, "Payments are not set up yet");
  const { StripeProvider } = await import("./stripe");
  return (cached = new StripeProvider(process.env.STRIPE_SECRET_KEY));
}

export const resetProviderForTests = () => {
  cached = undefined;
};
