import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { listOrderHistory } from "@/lib/orders";
import { z } from "zod";

const query = z.object({
  status: z.enum(["active", "completed", "closed"]).optional(),
  type: z.enum(["pickup", "dine_in", "counter"]).optional(),
  q: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
});

// Recent orders for the orders page. Any staff member can see them; they already see orders in the kitchen.
export const GET = handle(async (req) => {
  const staff = await requireStaff(req);
  const params = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return json(await withTenant(staff.restaurantId, (db) => listOrderHistory(db, params)), 200, { "Cache-Control": "no-store" });
});
