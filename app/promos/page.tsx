"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../icons";
import { Alert, Button, Segmented, Sheet, Skeleton, StaffTopbar, api, useMe, useToasts } from "../ui";
import { money, plural } from "@/lib/format";
import { toCents } from "../menu/editor";

type Promo = { id: string; code: string; kind: "percent" | "fixed"; value: number; minSubtotalCents: number; active: boolean; expiresAt: string | null; maxUses: number | null; uses: number };

const describe = (p: Promo) => (p.kind === "percent" ? `${p.value}% off` : `${money(p.value)} off`);
const status = (p: Promo) => {
  if (!p.active) return { label: "Off", tone: "" };
  if (p.expiresAt && new Date(p.expiresAt) < new Date()) return { label: "Expired", tone: "badge-warning" };
  if (p.maxUses !== null && p.uses >= p.maxUses) return { label: "Used up", tone: "badge-warning" };
  return { label: "Active", tone: "badge-success" };
};

export default function Promos() {
  const me = useMe();
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Promo | "new" | null>(null);
  const { toast, toasts } = useToasts();

  const load = useCallback(async () => {
    const r = await api<Promo[]>("/api/staff/promos");
    if (r.ok) {
      setPromos(r.data);
      setError(null);
    } else setError(r.status === 403 ? "Only the owner can manage promo codes." : r.error);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function toggle(p: Promo) {
    const r = await api(`/api/staff/promos/${p.id}`, { method: "PUT", json: { active: !p.active } });
    if (!r.ok) toast(r.error, "danger");
    await load();
  }

  return (
    <>
      <StaffTopbar current="/promos" me={me} />
      <main className="container container-md page stack" style={{ "--gap": "16px" } as React.CSSProperties}>
        <div className="row-between wrap">
          <div>
            <h1>Promo codes</h1>
            <p className="muted">Customers enter a code at checkout. Staff can apply codes at the till.</p>
          </div>
          <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>New code</Button>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        {!promos && !error && <div className="card card-flush">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="menu-row"><Skeleton height={20} width="50%" /></div>)}</div>}
        {promos?.length === 0 && (
          <div className="empty">
            <Icon name="tag" size={36} />
            <p className="strong" style={{ color: "var(--text)" }}>No promo codes yet.</p>
            <p className="small">Try WELCOME10 for 10% off a first order.</p>
          </div>
        )}
        {promos && promos.length > 0 && (
          <div className="card card-flush list">
            {promos.map((p) => {
              const s = status(p);
              return (
                <div key={p.id} className="menu-row">
                  <span className="logo" style={{ background: "var(--brand-soft)", color: "var(--brand)", width: 40, height: 40 }}><Icon name="tag" size={18} /></span>
                  <div className="grow">
                    <div className="menu-row-name" style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.02em" }}>{p.code}</div>
                    <div className="subtle">
                      {describe(p)}
                      {p.minSubtotalCents > 0 && ` · min ${money(p.minSubtotalCents)}`}
                      {` · used ${p.uses}${p.maxUses ? ` of ${p.maxUses}` : ""} ${p.uses === 1 ? "time" : "times"}`}
                      {p.expiresAt && ` · ends ${new Date(p.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                    </div>
                  </div>
                  <span className={`badge ${s.tone}`}>{s.label}</span>
                  <label className="switch"><input type="checkbox" role="switch" checked={p.active} onChange={() => toggle(p)} aria-label={`${p.code} on`} /><span /></label>
                  <Button size="sm" icon="edit" aria-label={`Edit ${p.code}`} onClick={() => setEditing(p)}>Edit</Button>
                </div>
              );
            })}
          </div>
        )}
        <p className="subtle">{promos ? plural(promos.length, "code") : ""}</p>
      </main>
      {editing && <PromoSheet promo={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); toast(m); void load(); }} />}
      {toasts}
    </>
  );
}

function PromoSheet({ promo, onClose, onSaved }: { promo: Promo | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [code, setCode] = useState(promo?.code ?? "");
  const [kind, setKind] = useState<"percent" | "fixed">(promo?.kind ?? "percent");
  const [value, setValue] = useState(promo ? (promo.kind === "percent" ? String(promo.value) : (promo.value / 100).toFixed(2)) : "");
  const [min, setMin] = useState(promo?.minSubtotalCents ? (promo.minSubtotalCents / 100).toFixed(2) : "");
  const [maxUses, setMaxUses] = useState(promo?.maxUses ? String(promo.maxUses) : "");
  const [expires, setExpires] = useState(promo?.expiresAt ? promo.expiresAt.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    setError(null);
    const amount = kind === "percent" ? Number(value) : toCents(value);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,19}$/.test(code.trim())) return setError("Use 3 to 20 letters, numbers or dashes for the code.");
    if (!amount || amount < 1 || (kind === "percent" && amount > 100)) return setError(kind === "percent" ? "Enter a percentage from 1 to 100." : "Enter an amount in dollars.");
    const minCents = min.trim() ? toCents(min) : 0;
    if (minCents === null) return setError("Enter the minimum spend in dollars, or leave it blank.");
    setSaving(true);
    const body = {
      code: code.trim().toUpperCase(),
      kind,
      value: Math.round(amount),
      minSubtotalCents: minCents,
      maxUses: maxUses.trim() ? Number(maxUses) : null,
      // Valid through the end of the chosen day, in the owner's browser time.
      expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
    };
    const res = promo ? await api(`/api/staff/promos/${promo.id}`, { method: "PUT", json: body }) : await api("/api/staff/promos", { method: "POST", json: body });
    setSaving(false);
    if (res.ok) onSaved(promo ? `Saved ${body.code}` : `Created ${body.code}`);
    else setError(res.error);
  }

  async function remove() {
    if (!promo) return;
    setSaving(true);
    const res = await api(`/api/staff/promos/${promo.id}`, { method: "DELETE" });
    setSaving(false);
    if (res.ok) onSaved(`Deleted ${promo.code}`);
    else setError(res.error);
  }

  return (
    <Sheet
      title={promo ? "Edit promo code" : "New promo code"}
      onClose={onClose}
      footer={
        <div className="row">
          {promo && <Button variant={confirmDelete ? "danger" : "soft-danger"} icon="trash" disabled={saving} aria-label="Delete code" onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}>{confirmDelete ? "Delete?" : undefined}</Button>}
          <Button variant="primary" size="lg" className="grow" loading={saving && !confirmDelete} onClick={save}>{promo ? "Save changes" : "Create code"}</Button>
        </div>
      }
    >
      <div className="stack" style={{ "--gap": "16px" } as React.CSSProperties}>
        {error && <Alert tone="danger">{error}</Alert>}
        <label className="field">
          <span className="label">Code</span>
          <input className="input" style={{ textTransform: "uppercase", fontFamily: "ui-monospace, monospace" }} autoFocus={!promo} value={code} maxLength={20} placeholder="WELCOME10" onChange={(e) => setCode(e.target.value)} />
          <span className="hint">Customers type this in. Capitals or lowercase both work.</span>
        </label>
        <div className="field">
          <span className="label">Discount</span>
          <Segmented label="Type of discount" value={kind} onChange={setKind} options={[{ value: "percent", label: "Percent off" }, { value: "fixed", label: "Dollars off" }]} />
          <span className={kind === "fixed" ? "price-input" : ""}>
            <input className="input num" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "percent" ? "10" : "5.00"} aria-label="Discount amount" />
          </span>
        </div>
        <label className="field">
          <span className="label">Minimum spend (optional)</span>
          <span className="price-input"><input className="input num" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="0.00" /></span>
        </label>
        <div className="row wrap" style={{ alignItems: "flex-start" }}>
          <label className="field grow" style={{ minWidth: 150 }}>
            <span className="label">Ends on (optional)</span>
            <input className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </label>
          <label className="field grow" style={{ minWidth: 150 }}>
            <span className="label">Limit uses (optional)</span>
            <input className="input num" inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Unlimited" />
          </label>
        </div>
        <p className="subtle">A discount comes off the food before tax. Tips are not discounted.</p>
      </div>
    </Sheet>
  );
}
