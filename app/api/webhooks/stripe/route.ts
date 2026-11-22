import { handle, json } from "@/lib/http";
import { applyPaymentEvent } from "@/lib/orders";
import { getProvider } from "@/lib/payments/provider";

// Stripe signs the raw body, so it is read as text and never re-serialized.
export const POST = handle(async (req) => {
  const provider = await getProvider();
  const event = provider.parseWebhook(await req.text(), req.headers.get("stripe-signature"));
  if (!event) return json({ received: true, handled: false });
  return json({ received: true, result: await applyPaymentEvent(event) });
});
