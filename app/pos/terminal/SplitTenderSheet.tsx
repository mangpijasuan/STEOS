"use client";

import { useState } from "react";
import { Alert, Button, Sheet } from "../../ui";
import { money } from "@/lib/format";
import { equalShares, matchesTotal, parseTenderAmount, type Tender } from "@/lib/split-tenders";

type Draft = { method: Tender["method"]; amount: string };
const asAmount = (n: number) => (n / 100).toFixed(2);
const makeEqual = (total: number, n: number): Draft[] => equalShares(total,n).map(amount => ({ method: "cash", amount: asAmount(amount) }));

/** This is a record of tender already collected by staff, never a card processing form. */
export function SplitTenderSheet({ total, busy, disabled, error, onConfirm, onClose }: { total: number; busy: boolean; disabled?: boolean; error?: string | null; onConfirm: (parts: Tender[]) => void; onClose: () => void }) {
  const [count, setCount] = useState("2");
  const [rows, setRows] = useState<Draft[]>(() => makeEqual(total,2));
  const [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const parts = rows.map(r => ({ method: r.method, amountCents: parseTenderAmount(r.amount) ?? 0 }));
  const remaining = total - parts.reduce((n, p) => n + p.amountCents, 0);
  const valid = matchesTotal(parts, total);
  const close = () => { if (!busy && (!attempted || window.confirm("If the settlement response was lost, inspect the order before collecting or recording payment again. Close this sheet?"))) onClose(); };
  const edit = (i: number, patch: Partial<Draft>) => { setConfirmed(false); setRows(list => list.map((r,n) => n === i ? {...r,...patch} : r)); };
  return <Sheet title="Split payment" subtitle={`${money(total)} total`} onClose={close} footer={<Button variant="success" size="lg" block loading={busy} disabled={!valid || !confirmed || !!disabled || busy} onClick={() => { setAttempted(true); onConfirm(parts); }}>Record split payment · {money(total)}</Button>}>
    <div className="stack" style={{"--gap":"12px"} as React.CSSProperties}>
      <Alert tone="warning">Record the split only after all listed amounts have been collected. This does not charge a card. Unfinished splits are not saved.</Alert>
      {error && <Alert tone="danger">{error}</Alert>}
      {disabled && <Alert tone="warning">The order is no longer ready to settle. Check the current ticket before continuing.</Alert>}
      <fieldset disabled={attempted || busy} style={{border:0,padding:0,margin:0,minWidth:0}} className="stack">
        <div className="row wrap"><label className="field grow"><span className="label">Equal split guests</span><select className="select" value={count} onChange={e=>setCount(e.target.value)}>{Array.from({length:19},(_,i)=>i+2).map(n=><option key={n} value={n} disabled={n>total}>{n}</option>)}</select></label><Button onClick={()=>{setRows(makeEqual(total,Number(count)));setConfirmed(false);}}>Split equally</Button></div>
        {rows.map((row,i)=><div className="card card-tight stack" key={i}>
          <div className="row-between"><strong>Guest {i+1}</strong>{rows.length>2 && <Button size="sm" variant="ghost" onClick={()=>{setRows(list=>list.filter((_,n)=>n!==i));setConfirmed(false);}}>Remove</Button>}</div>
          <label className="field"><span className="label">Guest {i+1} amount</span><input className="input num" inputMode="decimal" value={row.amount} onChange={e=>edit(i,{amount:e.target.value})} /></label>
          <label className="field"><span className="label">Guest {i+1} payment method</span><select className="select" value={row.method} onChange={e=>edit(i,{method:e.target.value as Tender["method"]})}><option value="cash">Cash</option><option value="card_terminal">External card machine</option><option value="other">Other</option></select></label>
        </div>)}
        <Button disabled={rows.length>=20} onClick={()=>{setRows(list=>[...list,{method:"cash",amount:asAmount(Math.max(0,remaining))}]);setConfirmed(false);}}>Add guest / amount</Button>
      </fieldset>
      <div className="totals"><div className="row-between"><span>{remaining<0 ? "Overallocated" : "Remaining to allocate"}</span><strong>{money(Math.abs(remaining))}</strong></div></div>
      <label className="option"><input type="checkbox" checked={confirmed} disabled={!valid || busy || attempted} onChange={e=>setConfirmed(e.target.checked)} /><span>All listed payments have been received.</span></label>
    </div>
  </Sheet>;
}
