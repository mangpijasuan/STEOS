// Structured logging: one JSON object per line, which every log host can search and filter.
//   log.info("order.accepted", { orderId, restaurantId })
// Fields whose names look personal or secret are replaced with "[redacted]", so a careless call
// cannot leak a customer's phone number or a sign-in token into the logs.

type Level = "debug" | "info" | "warn" | "error";
type Threshold = Level | "silent";
export type Fields = Record<string, unknown>;

const ORDER: Record<Threshold, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const SENSITIVE = /(token|secret|password|authorization|cookie|api_?key|email|phone|customer_?name|card)/i;

function minLevel(): number {
  const wanted = (process.env.LOG_LEVEL || (process.env.NODE_ENV === "test" ? "silent" : "info")) as Threshold;
  return ORDER[wanted] ?? ORDER.info;
}

function clean(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, ...(value.stack ? { stack: value.stack.split("\n").slice(0, 8).join("\n") } : {}) };
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return depth > 4 ? "[…]" : value.map((v) => clean(v, depth + 1));
  if (value && typeof value === "object") {
    if (depth > 4) return "[…]";
    const out: Fields = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) ? "[redacted]" : clean(v, depth + 1);
    return out;
  }
  return value;
}

/** Same redaction the log lines get, for text that leaves the server (alerts). */
export const redact = (fields: Fields): Fields => clean(fields) as Fields;

/** Replaces long ids and tokens in a path with ":id", so paths are safe to log and group together. */
export function safePath(pathname: string): string {
  return pathname.replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$)/g, "/:id");
}

function write(level: Level, event: string, fields: Fields = {}) {
  if (ORDER[level] < minLevel()) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...(clean(fields) as Fields) });
  if (level === "error" || level === "warn") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export const log = {
  debug: (event: string, fields?: Fields) => write("debug", event, fields),
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};
