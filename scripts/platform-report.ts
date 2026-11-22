// What SROS earned, across every restaurant. Uses the owner connection, which bypasses row-level security,
// so run it only from your own machine or server. Usage: npm run report:platform -- 30
import { Client } from "pg";

const days = Number(process.argv[2] ?? 30);
const url = process.env.DATABASE_OWNER_URL;
if (!url) throw new Error("DATABASE_OWNER_URL is not set");

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select r.name, r.pricing_plan,
              count(*)::int as orders,
              coalesce(sum(o.subtotal_cents), 0)::int as subtotal,
              coalesce(sum(o.total_cents), 0)::int as gross,
              coalesce(sum(o.fee_cents), 0)::int as fees
         from orders o
         join payments p on p.order_id = o.id and p.status = 'captured'
         join restaurants r on r.id = o.restaurant_id
        where o.created_at >= now() - ($1 || ' days')::interval
        group by r.id order by fees desc`,
      [String(days)],
    );
    console.log(`SROS revenue, last ${days} days (application fees on captured, not refunded, orders)\n`);
    for (const r of rows) {
      console.log(`${r.name.padEnd(28)} ${String(r.pricing_plan).padEnd(9)} ${String(r.orders).padStart(5)} orders  sales ${money(r.subtotal).padStart(10)}  fees ${money(r.fees).padStart(9)}`);
    }
    const total = rows.reduce((s, r) => s + r.fees, 0);
    const sales = rows.reduce((s, r) => s + r.subtotal, 0);
    console.log(`\nTotal fees: ${money(total)} on ${money(sales)} of food sales${sales ? ` (${((total / sales) * 100).toFixed(2)}%)` : ""}`);
    console.log("Subscriptions are not billed yet and are not included.");
  } finally {
    await client.end();
  }
}
main();
