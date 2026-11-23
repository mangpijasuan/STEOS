import { getOrderByToken } from "@/lib/orders";
import { handle, json } from "@/lib/http";
import { allow, clientIdentity } from "@/lib/ratelimit";
import { HttpError } from "@/lib/http";

export const GET = handle(async (req, ctx: { params: Promise<{ token: string }> }) => {
  const ip = clientIdentity(req);
  if (!await allow(`order-status:${ip}`, 120, 60_000)) throw new HttpError(429, "Too many requests");
  const { token } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new HttpError(404, "Order not found");
  return json(await getOrderByToken(token), 200, { "Cache-Control": "no-store" });
});
