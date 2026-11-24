"use client";

import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { Alert, Button, Sheet, api } from "../ui";
import { parseTableLabels } from "@/lib/tableLabels";
import type { Board } from "./types";

type Settings = { dineInEnabled: boolean; payLaterEnabled: boolean };

export function SetupSheet({ board, onClose, onChanged, toast }: { board: Board; onClose: () => void; onChanged: () => Promise<void> | void; toast: (text: string, tone?: "danger") => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [names, setNames] = useState("");
  const [floorId, setFloorId] = useState("");
  const [seats, setSeats] = useState("4");
  const [newFloor, setNewFloor] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [floorNames, setFloorNames] = useState<Record<string, string>>({});

  useEffect(() => {
    void api<Settings>("/api/staff/settings").then((r) => r.ok && setSettings(r.data));
  }, []);

  async function setSetting(patch: Partial<Settings>) {
    if (!settings) return;
    const before = settings;
    setSettings({ ...settings, ...patch });
    const res = await api<Settings>("/api/staff/settings", { method: "PATCH", json: patch });
    if (!res.ok) {
      setSettings(before);
      toast(res.error, "danger");
    }
  }

  async function addTables() {
    setError(null);
    const parsed = parseTableLabels(names);
    if (parsed.error) return setError(parsed.error);
    setBusy("tables");
    const res = await api<{ created: number; skipped: number }>("/api/staff/tables", { method: "POST", json: { labels: parsed.labels, floorId: floorId || null, seats: Number(seats) || 4 } });
    await onChanged();
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setNames("");
    toast(`Added ${res.data.created} table${res.data.created === 1 ? "" : "s"}${res.data.skipped ? ` (${res.data.skipped} already existed)` : ""}`);
  }

  async function addFloor() {
    if (!newFloor.trim()) return;
    setBusy("floor");
    setError(null);
    const res = await api<{ id: string }>("/api/staff/floors", { method: "POST", json: { name: newFloor.trim() } });
    await onChanged();
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setNewFloor("");
    setFloorId(res.data.id);
  }

  async function renameFloor(id: string) {
    const name = (floorNames[id] ?? "").trim();
    if (!name) return;
    const res = await api(`/api/staff/floors/${id}`, { method: "PUT", json: { name } });
    await onChanged();
    if (res.ok) toast("Floor renamed");
    else setError(res.error);
  }

  async function removeFloor(id: string) {
    const res = await api(`/api/staff/floors/${id}`, { method: "DELETE" });
    await onChanged();
    if (res.ok) {
      toast("Floor removed. Its tables stay, without a floor.");
      if (floorId === id) setFloorId("");
    } else setError(res.error);
  }

  return (
    <Sheet title="Set up tables" subtitle="Floors, tables and QR codes" onClose={onClose}>
      <div className="stack" style={{ "--gap": "22px" } as React.CSSProperties}>
        {error && <Alert tone="danger">{error}</Alert>}

        <section className="stack" aria-labelledby="s-ordering">
          <h3 id="s-ordering">Ordering from the table</h3>
          <label className="row-between option" style={{ cursor: "pointer" }}>
            <span><span className="strong">Guests can order by QR code</span><span className="subtle" style={{ display: "block" }}>Turn on once your QR codes are printed</span></span>
            <span className="switch"><input type="checkbox" role="switch" disabled={!settings} checked={settings?.dineInEnabled ?? false} onChange={(e) => setSetting({ dineInEnabled: e.target.checked })} /><span /></span>
          </label>
          <label className="row-between option" style={{ cursor: "pointer" }}>
            <span><span className="strong">Allow “pay later at the table”</span><span className="subtle" style={{ display: "block" }}>Guests order first and pay a waiter. STOS’s fee on these orders is invoiced.</span></span>
            <span className="switch"><input type="checkbox" role="switch" disabled={!settings} checked={settings?.payLaterEnabled ?? true} onChange={(e) => setSetting({ payLaterEnabled: e.target.checked })} /><span /></span>
          </label>
        </section>

        <section className="stack" aria-labelledby="s-floors">
          <h3 id="s-floors">Floors</h3>
          {board.floors.length === 0 && <p className="subtle">Floors are optional. Add one if your restaurant has more than one area, like “Patio” or “Upstairs”.</p>}
          {board.floors.map((f) => (
            <div key={f.id} className="row">
              <input className="input grow" aria-label={`Floor name ${f.name}`} value={floorNames[f.id] ?? f.name} maxLength={40} onChange={(e) => setFloorNames((n) => ({ ...n, [f.id]: e.target.value }))} onBlur={() => (floorNames[f.id] ?? f.name) !== f.name && renameFloor(f.id)} />
              <Button variant="ghost" size="sm" icon="trash" aria-label={`Remove ${f.name}`} onClick={() => removeFloor(f.id)} />
            </div>
          ))}
          <div className="row">
            <input className="input grow" placeholder="New floor, e.g. 1st Floor" value={newFloor} maxLength={40} onChange={(e) => setNewFloor(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFloor()} />
            <Button icon="plus" loading={busy === "floor"} disabled={!newFloor.trim() || !!busy} onClick={addFloor}>Add</Button>
          </div>
        </section>

        <section className="stack" aria-labelledby="s-tables">
          <h3 id="s-tables">Add tables</h3>
          <label className="field">
            <span className="label">Table names</span>
            <input className="input" value={names} placeholder="1-12  or  A1, A2, Patio 1" onChange={(e) => setNames(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTables()} />
            <span className="hint">A range like 1-12 adds twelve tables. Use 01-12 to keep a leading zero.</span>
          </label>
          <div className="row wrap" style={{ alignItems: "flex-end" }}>
            <label className="field grow" style={{ minWidth: 150 }}>
              <span className="label">Floor</span>
              <select className="select" value={floorId} onChange={(e) => setFloorId(e.target.value)}>
                <option value="">No floor</option>
                {board.floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
            <label className="field" style={{ width: 96 }}>
              <span className="label">Seats</span>
              <input className="input num" inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value.replace(/\D/g, "").slice(0, 2))} />
            </label>
          </div>
          <Button variant="primary" icon="plus" loading={busy === "tables"} disabled={!names.trim() || !!busy} onClick={addTables}>Add tables</Button>
        </section>

        <section className="stack" aria-labelledby="s-qr">
          <h3 id="s-qr">QR codes</h3>
          <p className="subtle">Print a card for each table and stand it on the table. Each code is private to its table; if one leaks, replace it from the table's settings.</p>
          <a className="btn btn-primary" href="/tables/qr"><Icon name="printer" size={18} /> Print QR codes</a>
        </section>
      </div>
    </Sheet>
  );
}
