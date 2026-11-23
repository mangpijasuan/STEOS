import { requireStaff } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { quotePos } from "@/lib/pos";
import { loadStoreById } from "@/lib/storefront";
import { posInput } from "@/lib/validation";

// Prices a till order: promo code, or (owner only) a typed-in discount. Nothing is saved.
export const POST = handle(async (req) => {
  const staff = await requireStaff(req);
  const input = posInput.parse(await req.json());
  const store = await loadStoreById(staff.restaurantId);
  return json(await quotePos(store, input, { staffUserId: staff.staffUserId, role: staff.role }), 200, { "Cache-Control": "no-store" });
});
