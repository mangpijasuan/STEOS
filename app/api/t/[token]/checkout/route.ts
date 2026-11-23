import { createCheckout } from "@/lib/orders";
import { HttpError, handle, json } from "@/lib/http";
import { allow, clientIp } from "@/lib/ratelimit";
import { loadStore } from "@/lib/storefront";
import { resolveTable } from "@/lib/tables";
import { dineInCheckoutInput } from "@/lib/validation";

// A seated guest places an order from the table's QR code, paying now by card or later at the table.
export const POST = handle(async (req, ctx: { params: Promise<{ token: string }> }) => {
  const { token } = await ctx.params;
  const table = await resolveTable(token);
  if (!table.dineInEnabled) throw new HttpError(409, "This restaurant is not taking table orders right now");

  // Two limits: one per person, one per table, so a photographed QR code cannot flood the kitchen.
  if (!(await allow(`checkout:${clientIp(req)}`, 10, 60_000))) throw new HttpError(429, "Too many attempts. Try again in a minute.");
  if (!(await allow(`table-checkout:${table.tableId}`, 8, 10 * 60_000))) throw new HttpError(429, "This table has placed many orders. Please ask a waiter.");

  const key = req.headers.get("idempotency-key");
  if (!key || key.length < 8 || key.length > 100) throw new HttpError(400, "An Idempotency-Key header is required");

  const input = dineInCheckoutInput.parse(await req.json());
  if (input.payLater && !table.payLaterEnabled) throw new HttpError(409, "Paying at the table is not available. Please pay by card.");

  const store = await loadStore(table.slug);
  const customer = { name: input.customer.name || `Table ${table.label}`, phone: input.customer.phone };
  const result = await createCheckout(
    store,
    { items: input.items, tipCents: input.tipCents, promoCode: input.promoCode, customer },
    key,
    new Date(),
    { tableId: table.tableId, tableLabel: table.label, payLater: input.payLater },
  );
  return json(result, 201, { "Cache-Control": "no-store" });
});
