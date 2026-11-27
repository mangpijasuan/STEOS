import { execFileSync } from "node:child_process";

// Seeds the database, then warms the pages the tests open, so the first test is not slowed by a cold compile.
export default async function globalSetup() {
  execFileSync("npx", ["tsx", "e2e/seed.ts"], { stdio: "inherit", env: process.env });
  const base = `http://localhost:3200`;
  for (const path of ["/", "/login", "/r/e2e-kitchen", "/r/zogam-cafe", "/api/staff/me", "/pos", "/kitchen", "/order/warmup"]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
        break;
      } catch {
        /* the server may still be compiling; try again */
      }
    }
  }
}
