import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";

const globalForPool = globalThis as unknown as { __pool?: Pool };

/** Pool for the restricted app role. Row-level security applies to every connection. */
export const pool: Pool =
  globalForPool.__pool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalForPool.__pool = pool;

export type Tx = NodePgDatabase<typeof schema>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs fn inside a transaction scoped to one restaurant. The tenant id is set with
 * set_config(..., true), so it lasts only for this transaction and cannot leak between requests.
 */
export async function withTenant<T>(restaurantId: string, fn: (db: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(restaurantId)) throw new Error("Invalid restaurant id");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.restaurant_id', $1, true)", [restaurantId]);
    const result = await fn(drizzle(client, { schema }));
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
