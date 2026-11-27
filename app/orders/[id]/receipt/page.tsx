"use client";

import { use, useEffect, useRef, useState } from "react";
import { Alert, Button, Skeleton, StaffTopbar, api, useMe } from "../../../ui";
import { Icon } from "../../../icons";
import { money } from "@/lib/format";
import type { Tender } from "@/lib/split-tenders";
import { SplitTenderSheet } from "../../../pos/terminal/SplitTenderSheet";

type Receipt = {
  restaurant: { name: string; timezone: string; address: string[]; phone: string | null };
  number: number;
  createdAt: string;
  orderType: string;
  tableLabel: string | null;
  customerName: string;
  status: string;
  paymentMode: string;
  paid: boolean;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  tenders: (Tender & { position: number })[];
  subtotalCents: number;
  discountCents: number;
  discountLabel: string | null;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  items: { name: string; quantity: number; unitPriceCents: number; options: { name: string }[]; note: string | null; lineTotalCents: number }[];
};

const METHOD: Record<string, string> = { card_online: "Card (online)", cash: "Cash", card_terminal: "Card (terminal)", other: "Other" };
const TYPE: Record<string, string> = { pickup: "Pickup", dine_in: "Dine-in", counter: "Takeaway" };

/** A narrow receipt for a thermal printer, or any printer. `?print=1` opens the print dialog by itself. */
export default function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string; split?: string; tender?: string }> }) {
  const { id } = use(params);
  const { print, split, tender } = use(searchParams);
  const me = useMe();
  const [r, setR] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [splitting, setSplitting] = useState(split === "1");
  const [splitBusy, setSplitBusy] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);
  const splitKey = useRef<string | null>(null);
  const canSplit = !!r && !r.paid && r.paymentMode === "pay_later" && ["accepted","ready","completed"].includes(r.status) && r.totalCents >= 2;
  const selectedTender = tender ? r?.tenders.find(t => String(t.position) === tender) : undefined;

  async function settle(parts: Tender[]) {
    if (!canSplit || splitBusy) return;
    setSplitBusy(true); setSplitError(null);
    const result = await api(`/api/staff/orders/${id}/pay-split`, { method:"POST", headers:{"Idempotency-Key":(splitKey.current ??= crypto.randomUUID())}, json:{tenders:parts} });
    if (!result.ok) { setSplitBusy(false); setSplitError(result.error); return; }
    const fresh = await api<Receipt>(`/api/staff/orders/${id}`);
    setSplitBusy(false); setSplitting(false);
    if (fresh.ok) setR(fresh.data); else { setR(null); setError("Payment recorded. Reload this receipt to confirm the result."); }
  }

  useEffect(() => {
    void (async () => {
      const res = await api<Receipt>(`/api/staff/orders/${id}`);
      if (res.ok) setR(res.data);
      else setError(res.status === 404 ? "We couldn't find that order." : res.error);
    })();
  }, [id]);

  useEffect(() => {
    if (r && print === "1") {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [r, print]);

  const when = r ? new Date(r.createdAt).toLocaleString("en-US", { timeZone: r.restaurant.timezone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

  return (
    <>
      <StaffTopbar current="/tables" me={me} />
      <main className="container container-sm page stack" style={{ "--gap": "16px" } as React.CSSProperties}>
        <div className="row-between no-print">
          <a href="/tables" className="small"><Icon name="arrowLeft" size={14} /> Back</a>
          <Button variant="primary" icon="printer" disabled={!r} onClick={() => window.print()}>Print</Button>
        </div>
        {canSplit && <Button onClick={()=>{splitKey.current=null;setSplitError(null);setSplitting(true);}}>Split payment</Button>}
        {error && <Alert tone="danger">{error}</Alert>}
        {!r && !error && <Skeleton height={360} />}
        {r && (
          <article className="receipt" aria-label={`Receipt for order ${r.number}`}>
            <h1>{r.restaurant.name}</h1>
            <div className="r-center">
              {r.restaurant.address.map((l) => <div key={l}>{l}</div>)}
              {r.restaurant.phone && <div>{r.restaurant.phone}</div>}
            </div>
            <hr className="r-rule" />
            <div className="r-row"><span>Order #{r.number}</span><span>{TYPE[r.orderType] ?? r.orderType}{r.tableLabel ? ` · Table ${r.tableLabel}` : ""}</span></div>
            <div className="r-row"><span>{when}</span><span>{r.customerName}</span></div>
            {tender && !selectedTender ? <p>Payment allocation not found.</p> : selectedTender ? <><hr className="r-rule" /><h2>Guest {selectedTender.position} payment receipt</h2><div className="r-row"><span>Order total</span><span>{money(r.totalCents)}</span></div><div className="r-row"><span>{METHOD[selectedTender.method]}</span><span>{money(selectedTender.amountCents)}</span></div><div className="r-center">{r.paymentStatus === "refunded" ? "Refunded" : "Recorded payment"} · Not an itemized bill</div></> : <>
            <hr className="r-rule" />
            {r.items.map((i, n) => (
              <div key={n} className="r-item">
                <div className="r-row"><span>{i.quantity} × {i.name}</span><span>{money(i.lineTotalCents)}</span></div>
                {i.options.map((o) => <div key={o.name} className="r-sub">+ {o.name}</div>)}
                {i.note && <div className="r-sub">“{i.note}”</div>}
              </div>
            ))}
            <hr className="r-rule" />
            <div className="r-row"><span>Subtotal</span><span>{money(r.subtotalCents)}</span></div>
            {r.discountCents > 0 && <div className="r-row"><span>{r.discountLabel}</span><span>− {money(r.discountCents)}</span></div>}
            <div className="r-row"><span>Tax</span><span>{money(r.taxCents)}</span></div>
            {r.tipCents > 0 && <div className="r-row"><span>Tip</span><span>{money(r.tipCents)}</span></div>}
            <hr className="r-rule" />
            <div className="r-row r-total"><span>TOTAL</span><span>{money(r.totalCents)}</span></div>
            <div className="r-row"><span>{r.paymentStatus === "refunded" ? "Refunded" : r.paid ? "Paid" : "Not paid yet"}</span><span>{r.tenders.length ? "Split payment" : r.paid && r.paymentMethod ? (METHOD[r.paymentMethod] ?? r.paymentMethod) : ""}</span></div>
            {r.tenders.map(t => <div className="r-row" key={t.position}><span>Guest {t.position} · {METHOD[t.method]}</span><span>{money(t.amountCents)}</span></div>)}
            </>}
            <hr className="r-rule" />
            <div className="r-center">Thank you!</div>
          </article>
        )}
        {r && !tender && r.tenders.map(t=><a key={t.position} className="btn no-print" href={`/orders/${id}/receipt?tender=${t.position}&print=1`} target="_blank" rel="noreferrer">Print guest {t.position} payment receipt</a>)}
        {r && splitting && canSplit && <SplitTenderSheet total={r.totalCents} busy={splitBusy} error={splitError} onConfirm={settle} onClose={()=>setSplitting(false)} />}
      </main>
    </>
  );
}
