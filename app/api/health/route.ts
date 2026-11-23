import { pool } from "@/lib/db";
import { log } from "@/lib/log";
import { trustedClientIpHeader } from "@/lib/ratelimit";

export async function GET() {
  const checks = {
    database: "ok",
    orderWorker: "ok",
    trustedProxy: process.env.NODE_ENV !== "production" || trustedClientIpHeader() ? "ok" : "failing",
  };
  try {
    const { rows: [worker] } = await pool.query("select order_worker_is_healthy() as healthy");
    if (!worker?.healthy) checks.orderWorker = "failing";
  } catch (error) {
    checks.database = "failing";
    checks.orderWorker = "unknown";
    log.error("health.database_unavailable", { error });
  }
  const healthy = Object.values(checks).every((status) => status === "ok");
  return Response.json({ status: healthy ? "ok" : "degraded", checks }, {
    status: healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
