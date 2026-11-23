import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { createTables, loadBoard } from "@/lib/tables";
import { tablesCreate } from "@/lib/validation";

// The table board: every table with its current status, orders and requests. Polled every few seconds.
export const GET = handle(async (req) => {
  const staff = await requireStaff(req);
  const board = await withTenant(staff.restaurantId, (db) => loadBoard(db, staff.role));
  return json({ ...board, me: { id: staff.staffUserId, role: staff.role } }, 200, { "Cache-Control": "no-store" });
});

export const POST = handle(async (req) => {
  const staff = await requireStaff(req, ["owner"]);
  const input = tablesCreate.parse(await req.json());
  return json(await withTenant(staff.restaurantId, (db) => createTables(db, staff.restaurantId, input)), 201);
});
