import { handle } from "@/lib/http";
import { resolveTable, touchTable } from "@/lib/tables";

// Sent every minute while the menu is open, so waiters can see who is browsing.
export const POST = handle(async (_req, ctx: { params: Promise<{ token: string }> }) => {
  const { token } = await ctx.params;
  await resolveTable(token);
  await touchTable(token);
  return new Response(null, { status: 204 });
});
