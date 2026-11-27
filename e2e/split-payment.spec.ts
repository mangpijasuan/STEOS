import { expect, test } from "@playwright/test";
import { AUTH, expectNoSidewaysScroll } from "./helpers";

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
