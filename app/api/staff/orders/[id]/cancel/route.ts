import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { OperationalError, handle, idParam, json } from "@/lib/http";
import { cancelAcceptedOrder } from "@/lib/orders";

const cancellation = z.object({ inPersonRefundReturned: z.boolean().optional() });

// Refunds money, so only owners may do it.
export const POST = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  const id = await idParam(ctx);
  const input = cancellation.parse(req.body ? await req.json() : {});
  const result = await cancelAcceptedOrder(staff.restaurantId, id, new Date(), input.inPersonRefundReturned);
  if (result.refundStatus === "failed") throw new OperationalError("payment-refund", "The refund failed. Try again.");
  return json(result);
});
