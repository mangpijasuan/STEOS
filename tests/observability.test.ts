import crypto from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alert } from "../lib/alerts";
import { pool } from "../lib/db";
import { handle } from "../lib/http";
import { log, safePath } from "../lib/log";
import { GET as health } from "../app/api/health/route";

let stdout: ReturnType<typeof vi.spyOn>;
let stderr: ReturnType<typeof vi.spyOn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lines = (spy: ReturnType<typeof vi.spyOn>): any[] => spy.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0])));

beforeEach(() => {
  vi.stubEnv("LOG_LEVEL", "debug");
  stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  stdout.mockRestore();
  stderr.mockRestore();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await pool.end();
});

describe("log", () => {
  it("writes one JSON line, info to stdout and errors to stderr", () => {
    log.info("order.accepted", { orderId: "o1", totalCents: 1250 });
    log.error("thing.broke", { error: new Error("boom") });
    expect(lines(stdout)).toEqual([expect.objectContaining({ level: "info", event: "order.accepted", orderId: "o1", totalCents: 1250 })]);
    const [err] = lines(stderr);
    expect(err).toMatchObject({ level: "error", event: "thing.broke", error: { name: "Error", message: "boom" } });
    expect(err.error.stack).toContain("boom");
  });

  it("redacts personal and secret fields, including nested ones", () => {
    log.info("x", { email: "a@b.c", customerPhone: "555", token: "t", nested: { apiKey: "k", ok: 1 }, orderId: "o1" });
    const [line] = lines(stdout);
    expect(line).toMatchObject({ email: "[redacted]", customerPhone: "[redacted]", token: "[redacted]", nested: { apiKey: "[redacted]", ok: 1 }, orderId: "o1" });
  });

  it("respects LOG_LEVEL", () => {
    vi.stubEnv("LOG_LEVEL", "warn");
    log.info("hidden");
    log.warn("shown");
    expect(stdout).not.toHaveBeenCalled();
    expect(lines(stderr).map((l) => l.event)).toEqual(["shown"]);
  });

  it("hides tokens and ids in paths", () => {
    expect(safePath("/api/orders/Ab3dEf6hIj9kLm2nOp5qRs8t")).toBe("/api/orders/:id");
    expect(safePath("/api/staff/orders/2f0c8a52-1b5e-4c1e-9a3e-1f0d3b1a2c4d/accept")).toBe("/api/staff/orders/:id/accept");
    expect(safePath("/api/r/demo-kitchen/menu")).toBe("/api/r/demo-kitchen/menu");
  });
});

describe("alert", () => {
  const key = () => `test-${crypto.randomBytes(4).toString("hex")}`;

  it("only logs when no webhook is set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await alert(key(), "Something failed", { orderId: "o1" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lines(stderr)[0]).toMatchObject({ level: "error", message: "Something failed", orderId: "o1" });
  });

  it("posts Slack-style text once per 15 minutes per key, and keeps secrets out of it", async () => {
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://hooks.example.com/abc");
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const k = key();
    await alert(k, "Refund failed", { orderId: "o1", customerPhone: "555-0100", error: new Error("card_declined") });
    await alert(k, "Refund failed", { orderId: "o2" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hooks.example.com/abc");
    const { text } = JSON.parse(init.body as string);
    expect(text).toContain("Refund failed");
    expect(text).toContain("orderId: o1");
    expect(text).toContain("Error: card_declined");
    expect(text).not.toContain("555-0100");
    // Both occurrences are still logged.
    expect(lines(stderr).filter((l) => l.event === `alert.${k}`)).toHaveLength(2);
  });

  it("never throws when the webhook is down", async () => {
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://hooks.example.com/abc");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(alert(key(), "x")).resolves.toBeUndefined();
    expect(lines(stderr).some((l) => l.event === "alert.delivery_failed")).toBe(true);
  });
});

describe("unexpected route errors", () => {
  it("return a request id and log the same id with the error", async () => {
    const route = handle(async () => {
      throw new Error("db exploded");
    });
    const res = await route(new Request("http://localhost/api/orders/Ab3dEf6hIj9kLm2nOp5qRs8t", { method: "GET" }), {});
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Server error");
    const [line] = lines(stderr);
    expect(line.event).toBe("alert.server-error:GET /api/orders/:id");
    expect(line.requestId).toBe(body.requestId);
    expect(line.error.message).toBe("db exploded");
  });
});

describe("health check", () => {
  it("is ok when nothing is overdue", async () => {
    const res = await health();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", checks: { database: "ok", expiryJob: "ok" } });
  });
  // The stalled-job case is in orders.test.ts, which already knows how to create a waiting order.

});
