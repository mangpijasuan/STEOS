import { requireStaff } from "@/lib/auth";
import { HttpError, handle, json } from "@/lib/http";
import { createPosOrder } from "@/lib/pos";
import { loadStoreById } from "@/lib/storefront";
import { posInput } from "@/lib/validation";

// Rings up an order for a table or a walk-in. The Idempotency-Key makes a double tap safe.
export const POST = handle(async (req) => {
  const staff = await requireStaff(req);
  const key = req.headers.get("idempotency-key");
  if (!key || key.length < 8 || key.length > 100) throw new HttpError(400, "An Idempotency-Key header is required");
  const input = posInput.parse(await req.json());
  const store = await loadStoreById(staff.restaurantId);
  return json(await createPosOrder(store, input, { staffUserId: staff.staffUserId, role: staff.role }, `pos:${key}`), 201, { "Cache-Control": "no-store" });
});
