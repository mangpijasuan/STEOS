import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { equalShares, matchesTotal, parseTenderAmount } from "../lib/split-tenders";
import { SESSION_COOKIE, consumeLoginToken, requestLogin } from "../lib/auth";
import { outbox } from "../lib/mailer";
import { pool, withTenant } from "../lib/db";
import { buildReport } from "../lib/reports";
import { POST as place } from "../app/api/staff/pos/orders/route";
import { POST as splitPay } from "../app/api/staff/orders/[id]/pay-split/route";
import { POST as accept } from "../app/api/staff/orders/[id]/accept/route";
import { POST as decline } from "../app/api/staff/orders/[id]/decline/route";
import { GET as receipt } from "../app/api/staff/orders/[id]/route";
import { asOwner, createFixture, deleteFixture, type Fixture } from "./helpers";
import { sql } from "drizzle-orm";

describe("integer-cent split allocation", () => {
  it("distributes every cent deterministically", () => {
    expect(equalShares(1000,3)).toEqual([334,333,333]);
    expect(equalShares(2,3)).toEqual([]);
    expect(equalShares(1000,2.5)).toEqual([]);
    expect(parseTenderAmount("1.01")).toBe(101);
    for (const bad of ["1.001","-1","1e2","","Infinity"]) expect(parseTenderAmount(bad)).toBeNull();
    expect(matchesTotal([{method:"cash",amountCents:500},{method:"card_terminal",amountCents:500}],1000)).toBe(true);
    expect(matchesTotal([{method:"cash",amountCents:500},{method:"card_terminal",amountCents:501}],1000)).toBe(false);
  });
});

let a: Fixture, b: Fixture, staff: string, outsider: string;
const split = [{ method: "cash", amountCents: 400 }, { method: "card_terminal", amountCents: 600 }];
const idCtx = (id: string) => ({params:Promise.resolve({id})});
const req = (token: string, body?: unknown, key = crypto.randomUUID(), method = "POST") => new Request("http://localhost/x", {method,headers:{"content-type":"application/json",cookie:`${SESSION_COOKIE}=${token}`,"idempotency-key":key},body:body===undefined?undefined:JSON.stringify(body)});
async function signIn(email: string) { outbox.length=0; await requestLogin(email); return (await consumeLoginToken(new URL(outbox[0].url).searchParams.get("token")!))!.sessionToken; }
const body = () => ({items:[{itemId:a.itemId,quantity:1,optionIds:[]}],orderType:"counter",customerName:"Split test"});
beforeAll(async()=>{ a=await createFixture("split-a");b=await createFixture("split-b");staff=await signIn(a.staffEmail);outsider=await signIn(b.ownerEmail); });
afterAll(async()=>{await deleteFixture(a);await deleteFixture(b);await pool.end();});

describe("atomic manual split settlement",()=>{
  it("rejects incomplete and excessive totals without creating an order; records and reports a complete mixed split once",async()=>{
    for (const n of [599,601]) {
      const r=await place(req(staff,{...body(),payment:{mode:"split",tenders:[split[0],{...split[1],amountCents:n}]}}),{});
      expect(r.status).toBe(422);
    }
    expect((await asOwner(c=>c.query("select id from orders where restaurant_id=$1",[a.restaurantId]))).rows).toEqual([]);
    const key=crypto.randomUUID(), input={...body(),payment:{mode:"split",tenders:split}};
    const [x,y]=await Promise.all([place(req(staff,input,key),{}),place(req(staff,input,key),{})]);
    expect([x.status,y.status]).toEqual([201,201]);
    const put=await x.json(); expect((await y.json()).id).toBe(put.id); expect(put.paid).toBe(true);
    const pay=await asOwner(c=>c.query("select amount_cents,provider,status,method from payments where order_id=$1",[put.id]));
    expect(pay.rows).toEqual([{amount_cents:1000,provider:"manual",status:"captured",method:"other"}]);
    const r=await (await receipt(req(staff,undefined,undefined,"GET"),idCtx(put.id))).json();
    expect(r.tenders).toEqual([{position:1,...split[0]},{position:2,...split[1]}]);
    const report=await withTenant(a.restaurantId,db=>buildReport(db,new Date(Date.now()-86400000),new Date(Date.now()+86400000)));
    expect(report.paidOrders).toBe(1);expect(report.grossCents).toBe(1000);
    expect(report.byMethod.cash).toEqual({orders:1,grossCents:400});expect(report.byMethod.card_terminal).toEqual({orders:1,grossCents:600});expect(report.byMethod.other.grossCents).toBe(0);
    expect((await withTenant(b.restaurantId,db=>db.execute(sql`select id from manual_split_tenders where order_id=${put.id}`))).rows).toEqual([]);
    expect((await decline(req(staff,{}),idCtx(put.id))).status).toBe(409);
    expect((await decline(req(staff,{inPersonRefundReturned:true}),idCtx(put.id))).status).toBe(200);
    const refunded=await (await receipt(req(staff,undefined,undefined,"GET"),idCtx(put.id))).json();expect(refunded.paymentStatus).toBe("refunded");expect(refunded.tenders).toEqual(r.tenders);
  });

  it("settles an accepted unpaid order only once across workstations",async()=>{
    const r=await place(req(staff,{...body(),payment:{mode:"later"}}),{});const {id}=await r.json();
    expect((await splitPay(req(staff,{tenders:split}),idCtx(id))).status).toBe(409);
    expect((await accept(req(staff,{prepMinutes:5}),idCtx(id))).status).toBe(200);
    expect((await splitPay(req(outsider,{tenders:split}),idCtx(id))).status).toBe(404);
    const key=crypto.randomUUID();
    const [x,y]=await Promise.all([splitPay(req(staff,{tenders:split},key),idCtx(id)),splitPay(req(staff,{tenders:split},key),idCtx(id))]);
    expect([x.status,y.status]).toEqual([200,200]);
    expect((await splitPay(req(staff,{tenders:split}),idCtx(id))).status).toBe(409);
    expect((await asOwner(c=>c.query("select id from manual_split_tenders where order_id=$1",[id]))).rows).toHaveLength(2);
  });

  it("never returns a partially visible settlement on concurrent receipt reads", async () => {
    const placed = await place(req(staff,{...body(),payment:{mode:"later"}}),{});
    const {id} = await placed.json();
    expect((await accept(req(staff,{prepMinutes:5}),idCtx(id))).status).toBe(200);
    const read = async () => {
      const res = await receipt(req(staff,undefined,undefined,"GET"),idCtx(id));
      expect(res.status).toBe(200);
      const data = await res.json();
      if (data.paid) {
        expect(data.paymentStatus).toBe("captured");
        expect(data.tenders).toEqual(split.map((p,i) => ({position:i+1,...p})));
      } else {
        expect(data.paymentStatus).toBeNull();
        expect(data.tenders).toEqual([]);
      }
      return data.paid;
    };
    expect(await read()).toBe(false);
    const [settlement] = await Promise.all([splitPay(req(staff,{tenders:split}),idCtx(id)),...Array.from({length:8},()=>read())]);
    expect(settlement.status).toBe(200);
    expect(await read()).toBe(true);
  });
});
