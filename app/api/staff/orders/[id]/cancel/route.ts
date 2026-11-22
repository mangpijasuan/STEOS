import { requireStaff } from "@/lib/auth";
import { handle, idParam, json } from "@/lib/http";
import { cancelAcceptedOrder } from "@/lib/orders";

// Refunds money, so only owners may do it.
export const POST = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  return json(await cancelAcceptedOrder(staff.restaurantId, await idParam(ctx)));
});
