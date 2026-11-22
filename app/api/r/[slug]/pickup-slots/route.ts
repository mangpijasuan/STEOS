import { handle, json } from "@/lib/http";
import { loadStore, orderingEnabled, pickupSlots, slugParam } from "@/lib/storefront";

export const GET = handle(async (_req, ctx) => {
  const store = await loadStore(await slugParam(ctx));
  const slots = pickupSlots(store);
  return json(
    {
      timezone: store.restaurant.timezone,
      orderingOpen: orderingEnabled(store.restaurant),
      slots: slots.map((s) => s.toISOString()),
    },
    200,
    { "Cache-Control": "no-store" },
  );
});
