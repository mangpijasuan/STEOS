"use client";

// Owner tools for the menu: photo upload, item and add-on editing, category editing.
// Every change goes through the same API the rest of the app uses; nothing is saved until Save is pressed.

import { useRef, useState } from "react";
import { Icon } from "../icons";
import { Alert, Button, Sheet, api } from "../ui";

export type Option = { id: string; name: string; priceDeltaCents: number; available: boolean };
export type Group = { id: string; name: string; minChoices: number; maxChoices: number; options: Option[] };
export type Item = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  available: boolean;
  imageUrl: string | null;
  imageId: string | null;
  sortOrder: number;
  modifierGroups: Group[];
};
export type Category = { id: string; name: string; sortOrder: number; items: Item[] };

export const photoUrl = (item: Pick<Item, "imageId" | "imageUrl">) => (item.imageId ? `/api/images/${item.imageId}` : item.imageUrl);

/** "12.5" or "$12.50" to cents, or null when it is not a usable price. */
export function toCents(text: string): number | null {
  const n = Number(text.replace(/[$,\s]/g, ""));
  return text.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 10000 ? Math.round(n * 100) : null;
}
const toDollars = (cents: number) => (cents / 100).toFixed(2);

/** Shrinks a photo in the browser (max 1200px, JPEG) so uploads are small and fast, even from a phone camera. */
async function shrink(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("That photo format isn't supported. Try a JPEG or PNG.");
  }
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // PNGs with transparency get a white background instead of black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("Could not prepare that photo. Try another one.");
  return blob;
}

// ------------------------------------------------------------- item sheet
type DraftOption = { key: string; name: string; price: string; available: boolean };
type DraftGroup = { key: string; name: string; min: string; max: string; options: DraftOption[] };

const draftFrom = (g: Group): DraftGroup => ({
  key: g.id,
  name: g.name,
  min: String(g.minChoices),
  max: String(g.maxChoices),
  options: g.options.map((o) => ({ key: o.id, name: o.name, price: o.priceDeltaCents ? toDollars(o.priceDeltaCents) : "", available: o.available })),
});
const newKey = () => crypto.randomUUID();

