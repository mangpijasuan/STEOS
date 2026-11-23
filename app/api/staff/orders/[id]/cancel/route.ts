import { requireStaff } from "@/lib/auth";
import { OperationalError, handle, idParam, json } from "@/lib/http";
import { cancelAcceptedOrder } from "@/lib/orders";

// Refunds money, so only owners may do it.
export const POST = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  const result = await cancelAcceptedOrder(staff.restaurantId, await idParam(ctx));
  if (result.refundStatus === "failed") throw new OperationalError("payment-refund", "The refund failed. Try again.");
  return json(result);
});
