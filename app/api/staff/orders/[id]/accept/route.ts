import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { HttpError, handle, idParam, json } from "@/lib/http";
import { decideOrder } from "@/lib/orders";

const body = z.object({ prepMinutes: z.number().int().min(1).max(240).optional() });

export const POST = handle(async (req, ctx) => {
  const staff = await requireStaff(req);
  const { prepMinutes } = body.parse(await req.json().catch(() => ({})));
  const result = await decideOrder(staff.restaurantId, await idParam(ctx), "accept", new Date(), prepMinutes);
  if (result.status === "expired") throw new HttpError(409, "This order waited too long and was released");
  return json(result);
});
