import { handle, json } from "@/lib/http";
import { loadStore, slugParam, toPublicStore } from "@/lib/storefront";

export const GET = handle(async (_req, ctx) => {
  const store = await loadStore(await slugParam(ctx));
  return json(toPublicStore(store), 200, { "Cache-Control": "no-store" });
});
