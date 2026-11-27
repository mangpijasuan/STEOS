import { requireStaff } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { createHeld, listHeld } from "@/lib/held-tickets";
import { createHeldSchema } from "@/lib/held-ticket-input";

export const GET = handle(async req => json(await listHeld(await requireStaff(req)), 200, { "Cache-Control": "no-store" }));
export const POST = handle(async req => {
  const staff = await requireStaff(req);
  const { id, payload } = createHeldSchema.parse(await req.json());
  return json(await createHeld(staff, id, payload), 201, { "Cache-Control": "no-store" });
});
