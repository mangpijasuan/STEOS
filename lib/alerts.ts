// Alerts for problems someone should look at now: payments failing, login emails not sending,
// unexpected server errors. Every alert is logged at error level. If ALERT_WEBHOOK_URL is set, it is
// also posted there as {"text": "..."}, which Slack incoming webhooks accept (and Discord, with
// "/slack" added to its webhook URL).
//
// Each alert key is sent at most once per 15 minutes, so an outage produces one message, not hundreds.
// Repeats are still logged. Sending an alert never throws: alerting must not break the request.

import { log, redact, type Fields } from "./log";
import { allow } from "./ratelimit";

const THROTTLE_MS = 15 * 60 * 1000;
const TIMEOUT_MS = 5_000;
const lastOfflineAlert = new Map<string, number>();

export async function alert(key: string, message: string, fields: Fields = {}): Promise<void> {
  log.error(`alert.${key}`, { message, ...fields });
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;

  let send = true;
  try {
    send = await allow(`alert:${key}`, 1, THROTTLE_MS);
  } catch {
    const now = Date.now();
    for (const [event, sentAt] of lastOfflineAlert) {
      if (now - sentAt >= THROTTLE_MS) lastOfflineAlert.delete(event);
    }
    if (lastOfflineAlert.has(key)) return;
    lastOfflineAlert.set(key, now);
  }
  if (!send) return;

  try {
    const details = Object.entries(redact(fields))
      .filter(([, value]) => typeof value === "string" || typeof value === "number")
      .map(([name, value]) => `${name}: ${value}`)
      .join(", ");
    const text = [`STOS: ${message}`, details, "See the logs for repeats."].filter(Boolean).join("\n");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
    if (!res.ok) log.warn("alert.delivery_failed", { key, status: res.status });
  } catch (err) {
    log.warn("alert.delivery_failed", { key, error: err });
  }
}
