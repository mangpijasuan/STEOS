import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { GET as health } from "../app/api/health/route";
import { POST as sweep } from "../app/api/internal/expire-orders/route";
import { alert } from "../lib/alerts";
import { pool } from "../lib/db";
import { handle, OperationalError } from "../lib/http";
import { clientIdentity } from "../lib/ratelimit";
import { asOwner } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await pool.end();
});

describe("worker health", () => {
  it("reports an idle stopped worker and recovers after an authenticated sweep", async () => {
    await asOwner((client) => client.query("update order_worker_heartbeat set last_completed_at = now() - interval '6 minutes'"));
    const stopped = await health();
    expect(stopped.status).toBe(503);
    expect(await stopped.json()).toMatchObject({ status: "degraded", checks: { database: "ok", orderWorker: "failing" } });

    const request = (secret: string) => new Request("http://localhost/api/internal/expire-orders", {
      method: "POST", headers: { Authorization: `Bearer ${secret}` },
    });
    expect((await sweep(request("invalid"), {})).status).toBe(401);
    expect((await health()).status).toBe(503);
    expect((await sweep(request(process.env.CRON_SECRET!), {})).status).toBe(200);
    expect((await health()).status).toBe(200);
    await expect(pool.query("select * from order_worker_heartbeat")).rejects.toMatchObject({ code: "42501" });
  });

  it("reports a missing trusted proxy setting in production and ignores untrusted forwarded headers", async () => {
    await pool.query("select record_order_worker_run()");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", " ");
    const response = await health();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ checks: { trustedProxy: "failing" } });

    const request = new Request("http://localhost", {
      headers: { "X-Forwarded-For": "192.0.2.1", "CF-Connecting-IP": "198.51.100.2" },
    });
    expect(clientIdentity(request)).toBe("shared");
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "CF-Connecting-IP");
    expect(clientIdentity(request)).toBe("198.51.100.2");
    expect((await health()).status).toBe(200);
  });
});

describe("operational alerts", () => {
  it("throttles duplicate deliveries and excludes confidential fields and provider errors", async () => {
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://alerts.example.test");
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", send);
    const key = `test-${crypto.randomUUID()}`;
    const fields = { email: "staff@example.test", token: "token-fixture", status: 503, error: new Error("private-provider-detail") };
    await Promise.all([alert(key, "Payment unavailable", fields), alert(key, "Payment unavailable", fields)]);
    expect(send).toHaveBeenCalledTimes(1);
    const text = JSON.parse(String(send.mock.calls[0][1]?.body)).text;
    expect(text).toContain("status: 503");
    for (const value of [fields.email, fields.token, fields.error.message]) expect(text).not.toContain(value);
  });

  it("throttles unexpected errors by method and route without exposing restaurant slugs", async () => {
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://alerts.example.test");
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", send);
    const route = handle(async () => { throw new Error("private fixture"); });
    const suffix = crypto.randomUUID().slice(0, 8);
    const hit = async (method: string, slug: string, action: string) => {
      const response = await route(new Request(`http://localhost/api/r/${slug}/${action}-${suffix}`, { method }), {});
      expect(response.status).toBe(500);
    };
    await hit("POST", "first-shop", "quote");
    await hit("POST", "next-shop", "quote");
    await hit("POST", "first-shop", "checkout");
    await hit("GET", "first-shop", "quote");
    expect(send).toHaveBeenCalledTimes(3);
    const notifications = send.mock.calls.map(([, request]) => String(request?.body));
    expect(notifications[0]).toContain(`/api/r/:id/quote-${suffix}`);
    expect(notifications.join(" ")).not.toMatch(/first-shop|next-shop/);
  });

  it("keeps public error handling intact if alert delivery fails", async () => {
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://alerts.example.test");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("alert provider unavailable")));
    const route = handle(async () => {
      throw new OperationalError(`test-${crypto.randomUUID()}`, "Could not capture payment");
    });
    const response = await route(new Request("http://localhost/api/staff/orders/capture"), {});
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Could not capture payment" });
  });
});
