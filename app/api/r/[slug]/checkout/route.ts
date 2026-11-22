import { createCheckout } from "@/lib/orders";
import { HttpError, handle, json } from "@/lib/http";
import { allow, clientIp } from "@/lib/ratelimit";
import { loadStore, slugParam } from "@/lib/storefront";
import { checkoutInput } from "@/lib/validation";

// Validates the cart, saves the order and asks the payment provider to hold the money.
export const POST = handle(async (req, ctx) => {
  const slug = await slugParam(ctx);
  const ip = clientIp(req);
  if (!(await allow(`checkout:${ip}`, 10, 60_000))) throw new HttpError(429, "Too many attempts. Try again in a minute.");

  const key = req.headers.get("idempotency-key");
  if (!key || key.length < 8 || key.length > 100) throw new HttpError(400, "An Idempotency-Key header is required");

  const input = checkoutInput.parse(await req.json());
  const store = await loadStore(slug);
  return json(await createCheckout(store, input, key), 201, { "Cache-Control": "no-store" });
});
