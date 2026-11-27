import { expect, test } from "@playwright/test";
import { AUTH, expectNoSidewaysScroll } from "./helpers";
import type { Board } from "../app/tables/types";

test.use({storageState:AUTH.staff});

test("staff can allocate a mixed split and must confirm collection before recording", async ({page})=>{
  await page.goto("/pos/terminal");
  await page.getByRole("button",{name:/Chicken rice bowl,/}).click();
  const review=page.getByRole("button",{name:/Review order/});
  if(await review.isVisible()) await review.click();
  await page.getByRole("button",{name:"Takeaway"}).click();
  await page.getByRole("button",{name:"Split payment", exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Split payment"});
  const record=dialog.getByRole("button",{name:/Record split payment/});
  await expect(record).toBeDisabled();
  await dialog.getByLabel("Equal split guests").selectOption("3");
  await dialog.getByRole("button",{name:"Split equally"}).click();
  await expect(dialog.getByLabel("Guest 3 amount")).toBeVisible();
  await dialog.getByLabel("Guest 2 payment method").selectOption("card_terminal");
  const original=await dialog.getByLabel("Guest 1 amount").inputValue();
  await dialog.getByLabel("Guest 1 amount").fill("0.01");
  await expect(record).toBeDisabled();
  await dialog.getByLabel("Guest 1 amount").fill(original);
  await dialog.getByLabel("All listed payments have been received.").check();
  await expect(record).toBeEnabled();
  await expectNoSidewaysScroll(page);
  await record.click();
  await expect(page.getByRole("heading",{name:/Order #\d+ placed/})).toBeVisible();
});

test.describe("owner refund confirmation", () => {
  test.use({storageState: AUTH.owner});
  test("table owner confirms all manually split tenders were returned", async ({page}) => {
    const board: Board = await (await page.request.get("/api/staff/tables")).json();
    const table = board.tables.find(t => t.label === "3")!;
    const menu = await (await page.request.get("/api/staff/menu")).json() as {items:{id:string;name:string}[]}[];
    const item = menu.flatMap(c=>c.items).find(i=>i.name === "Iced tea")!;
    const placed = await page.request.post("/api/staff/pos/orders", {headers:{"Idempotency-Key":crypto.randomUUID()},data:{items:[{itemId:item.id,quantity:1,optionIds:[]}],orderType:"dine_in",tableId:table.id,payment:{mode:"later"}}});
    expect(placed.status()).toBe(201);
    const {id,number,totalCents} = await placed.json();
    expect((await page.request.post(`/api/staff/orders/${id}/accept`,{data:{prepMinutes:5}})).status()).toBe(200);
    expect((await page.request.post(`/api/staff/orders/${id}/pay-split`,{headers:{"Idempotency-Key":crypto.randomUUID()},data:{tenders:[{method:"cash",amountCents:1},{method:"card_terminal",amountCents:totalCents-1}]}})).status()).toBe(200);
    await page.goto("/tables");
    await page.getByRole("button",{name:/^Table 3,/}).click();
    const order = page.locator(".order-block").filter({has:page.getByText(`#${number}`,{exact:true})});
    await order.getByRole("button",{name:"Cancel",exact:true}).click();
    await order.getByRole("button",{name:/Confirm .* returned in person/}).click();
    await expect.poll(async()=> (await (await page.request.get(`/api/staff/orders/${id}`)).json()).paymentStatus).toBe("refunded");
    const receipt = await (await page.request.get(`/api/staff/orders/${id}`)).json();
    expect(receipt.tenders).toHaveLength(2);
    expect(receipt.status).toBe("cancelled");
  });
});
