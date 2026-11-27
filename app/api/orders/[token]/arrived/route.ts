import { z } from "zod";
import { HttpError, handle, json, optionalJson } from "@/lib/http";
import { markGuestArrived } from "@/lib/orders";
import { allow, clientIdentity } from "@/lib/ratelimit";

const input = z.object({ note: z.string().max(200).optional() }).strict();

// A pickup guest tells the kitchen they are here. The private order link is the only credential, so it is rate limited.
export const POST = handle(async (req, ctx: { params: Promise<{ token: string }> }) => {
  const { token } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new HttpError(404, "Order not found");
  const ip = clientIdentity(req);
  if (!(await allow(`order-arrived:${ip}`, 20, 60_000)) || !(await allow(`order-arrived-token:${token.slice(0, 32)}`, 10, 60_000))) {
    throw new HttpError(429, "Too many requests");
  }
  const { note } = input.parse((await optionalJson(req)) ?? {});
  return json(await markGuestArrived(token, note), 200, { "Cache-Control": "no-store" });
});