export function ItemSheet({
  item,
  categories,
  categoryId,
  onClose,
  onSaved,
}: {
  item: Item | null; // null = a new item
  categories: Category[];
  categoryId: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [price, setPrice] = useState(item ? toDollars(item.priceCents) : "");
  const [category, setCategory] = useState(item?.categoryId ?? categoryId);
  const [available, setAvailable] = useState(item?.available ?? true);
  const [imageId, setImageId] = useState<string | null>(item?.imageId ?? null);
  const [preview, setPreview] = useState<string | null>(item ? photoUrl(item) : null);
  const [groups, setGroups] = useState<DraftGroup[]>((item?.modifierGroups ?? []).map(draftFrom));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const draftItemId = useRef<string | null>(null);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const blob = await shrink(file);
      const res = await api<{ id: string; url: string }>("/api/staff/images", { method: "POST", body: blob, headers: { "Content-Type": "image/jpeg" } });
      if (!res.ok) throw new Error(res.error);
      setImageId(res.data.id);
      setPreview(res.data.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const cents = toCents(price);
  const groupProblems = groups.map((g) => {
    if (!g.name.trim()) return "Name this group (for example, Size)";
    const min = Number(g.min);
    const max = Number(g.max);
    if (!g.min || !g.max || !Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || max > 20 || min > max) {
      return "Enter a minimum and maximum between 0 and 20, with a maximum of at least 1";
    }
    if (!g.options.some((o) => o.name.trim())) return "Add at least one option";
    if (g.options.some((o) => o.price.trim() && (toCents(o.price) ?? Infinity) > 100_000)) return "Check the option prices";
    return null;
  });
  const problems = {
    name: !name.trim() ? "Enter a name" : null,
    price: cents === null ? "Enter a price like 12.50" : null,
  };
  const invalid = !!problems.name || !!problems.price || groupProblems.some(Boolean);

  async function save() {
    setTried(true);
    if (invalid) return;
    setSaving(true);
    setError(null);
    draftItemId.current ??= item?.id ?? newKey();
    const saved = await api<Item>(`/api/staff/menu/items/${draftItemId.current}/editor`, {
      method: "PUT",
      json: {
        createIfMissing: !item,
        item: {
          name: name.trim(),
          description: description.trim(),
          priceCents: cents,
          categoryId: category,
          available,
          imageId,
          imageUrl: imageId ? undefined : preview,
          sortOrder: item ? undefined : categories.find((c) => c.id === category)?.items.length ?? 0,
        },
        groups: groups.map((group) => ({
          id: group.key,
          name: group.name.trim(),
          minChoices: Number(group.min),
          maxChoices: Number(group.max),
          options: group.options.filter((option) => option.name.trim()).map((option) => ({
            id: option.key,
            name: option.name.trim(),
            priceDeltaCents: toCents(option.price.trim() || "0"),
            available: option.available,
          })),
        })),
      },
    });
    setSaving(false);
    if (!saved.ok) return setError(saved.error);
    onSaved(item ? `Saved ${name.trim()}` : `Added ${name.trim()}`);
  }

  async function remove() {
    if (!item) return;
    setSaving(true);
    const res = await api(`/api/staff/menu/items/${item.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    onSaved(`Deleted ${item.name}`);
  }

  const setGroup = (key: string, patch: Partial<DraftGroup>) => setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  const setOption = (gk: string, ok: string, patch: Partial<DraftOption>) =>
    setGroups((gs) => gs.map((g) => (g.key === gk ? { ...g, options: g.options.map((o) => (o.key === ok ? { ...o, ...patch } : o)) } : g)));

  return (
    <Sheet
      title={item ? "Edit item" : "New item"}
      onClose={onClose}
      footer={
        <div className="row">
          {item && (
            <Button variant={confirmDelete ? "danger" : "soft-danger"} icon="trash" loading={saving && confirmDelete} disabled={saving} aria-label="Delete item" onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}>
              {confirmDelete ? "Delete?" : undefined}
            </Button>
          )}
          <Button variant="primary" size="lg" className="grow" loading={saving && !confirmDelete} disabled={saving || uploading} onClick={save}>
            {item ? "Save changes" : "Add to menu"}
          </Button>
        </div>
      }
    >
      <div className="stack" style={{ "--gap": "18px" } as React.CSSProperties}>
        {error && <Alert tone="danger">{error}</Alert>}

        <div className={`photo-field ${preview ? "has" : ""}`}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" />
          ) : (
            <button type="button" className="photo-empty" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => fileInput.current?.click()} disabled={uploading}>
              <Icon name="camera" size={28} />
              <span>{uploading ? "Uploading…" : "Add a photo"}</span>
              <span className="subtle">Dishes with photos sell better</span>
            </button>
          )}
          {preview && (
            <div className="photo-actions">
              <Button size="sm" icon="camera" loading={uploading} onClick={() => fileInput.current?.click()}>Replace</Button>
              <Button size="sm" variant="soft-danger" icon="trash" aria-label="Remove photo" disabled={uploading} onClick={() => { setImageId(null); setPreview(null); }} />
            </div>
          )}
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
        </div>

        <label className="field">
          <span className="label">Name</span>
          <input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-invalid={tried && !!problems.name} autoFocus={!item} />
          {tried && problems.name && <span className="error-text">{problems.name}</span>}
        </label>
        <label className="field">
          <span className="label">Description</span>
          <textarea className="textarea" rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ingredients, size, what makes it good" />
        </label>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <label className="field grow">
            <span className="label">Price</span>
            <span className="price-input">
              <input className="input num" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" aria-invalid={tried && !!problems.price} />
            </span>
            {tried && problems.price && <span className="error-text">{problems.price}</span>}
          </label>
          <label className="field grow">
            <span className="label">Category</span>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <label className="row-between option" style={{ cursor: "pointer" }}>
          <span><span className="strong">Available to order</span><span className="subtle" style={{ display: "block" }}>Turn off when you run out</span></span>
          <span className="switch"><input type="checkbox" role="switch" checked={available} onChange={(e) => setAvailable(e.target.checked)} /><span /></span>
        </label>

        <section className="stack" aria-labelledby="addons-h">
          <div className="row-between">
            <div>
              <h3 id="addons-h">Add-ons and choices</h3>
              <p className="subtle">Sizes, extras, spice level, and so on.</p>
            </div>
            <Button size="sm" icon="plus" onClick={() => setGroups((g) => [...g, { key: newKey(), name: "", min: "0", max: "1", options: [{ key: newKey(), name: "", price: "", available: true }] }])}>Add group</Button>
          </div>
          {groups.map((g, gi) => (
            <div key={g.key} className="addon-card">
              <div className="row">
                <input className="input grow" placeholder="Group name, e.g. Size" value={g.name} maxLength={80} onChange={(e) => setGroup(g.key, { name: e.target.value })} aria-label="Group name" aria-invalid={tried && !!groupProblems[gi]} />
                <Button variant="ghost" size="sm" icon="trash" aria-label="Remove group" onClick={() => setGroups((gs) => gs.filter((x) => x.key !== g.key))} />
              </div>
              <div className="row wrap">
                <label className="field grow">
                  <span className="label">Minimum choices</span>
                  <input className="input num" type="number" min={0} max={20} step={1} value={g.min} onChange={(e) => setGroup(g.key, { min: e.target.value })} />
                </label>
                <label className="field grow">
                  <span className="label">Maximum choices</span>
                  <input className="input num" type="number" min={1} max={20} step={1} value={g.max} onChange={(e) => setGroup(g.key, { max: e.target.value })} />
                </label>
              </div>
              <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
                {g.options.map((o) => (
                  <div key={o.key} className="opt-row">
                    <input className="input" placeholder="Option, e.g. Large" value={o.name} maxLength={80} onChange={(e) => setOption(g.key, o.key, { name: e.target.value })} aria-label="Option name" />
                    <span className="price-input"><input className="input num" inputMode="decimal" placeholder="+0.00" value={o.price} onChange={(e) => setOption(g.key, o.key, { price: e.target.value })} aria-label="Extra price" /></span>
                    <label className="switch" title={o.available ? "In stock" : "Out of stock"}>
                      <input type="checkbox" role="switch" checked={o.available} onChange={(e) => setOption(g.key, o.key, { available: e.target.checked })} aria-label={`${o.name || "Option"} in stock`} />
                      <span />
                    </label>
                    <Button variant="ghost" size="sm" icon="x" aria-label="Remove option" disabled={g.options.length === 1} onClick={() => setGroup(g.key, { options: g.options.filter((x) => x.key !== o.key) })} />
                  </div>
                ))}
                <Button size="sm" icon="plus" onClick={() => setGroup(g.key, { options: [...g.options, { key: newKey(), name: "", price: "", available: true }] })}>Add option</Button>
              </div>
              {tried && groupProblems[gi] && <span className="error-text">{groupProblems[gi]}</span>}
            </div>
          ))}
        </section>
      </div>
    </Sheet>
  );
}

// --------------------------------------------------------- category sheet
export function CategorySheet({ category, count, onClose, onSaved }: { category: Category | null; count: number; onClose: () => void; onSaved: (message: string) => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    if (!name.trim()) return setError("Enter a name");
    setSaving(true);
    setError(null);
    const res = category
      ? await api(`/api/staff/menu/categories/${category.id}`, { method: "PUT", json: { name: name.trim() } })
      : await api("/api/staff/menu/categories", { method: "POST", json: { name: name.trim(), sortOrder: count } });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    onSaved(category ? "Category renamed" : `Added ${name.trim()}`);
  }

  async function remove() {
    if (!category) return;
    setSaving(true);
    const res = await api(`/api/staff/menu/categories/${category.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    onSaved(`Deleted ${category.name}`);
  }

  return (
    <Sheet
      title={category ? "Edit category" : "New category"}
      onClose={onClose}
      footer={
        <div className="row">
          {category && (
            <Button variant={confirmDelete ? "danger" : "soft-danger"} icon="trash" disabled={saving} aria-label="Delete category" onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}>
              {confirmDelete ? "Delete?" : undefined}
            </Button>
          )}
          <Button variant="primary" size="lg" className="grow" loading={saving && !confirmDelete} onClick={save}>{category ? "Save" : "Add category"}</Button>
        </div>
      }
    >
      <div className="stack">
        {error && <Alert tone="danger">{error}</Alert>}
        <label className="field">
          <span className="label">Name</span>
          <input className="input" autoFocus value={name} maxLength={80} placeholder="Mains, Drinks, Desserts…" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        </label>
        {category && category.items.length > 0 && <p className="subtle">A category can only be deleted once it has no items. Move or delete its {category.items.length} item{category.items.length === 1 ? "" : "s"} first.</p>}
      </div>
    </Sheet>
  );
}
