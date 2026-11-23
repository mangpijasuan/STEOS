import { requireStaff } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { handle, idParam, json } from "@/lib/http";
import { saveMenuItemEditor } from "@/lib/menu";
import { menuItemEditorInput } from "@/lib/validation";

export const PUT = handle(async (req, ctx) => {
  const staff = await requireStaff(req, ["owner"]);
  const id = await idParam(ctx);
  const input = menuItemEditorInput.parse(await req.json());
  return json(await withTenant(staff.restaurantId, (db) => saveMenuItemEditor(db, staff.restaurantId, id, input)));
});
