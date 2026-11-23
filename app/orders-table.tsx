"use client";

import { Icon } from "./icons";
import { Skeleton } from "./ui";
import { clockTime, money } from "@/lib/format";

export type RecentOrder = { id: string; number: number; status: string; orderType: string; tableLabel: string | null; customerName: string; paid: boolean; totalCents: number; createdAt: string };

export const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  awaiting_acceptance: { label: "New", cls: "sp-active" },
  accepted: { label: "Cooking", cls: "sp-active" },
  ready: { label: "Ready", cls: "sp-active" },
  completed: { label: "Completed", cls: "sp-completed" },
  declined: { label: "Declined", cls: "sp-closed" },
  cancelled: { label: "Cancelled", cls: "sp-closed" },
  expired: { label: "Timed out", cls: "sp-closed" },
  payment_failed: { label: "Card failed", cls: "sp-closed" },
};
export const TYPE_LABEL: Record<string, string> = { pickup: "Pickup", dine_in: "Dine-in", counter: "Takeaway" };

export function OrdersTable({ orders, timezone }: { orders: RecentOrder[] | null; timezone?: string }) {
  if (!orders) return <div className="stack" style={{ padding: 16 }}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={20} />)}</div>;
  if (orders.length === 0) return <div className="empty" style={{ margin: 16 }}><Icon name="receipt" size={28} /><p>No orders yet.</p></div>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr><th>Order</th><th>Customer</th><th className="hide-sm">Type</th><th className="hide-sm">Time</th><th>Status</th><th className="num">Total</th><th className="hide-sm"><span className="sr-only">Receipt</span></th></tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const pill = STATUS_PILL[o.status] ?? { label: o.status, cls: "sp-closed" };
            return (
              <tr key={o.id}>
                <td className="strong"><a href={`/orders/${o.id}/receipt`} target="_blank" rel="noreferrer" style={{ color: "inherit" }} title="Open the receipt">#{o.number}</a></td>
                <td>{o.tableLabel ? `Table ${o.tableLabel}` : o.customerName}{o.tableLabel && o.customerName !== `Table ${o.tableLabel}` ? <span className="subtle"> · {o.customerName}</span> : null}</td>
                <td className="hide-sm">{TYPE_LABEL[o.orderType] ?? o.orderType}</td>
                <td className="muted hide-sm">{clockTime(o.createdAt, timezone)}</td>
                <td><span className={`status-pill ${pill.cls}`}>{pill.label}</span></td>
                <td className="num strong">{money(o.totalCents)}</td>
                <td className="hide-sm"><a className="btn btn-sm btn-ghost" href={`/orders/${o.id}/receipt`} target="_blank" rel="noreferrer" aria-label={`Receipt for order ${o.number}`}><Icon name="printer" size={16} /></a></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
