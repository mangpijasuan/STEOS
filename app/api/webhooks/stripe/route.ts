import { alert } from "@/lib/alerts";
import { HttpError, handle, json } from "@/lib/http";
import { applyPaymentEvent } from "@/lib/orders";
import { getProvider } from "@/lib/payments/provider";

// Stripe signs the raw body, so it is read as text and never re-serialized.
export const POST = handle(async (req) => {
  const provider = await getProvider();
  const body = await req.text();
  let event;
  try {
    event = provider.parseWebhook(body, req.headers.get("stripe-signature"));
  } catch (error) {
    if (provider.name === "stripe" && error instanceof HttpError) {
      await alert("stripe-webhook", "A Stripe webhook was rejected", { status: error.status });
    }
    throw error;
  }
  if (!event) return json({ received: true, handled: false });
  return json({ received: true, result: await applyPaymentEvent(event) });
});
