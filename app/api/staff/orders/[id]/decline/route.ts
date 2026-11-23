import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { handle, idParam, json } from "@/lib/http";
import { decideOrder } from "@/lib/orders";

const decision = z.object({ inPersonRefundReturned: z.boolean().optional() });

// Declining an order the guest already paid for in person records a refund, so staff must confirm the money was
// handed back first.
export const POST = handle(async (req, ctx) => {
  const staff = await requireStaff(req);
  const id = await idParam(ctx);
  const input = decision.parse(req.body ? await req.json() : {});
  return json(await decideOrder(staff.restaurantId, id, "decline", undefined, undefined, input.inPersonRefundReturned));
});
