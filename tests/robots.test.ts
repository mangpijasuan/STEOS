import { afterEach, describe, expect, it } from "vitest";
import robots from "../app/robots";

const original = process.env.ROBOTS_NOINDEX;
afterEach(() => {
  if (original === undefined) delete process.env.ROBOTS_NOINDEX;
  else process.env.ROBOTS_NOINDEX = original;
});

describe("robots.txt", () => {
  it("tells crawlers to stay away when the environment is marked as not for search engines", () => {
    process.env.ROBOTS_NOINDEX = "true";
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("allows crawling by default, which is what production needs", () => {
    delete process.env.ROBOTS_NOINDEX;
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" } });
  });

  it("is not switched on by a value other than 'true'", () => {
    for (const value of ["false", "1", "yes", ""]) {
      process.env.ROBOTS_NOINDEX = value;
      expect(robots(), value).toEqual({ rules: { userAgent: "*", allow: "/" } });
    }
  });
});
