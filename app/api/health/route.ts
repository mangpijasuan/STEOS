import { pool } from "@/lib/db";
import { log } from "@/lib/log";

// For an uptime monitor (UptimeRobot, Better Stack, ...). Alerts sent by the app cannot fire when
// the app itself is down, so point an outside monitor here and alert on anything but 200.
//   200 {"status":"ok"}        everything works
//   503 {"status":"degraded"}  the database is unreachable, or the every-minute expiry job has stopped
// The body says which check failed and nothing else.

const GRACE_SECONDS = 5 * 60; // the job runs every minute; five minutes late means it is not running

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "failing"> = { database: "ok", expiryJob: "ok" };
  try {
    const { rows } = await pool.query("select overdue, oldest_seconds from ops_overdue_orders($1)", [GRACE_SECONDS]);
    if (Number(rows[0].overdue) > 0) {
      checks.expiryJob = "failing";
      log.warn("health.expiry_job_stalled", { overdue: Number(rows[0].overdue), oldestSeconds: rows[0].oldest_seconds });
    }
  } catch (error) {
    checks.database = "failing";
    checks.expiryJob = "failing";
    log.error("health.database_unreachable", { error });
  }
  const ok = Object.values(checks).every((c) => c === "ok");
  return Response.json({ status: ok ? "ok" : "degraded", checks }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
