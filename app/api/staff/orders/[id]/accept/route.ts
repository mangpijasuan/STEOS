import { requireStaff } from "@/lib/auth";
import { HttpError, handle, idParam, json } from "@/lib/http";
import { decideOrder } from "@/lib/orders";

export const POST = handle(async (req, ctx) => {
  const staff = await requireStaff(req);
  const result = await decideOrder(staff.restaurantId, await idParam(ctx), "accept");
  if (result.status === "expired") throw new HttpError(409, "This order waited too long and was released");
  return json(result);
});
