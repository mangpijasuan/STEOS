import { requireStaff } from "@/lib/auth";
import { handle, idParam, json } from "@/lib/http";
import { decideOrder } from "@/lib/orders";

export const POST = handle(async (req, ctx) => {
  const staff = await requireStaff(req);
  return json(await decideOrder(staff.restaurantId, await idParam(ctx), "decline"));
});
