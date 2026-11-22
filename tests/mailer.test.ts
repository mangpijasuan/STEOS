import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailError, loginEmail, outbox, sendLoginEmail } from "../lib/mailer";

const URL_ = "http://localhost:3000/login/confirm?token=abc_123";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("console provider", () => {
  it("keeps the link in the outbox by default", async () => {
    outbox.length = 0;
    await sendLoginEmail("a@example.com", URL_);
    expect(outbox).toEqual([{ to: "a@example.com", url: URL_ }]);
  });

  it("refuses to run in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(sendLoginEmail("a@example.com", URL_)).rejects.toThrow(EmailError);
  });

  it("rejects an unknown provider name", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "carrier-pigeon");
    await expect(sendLoginEmail("a@example.com", URL_)).rejects.toThrow(/Unknown EMAIL_PROVIDER/);
  });
});

describe("Resend provider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "Siamsil <login@example.com>");
    fetchMock = vi.fn(async () => Response.json({ id: "email_1" }));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("posts the email to Resend with the key", async () => {
    outbox.length = 0;
    await sendLoginEmail("cook@example.com", URL_);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe("Siamsil <login@example.com>");
    expect(body.to).toEqual(["cook@example.com"]);
    expect(body.text).toContain(URL_);
    expect(body.html).toContain('href="http://localhost:3000/login/confirm?token=abc_123"');
    expect(outbox).toHaveLength(0);
  });

  it("throws a clear error when Resend refuses", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ statusCode: 403, name: "validation_error", message: "Domain is not verified" }, { status: 403 }),
    );
    await expect(sendLoginEmail("cook@example.com", URL_)).rejects.toThrow(/403 validation_error.*Domain is not verified/);
  });

  it("throws when the network fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(sendLoginEmail("cook@example.com", URL_)).rejects.toThrow(/Resend request failed/);
  });

  it("needs a key and a sender address", async () => {
    vi.stubEnv("EMAIL_FROM", "");
    await expect(sendLoginEmail("cook@example.com", URL_)).rejects.toThrow(/RESEND_API_KEY and EMAIL_FROM/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("email content", () => {
  it("escapes the link in HTML", () => {
    const { html } = loginEmail('http://x/"><script>alert(1)</script>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });
});
