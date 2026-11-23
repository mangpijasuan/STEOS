"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "../icons";
import { Alert, Button, Skeleton, StaffTopbar, api, useMe, useToasts } from "../ui";
import type { HoursPeriod } from "@/lib/hours";

type Settings = { acceptingOrders: boolean; minPrepMinutes: number; maxAdvanceDays: number; taxRateBps: number; dineInEnabled: boolean; payLaterEnabled: boolean };
type Period = HoursPeriod & { key: string };

// Monday first, the way a restaurant thinks about a week. weekday 0 is Sunday, as the server stores it.
const WEEK = [
  { weekday: 1, name: "Monday" },
  { weekday: 2, name: "Tuesday" },
  { weekday: 3, name: "Wednesday" },
  { weekday: 4, name: "Thursday" },
  { weekday: 5, name: "Friday" },
  { weekday: 6, name: "Saturday" },
  { weekday: 0, name: "Sunday" },
];
const MAX_PERIODS = 28; // the server's limit on opening periods

const newKey = () => crypto.randomUUID();
const withKeys = (periods: HoursPeriod[]): Period[] => periods.map((p) => ({ ...p, key: newKey() }));

export default function Manage() {
  const me = useMe();
  const isOwner = me?.role === "owner";
  const { toast, toasts } = useToasts();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hours, setHours] = useState<Period[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState<"settings" | "hours" | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [hoursError, setHoursError] = useState<string | null>(null);

  // The form fields are held as text while typing and converted when saved.
  const [prep, setPrep] = useState("");
  const [advance, setAdvance] = useState("");
  const [taxPct, setTaxPct] = useState("");
  const [accepting, setAccepting] = useState(true);
  const [dineIn, setDineIn] = useState(false);
  const [payLater, setPayLater] = useState(true);

  const fillSettings = (s: Settings) => {
    setSettings(s);
    setPrep(String(s.minPrepMinutes));
    setAdvance(String(s.maxAdvanceDays));
    setTaxPct(String(s.taxRateBps / 100));
    setAccepting(s.acceptingOrders);
    setDineIn(s.dineInEnabled);
    setPayLater(s.payLaterEnabled);
  };

  useEffect(() => {
    if (!me) return;
    if (!isOwner) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadError("Only the restaurant owner can edit these settings.");
      return;
    }
    let live = true;
    setLoadError(null);
    void (async () => {
      const [s, h] = await Promise.all([api<Settings>("/api/staff/settings"), api<{ periods: HoursPeriod[] }>("/api/staff/hours")]);
      if (!live) return;
      if (!s.ok || !h.ok) return setLoadError("Could not load ordering hours and settings");
      fillSettings(s.data);
      setHours(withKeys(h.data.periods));
    })();
    return () => {
      live = false;
    };
  }, [me, isOwner, reloadKey]);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setSettingsError(null);
    setSaving("settings");
    const r = await api<Settings>("/api/staff/settings", {
      method: "PATCH",
      json: {
        minPrepMinutes: Number(prep),
        maxAdvanceDays: Number(advance),
        taxRateBps: Math.round(Number(taxPct) * 100),
        acceptingOrders: accepting,
        dineInEnabled: dineIn,
        payLaterEnabled: payLater,
      },
    });
    setSaving(null);
    if (r.ok) {
      fillSettings(r.data);
      toast("Ordering settings saved");
    } else setSettingsError(r.error);
  }

  async function saveHours(e: FormEvent) {
    e.preventDefault();
    if (!hours) return;
    setHoursError(null);
    setSaving("hours");
    const periods = [...hours]
      .sort((a, b) => a.weekday - b.weekday || a.opens.localeCompare(b.opens))
      .map(({ weekday, opens, closes }) => ({ weekday, opens, closes }));
    const r = await api<{ periods: HoursPeriod[] }>("/api/staff/hours", { method: "PUT", json: { periods } });
    setSaving(null);
    if (r.ok) {
      // What the server saved replaces the form, so what is shown is what customers will see.
      setHours(withKeys(r.data.periods));
      toast("Weekly hours saved");
    } else setHoursError(r.error);
  }

  const update = (key: string, patch: Partial<HoursPeriod>) => setHours((h) => h && h.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const remove = (key: string) => setHours((h) => h && h.filter((p) => p.key !== key));
  const add = (weekday: number) =>
    setHours((h) => {
      if (!h) return h;
      const mine = h.filter((p) => p.weekday === weekday);
      // A second period on the same day starts out as an evening service; the first as a normal day.
      return [...h, { key: newKey(), weekday, opens: mine.length ? "17:00" : "11:00", closes: mine.length ? "21:00" : "21:00" }];
    });
  const byDay = useMemo(() => WEEK.map((d) => ({ ...d, periods: (hours ?? []).filter((p) => p.weekday === d.weekday).sort((a, b) => a.opens.localeCompare(b.opens)) })), [hours]);
  const total = hours?.length ?? 0;

  return (
    <>
      <StaffTopbar current="/manage" me={me} />
      <main className="container container-md page stack" style={{ "--gap": "18px" } as React.CSSProperties}>
        <div>
          <h1>Hours & settings</h1>
          <p className="muted">When customers can order, and how ordering works.</p>
        </div>

        {loadError && (
          <Alert tone="danger" action={loadError.startsWith("Only") ? undefined : <Button size="sm" onClick={() => setReloadKey((k) => k + 1)}>Retry</Button>}>
            {loadError}
          </Alert>
        )}
        {!loadError && (!settings || !hours) && (
          <div className="stack" aria-busy="true">
            <div className="card stack"><Skeleton height={22} width="40%" /><Skeleton height={44} /><Skeleton height={44} /></div>
            <div className="card stack"><Skeleton height={22} width="40%" /><Skeleton height={120} /></div>
          </div>
        )}

        {settings && hours && !loadError && (
          <>
            <form className="card stack" style={{ "--gap": "16px" } as React.CSSProperties} onSubmit={saveSettings} aria-labelledby="ordering">
              <h2 id="ordering">Ordering</h2>
              {settingsError && <Alert tone="danger">{settingsError}</Alert>}
              <div className="grid-2">
                <label className="field">
                  <span className="label">Minimum prep time (minutes)</span>
                  <input className="input num" type="number" min={5} max={240} required value={prep} onChange={(e) => setPrep(e.target.value)} />
                  <span className="hint">The earliest a customer can ask for pickup, from now.</span>
                </label>
                <label className="field">
                  <span className="label">Days available for advance orders</span>
                  <input className="input num" type="number" min={0} max={14} required value={advance} onChange={(e) => setAdvance(e.target.value)} />
                  <span className="hint">0 means same day only.</span>
                </label>
                <label className="field">
                  <span className="label">Sales tax (%)</span>
                  <input className="input num" type="number" min={0} max={30} step={0.01} required value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
                  <span className="hint">Charged on the food, not on tips.</span>
                </label>
              </div>
              <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
                <label className="row-between option" style={{ cursor: "pointer" }}>
                  <span><span className="strong">Accept online orders</span><span className="subtle" style={{ display: "block" }}>Turn off to pause ordering, for example when the kitchen is slammed.</span></span>
                  <span className="switch"><input type="checkbox" role="switch" checked={accepting} onChange={(e) => setAccepting(e.target.checked)} /><span /></span>
                </label>
                <label className="row-between option" style={{ cursor: "pointer" }}>
                  <span><span className="strong">Let guests order from their table</span><span className="subtle" style={{ display: "block" }}>Set up tables and print QR codes in <a href="/tables">Tables</a>.</span></span>
                  <span className="switch"><input type="checkbox" role="switch" checked={dineIn} onChange={(e) => setDineIn(e.target.checked)} /><span /></span>
                </label>
                <label className="row-between option" style={{ cursor: "pointer" }}>
                  <span><span className="strong">Let table guests pay at the table</span><span className="subtle" style={{ display: "block" }}>Instead of by card on their phone.</span></span>
                  <span className="switch"><input type="checkbox" role="switch" checked={payLater} onChange={(e) => setPayLater(e.target.checked)} /><span /></span>
                </label>
              </div>
              <div><Button type="submit" variant="primary" loading={saving === "settings"} disabled={saving !== null}>Save ordering settings</Button></div>
            </form>

            <form className="card stack" style={{ "--gap": "14px" } as React.CSSProperties} onSubmit={saveHours} aria-labelledby="weekly">
              <div className="row-between wrap">
                <div>
                  <h2 id="weekly">Weekly hours</h2>
                  <p className="subtle">Customers can only choose pickup times inside these hours, in your time zone.</p>
                </div>
                <span className="subtle">{total} of {MAX_PERIODS} periods</span>
              </div>
              {hoursError && <Alert tone="danger">{hoursError}</Alert>}
              <div className="hours">
                {byDay.map((d) => (
                  <fieldset key={d.weekday} className="hours-day">
                    <legend className="strong">{d.name}</legend>
                    <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
                      {d.periods.length === 0 && <span className="subtle">Closed</span>}
                      {d.periods.map((p, i) => (
                        <div key={p.key} className="row hours-period">
                          <label className="field">
                            <span className="sr-only">{d.name} period {i + 1} opens</span>
                            <input className="input num" type="time" required value={p.opens} onChange={(e) => update(p.key, { opens: e.target.value })} />
                          </label>
                          <span className="subtle" aria-hidden="true">to</span>
                          <label className="field">
                            <span className="sr-only">{d.name} period {i + 1} closes</span>
                            <input className="input num" type="time" required value={p.closes} onChange={(e) => update(p.key, { closes: e.target.value })} />
                          </label>
                          <Button type="button" variant="ghost" size="sm" icon="trash" aria-label={`Remove ${d.name} period ${i + 1}`} disabled={saving !== null} onClick={() => remove(p.key)} />
                        </div>
                      ))}
                      <div>
                        <Button type="button" size="sm" icon="plus" disabled={saving !== null || total >= MAX_PERIODS} onClick={() => add(d.weekday)}>
                          {d.periods.length === 0 ? "Add hours" : "Add another period"}
                        </Button>
                      </div>
                    </div>
                  </fieldset>
                ))}
              </div>
              <div><Button type="submit" variant="primary" loading={saving === "hours"} disabled={saving !== null}>Save weekly hours</Button></div>
            </form>

            <section className="card row-between wrap" aria-labelledby="menu-link">
              <div>
                <h2 id="menu-link">Menu</h2>
                <p className="subtle">Categories, dishes, photos and add-ons are edited in the menu editor.</p>
              </div>
              <a className="btn" href="/menu"><Icon name="list" size={18} /> Open the menu editor</a>
            </section>
          </>
        )}
      </main>
      {toasts}
    </>
  );
}
