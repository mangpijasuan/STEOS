import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, HttpError, idParam, json } from "@/lib/http";
import { markOrderPaid } from "@/lib/tables";
import { splitTenderSchema } from "@/lib/split-tenders";
import { z } from "zod";

const input = z.object({ tenders: splitTenderSchema }).strict();
export const POST = handle(async (req, ctx) => {
  const staff = await requireStaff(req);
  const id = await idParam(ctx);
  const key = req.headers.get("idempotency-key");
  if (!key || key.length < 8 || key.length > 100) throw new HttpError(400, "An Idempotency-Key header is required");
  const { tenders } = input.parse(await req.json());
  await withTenant(staff.restaurantId, db => markOrderPaid(db, staff.restaurantId, id, "other", new Date(), { split: {parts: tenders, key, staffUserId: staff.staffUserId} }));
  return json({ ok: true }, 200, { "Cache-Control": "no-store" });
});
