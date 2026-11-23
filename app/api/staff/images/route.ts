import { requireStaff } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { saveImage } from "@/lib/images";

// Owner-only. The body is the raw image file (the browser shrinks it first). Returns the new image's id and URL.
export const POST = handle(async (req) => {
  const staff = await requireStaff(req, ["owner"]);
  return json(await saveImage(staff.restaurantId, req), 201);
});
