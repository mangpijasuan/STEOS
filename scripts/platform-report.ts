import { Client } from "pg";
import { branding } from "../lib/branding";

const days = Number(process.argv[2] ?? 30);
const url = process.env.DATABASE_OWNER_URL;
if (!url) throw new Error("DATABASE_OWNER_URL is not set");
if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error("Days must be an integer from 1 to 366");

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query(
      `with payment_activity as (
         select restaurant_id, captured_at as at, amount_cents as gross, fee_cents as fee, 1 as captures
         from payments where captured_at is not null
         union all
         select restaurant_id, refunded_at, -amount_cents, -fee_cents, 0
         from payments where refunded_at is not null
       )
       select r.name, sum(a.captures) as orders, sum(a.gross) as net_charged, sum(a.fee) as net_fee
       from payment_activity a join restaurants r on r.id = a.restaurant_id
       where a.at >= now() - make_interval(days => $1) and a.at < now()
       group by r.id order by net_fee desc`,
      [days],
    );
    console.log(`${branding.name} revenue, last ${days} days (captured fees less confirmed refunds)\n`);
    let fees = 0;
    for (const row of rows) {
      fees += Number(row.net_fee);
      console.log(`${row.name}  ${row.orders} captured  net charges ${money(Number(row.net_charged))}  net fees ${money(Number(row.net_fee))}`);
    }
    console.log(`\nTotal net fees: ${money(fees)}. Subscriptions are excluded.`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
