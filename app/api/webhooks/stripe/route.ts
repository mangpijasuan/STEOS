import { alert } from "@/lib/alerts";
import { HttpError, handle, json } from "@/lib/http";
import { log } from "@/lib/log";
import { applyPaymentEvent } from "@/lib/orders";
import { getProvider } from "@/lib/payments/provider";

// Stripe signs the raw body, so it is read as text and never re-serialized.
export const POST = handle(async (req) => {
  const provider = await getProvider();
  let event;
  try {
    event = provider.parseWebhook(await req.text(), req.headers.get("stripe-signature"));
  } catch (error) {
    // A bad signature on every event usually means STRIPE_WEBHOOK_SECRET is wrong, and then no order
    // ever reaches the kitchen. Alerts are throttled, so stray forged requests cannot flood the channel.
    if (error instanceof HttpError && error.status >= 400) {
      await alert("stripe-webhook", "A Stripe webhook was rejected. If this repeats, check STRIPE_WEBHOOK_SECRET", {
        status: error.status,
        reason: error.message,
      });
    }
    throw error;
  }
  if (!event) return json({ received: true, handled: false });
  const result = await applyPaymentEvent(event);
  log.info("webhook.processed", { eventId: event.eventId, type: event.type, orderId: event.orderId, result });
  return json({ received: true, result });
});
