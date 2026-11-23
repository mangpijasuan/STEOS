import { handle, json } from "@/lib/http";
import { resolveTable, touchTable } from "@/lib/tables";

// What the table's ordering page needs: which table, which restaurant, and what is allowed.
// Opening the page also marks the table as "browsing" for the waiters' board.
export const GET = handle(async (_req, ctx: { params: Promise<{ token: string }> }) => {
  const { token } = await ctx.params;
  const table = await resolveTable(token);
  await touchTable(token);
  return json(
    {
      table: { label: table.label, floorName: table.floorName },
      restaurant: { name: table.restaurantName, slug: table.slug },
      dineInEnabled: table.dineInEnabled,
      payLaterEnabled: table.payLaterEnabled,
    },
    200,
    { "Cache-Control": "no-store" },
  );
});
