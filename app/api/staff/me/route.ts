import { requireStaff } from "@/lib/auth";
import { handle, json } from "@/lib/http";

export const GET = handle(async (req) => {
  const staff = await requireStaff(req);
  return json({ email: staff.email, name: staff.name, role: staff.role, restaurantId: staff.restaurantId });
});
