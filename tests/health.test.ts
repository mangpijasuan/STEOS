import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ pool: { query } }));
vi.mock("@/lib/log", () => ({ log: { error: vi.fn() } }));
vi.mock("@/lib/ratelimit", () => ({ trustedClientIpHeader: () => undefined }));
import { GET as live } from "../app/api/live/route";
import { GET as ready } from "../app/api/ready/route";
import { GET as health } from "../app/api/health/route";

beforeEach(() => query.reset());
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("release health endpoints", () => {
  it("liveness does not access the database", async () => {
    const response = live();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(query).not.toHaveBeenCalled();
  });
  it("readiness succeeds on database response", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect((await ready()).status).toBe(200);
  });
  it("readiness hides database errors", async () => {
    query.mockRejectedValueOnce(new Error("private connection detail"));
    const response = await ready();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
  it("bounds response time and shares outstanding probes", async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    query.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const a = ready(), b = ready();
    await vi.advanceTimersByTimeAsync(3000);
    expect((await a).status).toBe(503);
    expect((await b).status).toBe(503);
    expect(query).toHaveBeenCalledTimes(1);
    finish({ rows: [] });
    await Promise.resolve();
    await Promise.resolve();
    query.mockResolvedValueOnce({ rows: [] });
    expect((await ready()).status).toBe(200);
  });
  it("reports stale worker as degraded", async () => {
    query.mockResolvedValueOnce({ rows: [{ healthy: false }] });
    const response = await health();
    expect(response.status).toBe(503);
    expect((await response.json()).checks.orderWorker).toBe("failing");
  });
  it("reports missing trusted proxy in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    query.mockResolvedValueOnce({ rows: [{ healthy: true }] });
    const response = await health();
    expect(response.status).toBe(503);
    expect((await response.json()).checks.trustedProxy).toBe("failing");
  });
  it("reports database outage without exposing details", async () => {
    query.mockRejectedValueOnce(new Error("private connection detail"));
    const response = await health();
    expect(response.status).toBe(503);
    expect((await response.json()).checks.database).toBe("failing");
  });
});
