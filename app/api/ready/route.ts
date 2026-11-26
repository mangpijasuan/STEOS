import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

// Share one outstanding probe so repeated requests cannot fill the pool queue.
let pending: Promise<unknown> | undefined;
function probe() {
  if (!pending) {
    pending = pool.query({ text: "select 1", query_timeout: 2500 }).finally(() => { pending = undefined; });
  }
  return pending;
}

export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Readiness timeout")), 3000); }),
    ]);
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally {
    clearTimeout(timer);
  }
}
