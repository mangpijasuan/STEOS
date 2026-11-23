import { setTimeout as delay } from "node:timers/promises";

const { APP_URL, CRON_SECRET, ORDER_WORKER_URL } = process.env;
if (!APP_URL && !ORDER_WORKER_URL) throw new Error("Set APP_URL or ORDER_WORKER_URL");
if (!CRON_SECRET || CRON_SECRET.length < 32 || /change-me|dev-only/i.test(CRON_SECRET)) {
  throw new Error("Set a strong CRON_SECRET");
}
const url = new URL("/api/internal/expire-orders", ORDER_WORKER_URL ?? APP_URL);
if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
  throw new Error("The order worker requires HTTPS or a loopback HTTP URL");
}
const stop = new AbortController();
process.once("SIGINT", () => stop.abort());
process.once("SIGTERM", () => stop.abort());

while (!stop.signal.aborted) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      redirect: "error",
      signal: AbortSignal.any([stop.signal, AbortSignal.timeout(55_000)]),
    });
    if (!response.ok) throw new Error(`Expiry endpoint returned HTTP ${response.status}`);
    await response.json();
  } catch (error) {
    if (!stop.signal.aborted) console.error("Order maintenance failed", error.message);
  }
  if (!stop.signal.aborted) {
    await delay(Math.max(1000, 60_000 - (Date.now() - started)), undefined, { signal: stop.signal }).catch(() => {});
  }
}
