"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Alert, Button, Skeleton, api } from "../ui";
import { colorProblem, completeMode, deriveDark, type RestaurantBranding } from "@/lib/restaurant-branding";

type Dish = { name: string };
type MenuCategory = { items: Dish[] };

const HEX = /^#[0-9a-fA-F]{6}$/;
const FALLBACK = "#1d4ed8";
const MAX_FEATURED = 8;

/** The owner's editor for how their storefront looks: colors, a tagline, menu search and favorite dishes. */
export function StorefrontLook({ slug, toast }: { slug: string; toast: (message: string) => void }) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [logo, setLogo] = useState<RestaurantBranding["logo"]>(undefined);

  const [custom, setCustom] = useState(false);
  const [color, setColor] = useState(FALLBACK);
  const [darkAuto, setDarkAuto] = useState(true);
  const [colorDark, setColorDark] = useState("#8fb0ff");
  const [tagline, setTagline] = useState("");
  const [search, setSearch] = useState(false);
  const [featured, setFeatured] = useState<string[]>([]);
  const [dishes, setDishes] = useState<string[]>([]);

  const fill = (b: RestaurantBranding, available: string[]) => {
    setLogo(b.logo);
    setCustom(!!b.colors);
    if (b.colors) {
      setColor(b.colors.light.brand);
      setDarkAuto(!b.colors.dark);
      if (b.colors.dark) setColorDark(b.colors.dark.brand);
    }
    setTagline(b.tagline ?? "");
    setSearch(!!b.search);
    setFeatured((b.featured ?? []).filter((name) => available.includes(name)));
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      const [b, m] = await Promise.all([api<RestaurantBranding>("/api/staff/branding"), api<MenuCategory[]>("/api/staff/menu")]);
      if (!live) return;
      if (!b.ok || !m.ok) return setLoadError("Could not load the storefront look");
      const names = [...new Set(m.data.flatMap((c) => c.items.map((i) => i.name)))];
      setDishes(names);
      fill(b.data, names);
      setLoaded(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  const colorsValid = HEX.test(color) && (darkAuto || HEX.test(colorDark));
  const problem = custom && colorsValid ? colorProblem({ color, colorDark: darkAuto ? null : colorDark }) : null;

  // What the two preview panels show: the same worked-out colors the storefront will use.
  const previews = useMemo(() => {
    if (!custom || !HEX.test(color)) return null;
    const light = completeMode({ brand: color }, false);
    const dark = completeMode(darkAuto || !HEX.test(colorDark) ? deriveDark({ brand: color }) : { brand: colorDark }, true);
    return [
      { label: "Light", page: "#ffffff", text: "#1c1917", m: light },
      { label: "Dark", page: "#121212", text: "#f5f5f4", m: dark },
    ];
  }, [custom, color, darkAuto, colorDark]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const r = await api<RestaurantBranding>("/api/staff/branding", {
      method: "PUT",
      json: {
        color: custom ? color : null,
        colorDark: custom && !darkAuto ? colorDark : null,
        tagline: tagline.trim() || null,
        search,
        featured,
      },
    });
    setSaving(false);
    if (r.ok) {
      fill(r.data, dishes); // what the server saved replaces the form
      toast("Storefront look saved");
    } else setError(r.error);
  }

  const toggleDish = (name: string) => setFeatured((f) => (f.includes(name) ? f.filter((n) => n !== name) : f.length < MAX_FEATURED ? [...f, name] : f));

  return (
    <form className="card stack" style={{ "--gap": "16px" } as CSSProperties} onSubmit={save} aria-labelledby="look">
      <div className="row-between wrap">
        <div>
          <h2 id="look">Storefront look</h2>
          <p className="subtle">Your colors, a short line under your name, and favorite dishes on your ordering page.</p>
        </div>
        <a className="btn" href={`/r/${slug}`} target="_blank" rel="noreferrer">View your storefront</a>
      </div>
      {loadError && <Alert tone="danger">{loadError}</Alert>}
      {!loaded && !loadError && <Skeleton height={120} />}
      {loaded && (
        <>
          {error && <Alert tone="danger">{error}</Alert>}
          {problem && <Alert tone="warning">{problem}</Alert>}
          <label className="row-between option" style={{ cursor: "pointer" }}>
            <span><span className="strong">Use my own colors</span><span className="subtle" style={{ display: "block" }}>Off means the standard look.</span></span>
            <span className="switch"><input type="checkbox" role="switch" checked={custom} onChange={(e) => setCustom(e.target.checked)} /><span /></span>
          </label>

          {custom && (
            <div className="stack" style={{ "--gap": "14px" } as CSSProperties}>
              <div className="grid-2">
                <div className="field">
                  <label className="label" htmlFor="brand-color">Brand color</label>
                  <div className="row">
                    <input id="brand-color" className="input" type="color" value={HEX.test(color) ? color : FALLBACK} onChange={(e) => setColor(e.target.value)} style={{ width: 64, padding: 3, height: 42 }} />
                    <input className="input num" aria-label="Brand color code" value={color} maxLength={7} onChange={(e) => setColor(e.target.value)} style={{ maxWidth: 120 }} />
                  </div>
                  <span className="hint">Used for buttons, highlights and links. Pick a color that is easy to read on white.</span>
                </div>
                <div className="field">
                  <span className="label">Dark mode</span>
                  <label className="row" style={{ cursor: "pointer", gap: 8 }}>
                    <input type="checkbox" checked={darkAuto} onChange={(e) => setDarkAuto(e.target.checked)} />
                    <span>Choose it for me</span>
                  </label>
                  {!darkAuto && (
                    <div className="row">
                      <input className="input" type="color" aria-label="Dark mode color" value={HEX.test(colorDark) ? colorDark : "#8fb0ff"} onChange={(e) => setColorDark(e.target.value)} style={{ width: 64, padding: 3, height: 42 }} />
                      <input className="input num" aria-label="Dark mode color code" value={colorDark} maxLength={7} onChange={(e) => setColorDark(e.target.value)} style={{ maxWidth: 120 }} />
                    </div>
                  )}
                  <span className="hint">The lighter version guests with a dark screen see.</span>
                </div>
              </div>
              {previews && (
                <div className="grid-2" aria-label="Preview">
                  {previews.map(({ label, page, text, m }) => (
                    <div key={label} style={{ background: page, color: text, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                      <div style={{ background: m.soft, color: m.softInk, padding: "12px 14px", fontWeight: 800 }}>{label} · Your restaurant</div>
                      <div className="row" style={{ padding: 14, gap: 10, flexWrap: "wrap" }}>
                        <span style={{ background: m.brand, color: m.ink, borderRadius: 999, padding: "6px 14px", fontWeight: 700 }}>Your order</span>
                        <span style={{ color: m.brand, fontWeight: 700 }}>Choose options +</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <label className="field">
            <span className="label">Tagline</span>
            <input className="input" maxLength={120} value={tagline} placeholder="For example: Fresh, made to order." onChange={(e) => setTagline(e.target.value)} />
            <span className="hint">A short line under your name. Leave it empty to show none.</span>
          </label>

          <label className="row-between option" style={{ cursor: "pointer" }}>
            <span><span className="strong">Menu search</span><span className="subtle" style={{ display: "block" }}>Let guests search dishes and ingredients.</span></span>
            <span className="switch"><input type="checkbox" role="switch" checked={search} onChange={(e) => setSearch(e.target.checked)} /><span /></span>
          </label>

          <fieldset className="stack" style={{ "--gap": "8px", border: 0, padding: 0, margin: 0 } as CSSProperties}>
            <legend className="label">Favorite dishes ({featured.length} of {MAX_FEATURED})</legend>
            <span className="hint">Shown at the top of your ordering page. Choose up to {MAX_FEATURED}.</span>
            {dishes.length === 0 && <p className="subtle">Add dishes in the menu editor first.</p>}
            <div className="stack" style={{ "--gap": "4px", maxHeight: 240, overflowY: "auto" } as CSSProperties}>
              {dishes.map((name) => (
                <label key={name} className="row" style={{ gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={featured.includes(name)} disabled={!featured.includes(name) && featured.length >= MAX_FEATURED} onChange={() => toggleDish(name)} />
                  <span>{name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {logo && <p className="subtle">Your logo is set up for you and is kept as it is. To change it, contact support.</p>}
          <div><Button type="submit" variant="primary" loading={saving} disabled={saving || !colorsValid || !!problem}>Save storefront look</Button></div>
        </>
      )}
    </form>
  );
}
