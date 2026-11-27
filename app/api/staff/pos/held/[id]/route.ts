import { requireStaff } from "@/lib/auth";
import { handle, idParam, json } from "@/lib/http";
import { changeHeld } from "@/lib/held-tickets";
import { heldActionSchema } from "@/lib/held-ticket-input";

export const PATCH = handle(async (req, ctx) => {
  const staff = await requireStaff(req);
  return json(await changeHeld(staff, await idParam(ctx), heldActionSchema.parse(await req.json())), 200, { "Cache-Control": "no-store" });
});
