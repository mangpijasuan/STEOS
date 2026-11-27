import { expect, test } from "@playwright/test";
import { AUTH, expectNoSidewaysScroll, seed, watchProblems } from "./helpers";

test("a guest orders from a table's QR code and pays later; the page follows the order until the bill is paid", async ({ page, browser }, testInfo) => {
  const problems = watchProblems(page);
  // Each screen size uses its own table so the runs do not share state.
  const label = testInfo.project.name === "desktop" ? "1" : "2";
  const token = seed().tables[label];

  await page.goto(`/t/${token}`);
  await expect(page.getByText(`Table ${label}`).first()).toBeVisible();
  await page.getByRole("button", { name: /Iced tea/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Add to order/ }).click();
  const bar = page.locator(".cart-bar button");
  if (await bar.isVisible().catch(() => false)) await bar.click();
  // At a table the cart already holds the details and the two ways to pay.
  await page.getByRole("button", { name: /pay later at the table/i }).click();
  await page.waitForURL(/\/order\//);
  await expectNoSidewaysScroll(page);
  await expect(page.locator("main")).toContainText(/kitchen/i);

  const staff = await browser.newContext({ storageState: AUTH.staff, baseURL: testInfo.project.use.baseURL });
  const orders = (await (await staff.request.get("/api/staff/orders")).json()).orders as { id: string; tableLabel: string | null }[];
  const order = orders.find((o) => o.tableLabel === label);
  expect(order, `an order for table ${label} is in the kitchen's list`).toBeTruthy();
  for (const step of ["accept", "ready", "complete"]) {
    const res = await staff.request.post(`/api/staff/orders/${order!.id}/${step}`, { data: step === "accept" ? { prepMinutes: 5 } : {} });
    expect(res.status(), step).toBe(200);
  }
  // Served but not paid: the guest is told the bill is open, and the page keeps watching.
  await expect(page.locator("main")).toContainText(/bill/i, { timeout: 30_000 });

  const paid = await staff.request.post(`/api/staff/orders/${order!.id}/pay`, { data: { method: "cash" } });
  expect(paid.status()).toBe(200);
  await staff.close();
  await expect(page.locator("main")).toContainText(/Paid/i, { timeout: 30_000 });
  expect(problems.list()).toEqual([]);
});
