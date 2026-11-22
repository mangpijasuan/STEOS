import { priceCart } from "@/lib/cart";
import { HttpError, handle, json } from "@/lib/http";
import { allow } from "@/lib/ratelimit";
import { loadStore, orderingEnabled, pickupSlots, slugParam } from "@/lib/storefront";
import { quoteInput } from "@/lib/validation";

// Prices a cart on the server. Nothing is saved or charged; checkout reuses the same pricing function.
export const POST = handle(async (req, ctx) => {
  const slug = await slugParam(ctx);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(`quote:${ip}`, 60, 60_000)) throw new HttpError(429, "Too many requests. Try again in a minute.");

  const input = quoteInput.parse(await req.json());
  const store = await loadStore(slug);

  const cart = priceCart(store.menu, input.items, { taxRateBps: store.restaurant.taxRateBps, tipCents: input.tipCents });

  let pickup: { type: "asap" | "scheduled"; time: string | null } = { type: "asap", time: null };
  if (input.pickupTime) {
    const wanted = new Date(input.pickupTime).getTime();
    if (!pickupSlots(store).some((s) => s.getTime() === wanted)) {
      throw new HttpError(422, "Cart has problems", [{ line: null, message: "That pickup time is no longer available" }]);
    }
    pickup = { type: "scheduled", time: new Date(wanted).toISOString() };
  }

  return json({ ...cart, pickup, orderingOpen: orderingEnabled(store.restaurant) }, 200, { "Cache-Control": "no-store" });
});
