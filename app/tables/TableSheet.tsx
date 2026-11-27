"use client";

import { useState } from "react";
import { Icon } from "../icons";
import { Alert, Button, Sheet, api } from "../ui";
import { money, plural } from "@/lib/format";
import { REQUEST_TITLES, STATUS_TEXT, type Board, type BoardOrder, type BoardTable } from "./types";

type Props = {
  table: BoardTable;
  board: Board;
  isOwner: boolean;
  myId: string | undefined;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  toast: (text: string, tone?: "danger") => void;
};

const minutesAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));

export function TableSheet({ table, board, isOwner, onClose, onChanged, toast }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  /** Runs an action, then refreshes the board. Shows the server's reason if it is refused. */
  async function run(key: string, call: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    setBusy(key);
    setError(null);
    setConfirm(null);
    const res = await call();
    await onChanged();
    setBusy(null);
    if (res.ok) {
      if (success) toast(success);
    } else setError((res as { error: string }).error);
  }

  const floorName = board.floors.find((f) => f.id === table.floorId)?.name;
  const canClear = table.orders.length > 0 || table.requests.length > 0;
  const allServedAndPaid = table.orders.every((o) => o.status === "completed" && o.paidAt);

  return (
    <Sheet
      title={`Table ${table.label}`}
      subtitle={[floorName, plural(table.seats, "seat"), table.assignedTo ? `Waiter: ${table.assignedTo.name}` : "No waiter assigned"].filter(Boolean).join(" · ")}
      onClose={onClose}
      footer={
        <div className="row">
          <Button
            variant={allServedAndPaid && canClear ? "success" : "secondary"}
            size="lg"
            className="grow"
            icon="check"
            loading={busy === "clear"}
            disabled={!canClear || !!busy}
            onClick={() => run("clear", () => api(`/api/staff/tables/${table.id}/clear`, { method: "POST" }), `Table ${table.label} cleared`)}
          >
            Clear table
          </Button>
          <a className="btn btn-lg" href={`/pos?table=${table.id}`}><Icon name="plus" size={18} /> Add order</a>
        </div>
      }
    >
      <div className="stack" style={{ "--gap": "16px" } as React.CSSProperties}>
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="row wrap">
          <span className={`badge ${table.priority ? "badge-danger" : "badge-brand"}`}>{table.statusLabel}</span>
          {table.unpaidCents > 0 && <span className="badge badge-warning">Unpaid {money(table.unpaidCents)}</span>}
        </div>

        {table.requests.map((r) => (
          <div key={r.id} className="req-block">
            <Icon name={r.kind === "bill_cash" ? "cash" : r.kind === "bill_card" ? "card" : "bell"} size={20} />
            <span className="grow">
              {REQUEST_TITLES[r.kind]}
              <span className="subtle" style={{ display: "block", fontWeight: 500, color: "inherit", opacity: 0.8 }}>{minutesAgo(r.createdAt)} min ago</span>
            </span>
            <Button size="sm" loading={busy === r.id} disabled={!!busy} onClick={() => run(r.id, () => api(`/api/staff/table-requests/${r.id}/resolve`, { method: "POST" }))}>
              Done
            </Button>
          </div>
        ))}

        {table.orders.length === 0 && table.requests.length === 0 && (
          <div className="empty"><Icon name="table" size={28} /><p>Nothing at this table right now.</p></div>
        )}

        {table.orders.map((o) => (
          <OrderBlock key={o.id} order={o} isOwner={isOwner} busy={busy} confirm={confirm} setConfirm={setConfirm} run={run} />
        ))}

        {isOwner && (
          <section className="stack" aria-label="Table settings" style={{ "--gap": "12px" } as React.CSSProperties}>
            <div className="row-between">
              <h3>Table settings</h3>
              <Button size="sm" icon="edit" onClick={() => setEditing((e) => !e)}>{editing ? "Hide" : "Edit"}</Button>
            </div>
            {editing && <TableSettings table={table} board={board} onChanged={onChanged} onDeleted={onClose} toast={toast} />}
          </section>
        )}
      </div>
    </Sheet>
  );
}

