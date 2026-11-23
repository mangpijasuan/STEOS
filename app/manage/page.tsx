"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { HoursPeriod } from "@/lib/hours";

type Settings = { acceptingOrders: boolean; minPrepMinutes: number; maxAdvanceDays: number; taxRateBps: number };

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const text = (data: FormData, key: string) => String(data.get(key) ?? "");
const number = (data: FormData, key: string) => Number(data.get(key));

export default function ManageRestaurant() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hours, setHours] = useState<HoursPeriod[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const me = await fetch("/api/staff/me");
      if (me.status === 401) return window.location.assign("/login");
      if (!me.ok) throw new Error("Could not load your account");
      if ((await me.json()).role !== "owner") throw new Error("Only the restaurant owner can edit these settings.");
      const [settingsResponse, hoursResponse] = await Promise.all([
        fetch("/api/staff/settings"), fetch("/api/staff/hours"),
      ]);
      if (!settingsResponse.ok || !hoursResponse.ok) throw new Error("Could not load ordering hours and settings");
      setSettings(await settingsResponse.json());
      setHours((await hoursResponse.json()).periods);
    })().catch((error: Error) => setError(error.message));
  }, []);

  async function save(url: string, method: string, body?: object) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return false;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.issues?.[0]?.message ?? data.error ?? "Could not save the change");
      }
      if (url === "/api/staff/settings") setSettings(await response.json());
      if (url === "/api/staff/hours") setHours((await response.json()).periods);
      setNotice("Saved.");
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save the change");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function submit(url: string, method: string, read: (data: FormData) => object) {
    return async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (await save(url, method, read(new FormData(form))) && method === "POST") form.reset();
    };
  }

  function remove(url: string, name: string) {
    if (window.confirm(`Remove ${name}?`)) void save(url, "DELETE");
  }

  return <main>
    <p><a href="/dashboard">← Dashboard</a></p>
    <h1>Manage restaurant</h1>
    {error && <p role="alert" style={{ color: "#a00" }}>{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <style>{`main form { display: grid; gap: 0.5rem; margin: 0.75rem 0; }
      main form label { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
      main details { padding-left: 0.75rem; margin: 0.65rem 0; border-left: 1px solid #ddd; }
      main summary { cursor: pointer; }
      main fieldset { min-width: 0; }`}</style>
    {settings && <>
      <section>
        <h2>Ordering settings</h2>
        <form onSubmit={submit("/api/staff/settings", "PATCH", (data) => ({
          minPrepMinutes: number(data, "minPrepMinutes"),
          maxAdvanceDays: number(data, "maxAdvanceDays"),
          taxRateBps: Math.round(number(data, "taxPercent") * 100),
          acceptingOrders: data.has("acceptingOrders"),
        }))}>
          <label>Minimum prep time (minutes) <input name="minPrepMinutes" type="number" min={5} max={240} defaultValue={settings.minPrepMinutes} required /></label>
          <label>Days available for advance orders <input name="maxAdvanceDays" type="number" min={0} max={14} defaultValue={settings.maxAdvanceDays} required /></label>
          <label>Sales tax (%) <input name="taxPercent" type="number" min={0} max={30} step={0.01} defaultValue={settings.taxRateBps / 100} required /></label>
          <label><input name="acceptingOrders" type="checkbox" defaultChecked={settings.acceptingOrders} /> Accept online orders</label>
          <button disabled={busy}>Save ordering settings</button>
        </form>
      </section>
      <section>
        <h2>Weekly hours</h2>
        <form onSubmit={submit("/api/staff/hours", "PUT", () => ({ periods: hours }))}>
          {hours.map((period, index) => <fieldset key={index}>
            <legend>Opening period {index + 1}</legend>
            <label>Day <select value={period.weekday} onChange={(event) =>
              setHours(hours.map((p, i) => i === index ? { ...p, weekday: Number(event.target.value) } : p))}>
              {days.map((day, value) => <option key={day} value={value}>{day}</option>)}
            </select></label>
            <label>Opens <input type="time" required value={period.opens} onChange={(event) =>
              setHours(hours.map((p, i) => i === index ? { ...p, opens: event.target.value } : p))} /></label>
            <label>Closes <input type="time" required value={period.closes} onChange={(event) =>
              setHours(hours.map((p, i) => i === index ? { ...p, closes: event.target.value } : p))} /></label>
            <button type="button" disabled={busy} onClick={() => setHours(hours.filter((_, i) => i !== index))}>Remove period</button>
          </fieldset>)}
          <button type="button" disabled={busy || hours.length >= 28} onClick={() => setHours([...hours, { weekday: 1, opens: "11:00", closes: "21:00" }])}>Add opening period</button>
          <button disabled={busy}>Save weekly hours</button>
        </form>
      </section>
    </>}
    <section>
      <h2>Menu</h2>
      <p>Categories, dishes, photos and add-ons are edited in the <a href="/menu">menu editor</a>.</p>
    </section>
  </main>;
}
