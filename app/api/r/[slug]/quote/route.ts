import { priceCart, type DiscountRule } from "@/lib/cart";
import { withTenant } from "@/lib/db";
import { HttpError, handle, json } from "@/lib/http";
import { PromoError, allowPromoMiss, loadPromo, promoRule } from "@/lib/promos";
import { allow, clientIp } from "@/lib/ratelimit";
import { loadStore, orderingEnabled, pickupSlots, slugParam } from "@/lib/storefront";
import { quoteInput } from "@/lib/validation";

// Prices a cart on the server. Nothing is saved or charged; checkout reuses the same pricing function.
export const POST = handle(async (req, ctx) => {
  const slug = await slugParam(ctx);
  const ip = clientIp(req);
  if (!(await allow(`quote:${ip}`, 60, 60_000))) throw new HttpError(429, "Too many requests. Try again in a minute.");

  const input = quoteInput.parse(await req.json());
  const store = await loadStore(slug);

  // A wrong promo code never breaks the quote: the cart is priced without it and the reason is returned.
  let discount: DiscountRule | undefined;
  let promoError: string | null = null;
  if (input.promoCode) {
    const promo = await withTenant(store.restaurant.id, (db) => loadPromo(db, input.promoCode!));
    discount = promoRule(promo);
  }
  const options = { taxRateBps: store.restaurant.taxRateBps, tipCents: input.tipCents };
  let cart;
  try {
    cart = priceCart(store.menu, input.items, { ...options, discount });
  } catch (error) {
    if (!(error instanceof PromoError)) throw error;
    promoError = error.message;
    if (!(await allowPromoMiss(ip))) throw new HttpError(429, "Too many promo code attempts. Try again in a few minutes.");
    cart = priceCart(store.menu, input.items, options);
  }

  let pickup: { type: "asap" | "scheduled"; time: string | null } = { type: "asap", time: null };
  if (input.pickupTime) {
    const wanted = new Date(input.pickupTime).getTime();
    if (!pickupSlots(store).some((s) => s.getTime() === wanted)) {
      throw new HttpError(422, "Cart has problems", [{ line: null, message: "That pickup time is no longer available" }]);
    }
    pickup = { type: "scheduled", time: new Date(wanted).toISOString() };
  }

  return json({ ...cart, pickup, orderingOpen: orderingEnabled(store.restaurant), promoError }, 200, { "Cache-Control": "no-store" });
});
