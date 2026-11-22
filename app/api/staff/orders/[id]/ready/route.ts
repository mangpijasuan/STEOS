import { requireStaff } from "@/lib/auth";
import { handle, idParam, json } from "@/lib/http";
import { advanceOrder } from "@/lib/orders";

export const POST = handle(async (req, ctx) => {
  const staff = await requireStaff(req);
  return json(await advanceOrder(staff.restaurantId, await idParam(ctx), "ready"));
});
