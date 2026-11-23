"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { HoursPeriod } from "@/lib/hours";

type Category = { id: string; name: string; sortOrder: number; items: Item[] };
type Item = { id: string; categoryId: string; name: string; description: string; priceCents: number; available: boolean; imageUrl: string | null; sortOrder: number; modifierGroups: Group[] };
type Group = { id: string; name: string; minChoices: number; maxChoices: number; sortOrder: number; options: Option[] };
type Option = { id: string; name: string; priceDeltaCents: number; available: boolean; sortOrder: number };
type Settings = { acceptingOrders: boolean; minPrepMinutes: number; maxAdvanceDays: number; taxRateBps: number };

const menuUrl = "/api/staff/menu";
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const text = (data: FormData, key: string) => String(data.get(key) ?? "");
const number = (data: FormData, key: string) => Number(data.get(key));
const named = (data: FormData) => ({ name: text(data, "name"), sortOrder: number(data, "sortOrder") });

function NameFields({ value }: { value?: { name: string; sortOrder: number } }) {
  return <>
    <label>Name <input name="name" defaultValue={value?.name} required /></label>
    <label>Sort order <input name="sortOrder" type="number" min={0} max={10000} defaultValue={value?.sortOrder ?? 0} required /></label>
  </>;
}

function ItemFields({ item, categories, categoryId }: { item?: Item; categories: Category[]; categoryId: string }) {
  return <>
    <NameFields value={item} />
    <label>Category <select name="categoryId" defaultValue={item?.categoryId ?? categoryId}>
      {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
    </select></label>
    <label>Description <input name="description" maxLength={1000} defaultValue={item?.description} /></label>
    <label>Price in cents <input name="priceCents" type="number" min={0} max={1_000_000} defaultValue={item?.priceCents} required /></label>
    <label>Image URL <input name="imageUrl" type="url" maxLength={500} defaultValue={item?.imageUrl ?? ""} /></label>
    <label><input name="available" type="checkbox" defaultChecked={item?.available ?? true} /> Available</label>
  </>;
}

function itemInput(data: FormData) {
  return { ...named(data), categoryId: text(data, "categoryId"), description: text(data, "description"),
    priceCents: number(data, "priceCents"), imageUrl: text(data, "imageUrl") || null, available: data.has("available") };
}

function GroupFields({ group }: { group?: Group }) {
  return <>
    <NameFields value={group} />
    <label>Minimum choices <input name="minChoices" type="number" min={0} max={20} defaultValue={group?.minChoices ?? 0} required /></label>
    <label>Maximum choices <input name="maxChoices" type="number" min={1} max={20} defaultValue={group?.maxChoices ?? 1} required /></label>
  </>;
}

function groupInput(data: FormData) {
  return { ...named(data), minChoices: number(data, "minChoices"), maxChoices: number(data, "maxChoices") };
}

function OptionFields({ option }: { option?: Option }) {
  return <>
    <NameFields value={option} />
    <label>Extra price in cents <input name="priceDeltaCents" type="number" min={0} max={100_000} defaultValue={option?.priceDeltaCents ?? 0} required /></label>
    <label><input name="available" type="checkbox" defaultChecked={option?.available ?? true} /> Available</label>
  </>;
}

function optionInput(data: FormData) {
  return { ...named(data), priceDeltaCents: number(data, "priceDeltaCents"), available: data.has("available") };
}

export default function ManageRestaurant() {
  const [menu, setMenu] = useState<Category[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hours, setHours] = useState<HoursPeriod[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadMenu = useCallback(async () => {
    const res = await fetch(menuUrl);
    if (!res.ok) throw new Error("Could not load the menu");
    setMenu(await res.json());
  }, []);

  useEffect(() => {
    void (async () => {
      const me = await fetch("/api/staff/me");
      if (me.status === 401) return window.location.assign("/login");
      if (!me.ok) throw new Error("Could not load your account");
      if ((await me.json()).role !== "owner") throw new Error("Only the restaurant owner can edit these settings.");
      const [settingsResponse, hoursResponse] = await Promise.all([
        fetch("/api/staff/settings"), fetch("/api/staff/hours"), loadMenu(),
      ]);
      if (!settingsResponse.ok || !hoursResponse.ok) throw new Error("Could not load ordering hours and settings");
      setSettings(await settingsResponse.json());
      setHours((await hoursResponse.json()).periods);
    })().catch((error: Error) => setError(error.message));
  }, [loadMenu]);

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
      if (url.startsWith(menuUrl)) await loadMenu();
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
    {menu && <section>
      <h2>Menu</h2>
      <details>
        <summary>Add category</summary>
        <form onSubmit={submit(`${menuUrl}/categories`, "POST", named)}>
          <NameFields /><button disabled={busy}>Add category</button>
        </form>
      </details>
      {menu.map((category) => <details key={category.id}>
        <summary>{category.name}</summary>
        <form onSubmit={submit(`${menuUrl}/categories/${category.id}`, "PUT", named)}>
          <NameFields value={category} /><button disabled={busy}>Save category</button>
        </form>
        <button disabled={busy} onClick={() => remove(`${menuUrl}/categories/${category.id}`, category.name)}>Remove category</button>
        <details>
          <summary>Add item</summary>
          <form onSubmit={submit(`${menuUrl}/items`, "POST", itemInput)}>
            <ItemFields categories={menu} categoryId={category.id} /><button disabled={busy}>Add item</button>
          </form>
        </details>
        {category.items.map((item) => <details key={item.id}>
          <summary>{item.name}</summary>
          <form onSubmit={submit(`${menuUrl}/items/${item.id}`, "PUT", itemInput)}>
            <ItemFields item={item} categories={menu} categoryId={category.id} /><button disabled={busy}>Save item</button>
          </form>
          <button disabled={busy} onClick={() => remove(`${menuUrl}/items/${item.id}`, item.name)}>Remove item</button>
          <details>
            <summary>Add modifier group</summary>
            <form onSubmit={submit(`${menuUrl}/items/${item.id}/modifier-groups`, "POST", groupInput)}>
              <GroupFields /><button disabled={busy}>Add modifier group</button>
            </form>
          </details>
          {item.modifierGroups.map((group) => {
            const groupUrl = `${menuUrl}/modifier-groups/${group.id}`;
            return <details key={group.id}>
              <summary>{group.name}</summary>
              <form onSubmit={submit(groupUrl, "PUT", groupInput)}>
                <GroupFields group={group} /><button disabled={busy}>Save modifier group</button>
              </form>
              <button disabled={busy} onClick={() => remove(groupUrl, group.name)}>Remove modifier group</button>
              <details>
                <summary>Add option</summary>
                <form onSubmit={submit(`${groupUrl}/options`, "POST", optionInput)}>
                  <OptionFields /><button disabled={busy}>Add option</button>
                </form>
              </details>
              {group.options.map((option) => {
                const optionUrl = `${menuUrl}/modifier-options/${option.id}`;
                return <details key={option.id}>
                  <summary>{option.name}</summary>
                  <form onSubmit={submit(optionUrl, "PUT", optionInput)}>
                    <OptionFields option={option} /><button disabled={busy}>Save option</button>
                  </form>
                  <button disabled={busy} onClick={() => remove(optionUrl, option.name)}>Remove option</button>
                </details>;
              })}
            </details>;
          })}
        </details>)}
      </details>)}
    </section>}
  </main>;
}
