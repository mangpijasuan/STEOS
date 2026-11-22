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

export async function alert(key: string, message: string, fields: Fields = {}): Promise<void> {
  log.error(`alert.${key}`, { message, ...fields });
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;

  let send = true;
  try {
    send = await allow(`alert:${key}`, 1, THROTTLE_MS);
  } catch {
    // Database trouble is exactly when an alert matters most; send it anyway.
  }
  if (!send) return;

  const env = process.env.APP_URL ? ` (${new URL(process.env.APP_URL).host})` : "";
  const details = Object.entries(redact(fields))
    .filter(([k, v]) => v !== undefined && v !== null && !(fields[k] instanceof Error))
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(", ");
  const error = Object.values(fields).find((v): v is Error => v instanceof Error);
  const text = [
    `:rotating_light: SROS${env}: ${message}`,
    details && `> ${details}`,
    error && `> ${error.name}: ${error.message}`,
    "_Repeats of this alert are muted for 15 minutes. See the logs for every occurrence._",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) log.warn("alert.delivery_failed", { key, status: res.status });
  } catch (err) {
    log.warn("alert.delivery_failed", { key, error: err });
  }
}
