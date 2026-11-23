"use client";

import { use, useEffect, useState } from "react";
import { Alert, Button, Skeleton, StaffTopbar, api, useMe } from "../../../ui";
import { Icon } from "../../../icons";
import { money } from "@/lib/format";

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
export default function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const { id } = use(params);
  const { print } = use(searchParams);
  const me = useMe();
  const [r, setR] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            <div className="r-row"><span>{r.paid ? "Paid" : "Not paid yet"}</span><span>{r.paid && r.paymentMethod ? (METHOD[r.paymentMethod] ?? r.paymentMethod) : ""}</span></div>
            <hr className="r-rule" />
            <div className="r-center">Thank you!</div>
          </article>
        )}
      </main>
    </>
  );
}
