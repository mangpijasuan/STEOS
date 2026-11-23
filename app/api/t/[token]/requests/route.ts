import { withTenant } from "@/lib/db";
import { HttpError, handle, json } from "@/lib/http";
import { allow, clientIdentity } from "@/lib/ratelimit";
import { createRequest, resolveTable } from "@/lib/tables";
import { requestInput } from "@/lib/validation";

// "Call a waiter", "Bring the bill", and so on, from the guest's phone.
export const POST = handle(async (req, ctx: { params: Promise<{ token: string }> }) => {
  const { token } = await ctx.params;
  const table = await resolveTable(token);
  if (!table.dineInEnabled) throw new HttpError(409, "This restaurant is not taking table requests right now");
  if (!(await allow(`table-request:${table.tableId}`, 8, 5 * 60_000)) || !(await allow(`table-request-ip:${clientIdentity(req)}`, 12, 5 * 60_000))) {
    throw new HttpError(429, "A waiter has been notified already. Please wait a moment.");
  }
  const { kind } = requestInput.parse(await req.json());
  const result = await withTenant(table.restaurantId, (db) => createRequest(db, table.restaurantId, table.tableId, kind));
  return json(result, result.duplicate ? 200 : 201);
});
