import fs from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

export const AUTH = {
  owner: path.resolve(__dirname, ".auth/owner.json"),
  staff: path.resolve(__dirname, ".auth/staff.json"),
  otherOwner: path.resolve(__dirname, ".auth/zogam-owner.json"),
};

export function seed(): { tables: Record<string, string> } {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, ".auth/seed.json"), "utf8"));
}

/** Collects what a visitor would call a broken page: console errors, uncaught exceptions and failed requests. */

export function watchProblems(page: Page, ignore: RegExp[] = []) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 120)} ${m.location().url.replace(/^https?:\/\/[^/]+/, "")}`);
  });
  page.on("pageerror", (e) => problems.push(`exception: ${String(e).slice(0, 160)}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().includes("/_next/")) problems.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  return { list: () => problems.filter((p) => !ignore.some((re) => re.test(p))) };
}

/** A phone page that scrolls sideways is a layout defect. */
export async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(1);
}

/** True when the element at the centre of the locator is the element itself (or inside it), so nothing covers it. */
export async function isOnTop(locator: Locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1));
    return !!hit && (hit === el || el.contains(hit));
  });
}
