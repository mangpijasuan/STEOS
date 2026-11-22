import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid role name: ${name}`);
  }
  return `"${name}"`;
}

/** Applies db/migrations/*.sql in order using the table-owner connection. Safe to run repeatedly. */
export async function runMigrations(ownerUrl: string, appRole: string): Promise<string[]> {
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const dir = path.join(process.cwd(), "db", "migrations");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    const done = new Set((await client.query("select name from _migrations")).rows.map((r) => r.name as string));

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = (await readFile(path.join(dir, file), "utf8")).replaceAll("__APP_ROLE__", quoteIdent(appRole));
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into _migrations (name) values ($1)", [file]);
        await client.query("commit");
        applied.push(file);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}