function OrderBlock({
  order: o,
  isOwner,
  busy,
  confirm,
  setConfirm,
  run,
}: {
  order: BoardOrder;
  isOwner: boolean;
  busy: string | null;
  confirm: string | null;
  setConfirm: (k: string | null) => void;
  run: (key: string, call: () => Promise<{ ok: boolean; error?: string }>, success?: string) => Promise<void>;
}) {
  const needsPayment = o.paymentMode === "pay_later" && !o.paidAt && o.status !== "awaiting_acceptance";
  const canServe = o.status === "accepted" || o.status === "ready";
  const canCancel = isOwner && (o.status === "accepted" || o.status === "ready");

  const pay = (method: "cash" | "card_terminal") => {
    const key = `pay-${o.id}-${method}`;
    return confirm === key ? (
      <Button variant="success" loading={busy === key} disabled={!!busy} onClick={() => run(key, () => api(`/api/staff/orders/${o.id}/pay`, { method: "POST", json: { method } }), `Order #${o.number} paid`)}>
        Confirm {money(o.totalCents)}
      </Button>
    ) : (
      <Button icon={method === "cash" ? "cash" : "card"} disabled={!!busy} onClick={() => setConfirm(key)}>
        {method === "cash" ? "Paid · cash" : "Paid · card machine"}
      </Button>
    );
  };

  return (
    <div className="order-block">
      <div className="row-between">
        <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
          <strong>#{o.number}</strong>
          <span className="badge">{STATUS_TEXT[o.status] ?? o.status}</span>
          <span className={`badge ${o.paidAt ? "badge-success" : o.paymentMode === "pay_later" ? "badge-warning" : ""}`}>
            {o.paidAt ? "Paid" : o.paymentMode === "pay_later" ? "Pay at table" : "Card hold"}
          </span>
        </div>
        <strong className="num">{money(o.totalCents)}</strong>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }} className="small">
        {o.items.map((i, n) => (
          <li key={n}>
            <strong className="num">{i.quantity}×</strong> {i.name}
            {i.options.length > 0 && <span className="muted"> · {i.options.map((x) => x.name).join(", ")}</span>}
            {i.note && <span className="muted"> · “{i.note}”</span>}
          </li>
        ))}
      </ul>
      {o.tipCents > 0 && <div className="subtle">Includes {money(o.tipCents)} tip</div>}
      <div className="row wrap" style={{ "--gap": "8px" } as React.CSSProperties}>
          <a className="btn btn-sm" href={`/orders/${o.id}/receipt`} target="_blank" rel="noreferrer"><Icon name="printer" size={16} /> Receipt</a>
          {canServe && (
            <Button variant={o.status === "ready" ? "primary" : "secondary"} icon="check" loading={busy === `serve-${o.id}`} disabled={!!busy} onClick={() => run(`serve-${o.id}`, () => api(`/api/staff/orders/${o.id}/complete`, { method: "POST" }), `Order #${o.number} served`)}>
              Mark served
            </Button>
          )}
          {needsPayment && (
            <>
              {pay("cash")}
              {pay("card_terminal")}
              {o.totalCents >= 2 && <a className="btn btn-sm" href={`/orders/${o.id}/receipt?split=1`} target="_blank" rel="noreferrer">Split bill</a>}
            </>
          )}
          {canCancel &&
            (confirm === `cancel-${o.id}` ? (
              <Button variant="danger" loading={busy === `cancel-${o.id}`} disabled={!!busy} onClick={() => run(`cancel-${o.id}`, () => api(`/api/staff/orders/${o.id}/cancel`, { method: "POST" }), `Order #${o.number} cancelled`)}>
                {o.paymentMode === "online" ? `Refund ${money(o.totalCents)}?` : o.paidAt ? "Cancel and refund in person?" : "Cancel order?"}
              </Button>
            ) : (
              <Button variant="soft-danger" disabled={!!busy} onClick={() => setConfirm(`cancel-${o.id}`)}>Cancel</Button>
            ))}
      </div>
    </div>
  );
}

function TableSettings({ table, board, onChanged, onDeleted, toast }: { table: BoardTable; board: Board; onChanged: () => Promise<void> | void; onDeleted: () => void; toast: Props["toast"] }) {
  const [label, setLabel] = useState(table.label);
  const [seats, setSeats] = useState(String(table.seats));
  const [floorId, setFloorId] = useState(table.floorId ?? "");
  const [assignedTo, setAssignedTo] = useState(table.assignedTo?.id ?? "");
  const [active, setActive] = useState(table.active);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    setBusy("save");
    setError(null);
    const res = await api(`/api/staff/tables/${table.id}`, {
      method: "PUT",
      json: { label: label.trim(), seats: Number(seats) || 4, floorId: floorId || null, assignedTo: assignedTo || null, active },
    });
    await onChanged();
    setBusy(null);
    if (res.ok) toast("Table saved");
    else setError(res.error);
  }

  async function regenerate() {
    setBusy("qr");
    const res = await api(`/api/staff/tables/${table.id}/qr`, { method: "POST" });
    await onChanged();
    setBusy(null);
    if (res.ok) toast("New QR code created. Print it, and the old one stops working.");
    else setError(res.error);
  }

  async function remove() {
    setBusy("delete");
    const res = await api(`/api/staff/tables/${table.id}`, { method: "DELETE" });
    await onChanged();
    setBusy(null);
    if (res.ok) {
      toast(`Table ${table.label} deleted`);
      onDeleted();
    } else {
      setConfirmDelete(false);
      setError(res.error);
    }
  }

  return (
    <div className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="row wrap" style={{ alignItems: "flex-end" }}>
        <label className="field grow" style={{ minWidth: 120 }}>
          <span className="label">Name</span>
          <input className="input" value={label} maxLength={12} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="field" style={{ width: 96 }}>
          <span className="label">Seats</span>
          <input className="input num" inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </label>
      </div>
      <label className="field">
        <span className="label">Floor</span>
        <select className="select" value={floorId} onChange={(e) => setFloorId(e.target.value)}>
          <option value="">No floor</option>
          {board.floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="label">Waiter</span>
        <select className="select" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
          <option value="">Nobody</option>
          {board.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="row-between option" style={{ cursor: "pointer" }}>
        <span><span className="strong">In use</span><span className="subtle" style={{ display: "block" }}>Turn off to hide the table and disable its QR code</span></span>
        <span className="switch"><input type="checkbox" role="switch" checked={active} onChange={(e) => setActive(e.target.checked)} /><span /></span>
      </label>
      <div className="row wrap">
        <Button variant="primary" className="grow" loading={busy === "save"} disabled={!!busy} onClick={save}>Save table</Button>
        <a className="btn" href={`/tables/qr?table=${table.id}`}><Icon name="qr" size={18} /> QR code</a>
      </div>
      <div className="row wrap">
        <Button size="sm" loading={busy === "qr"} disabled={!!busy} onClick={regenerate}>Replace QR code</Button>
        <Button size="sm" variant={confirmDelete ? "danger" : "soft-danger"} icon="trash" loading={busy === "delete"} disabled={!!busy} onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}>
          {confirmDelete ? "Delete table?" : "Delete"}
        </Button>
      </div>
    </div>
  );
}
