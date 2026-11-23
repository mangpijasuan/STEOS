"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../icons";
import { Alert, Button, Skeleton, StaffTopbar, api, useMe, useToasts } from "../ui";
import { money, plural } from "@/lib/format";
import { CategorySheet, ItemSheet, photoUrl, type Category, type Item } from "./editor";

type Editing = { kind: "item"; item: Item | null; categoryId: string } | { kind: "category"; category: Category | null } | null;

export default function Dashboard() {
  const me = useMe();
  const isOwner = me?.role === "owner";
  const [menu, setMenu] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing>(null);
  const { toast, toasts } = useToasts();

  const load = useCallback(async () => {
    const r = await api<Category[]>("/api/staff/menu");
    if (r.ok) {
      setMenu(r.data);
      setError(null);
    } else setError(r.error);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function toggle(item: Item) {
    const next = !item.available;
    // Update the screen immediately; put it back if the server says no.
    const set = (available: boolean) => setMenu((m) => m && m.map((c) => ({ ...c, items: c.items.map((i) => (i.id === item.id ? { ...i, available } : i)) })));
    set(next);
    setPending((p) => new Set(p).add(item.id));
    const r = await api(`/api/staff/menu/items/${item.id}/availability`, { method: "PATCH", json: { available: next } });
    setPending((p) => {
      const n = new Set(p);
      n.delete(item.id);
      return n;
    });
    if (r.ok) toast(next ? `${item.name} is back in stock` : `${item.name} marked sold out`);
    else {
      set(!next);
      toast(r.error, "danger");
    }
  }

  /** Moves an entry up or down by rewriting sort positions for the entries that changed. */
  async function move<T extends { id: string; sortOrder: number }>(list: T[], index: number, dir: -1 | 1, url: (id: string) => string) {
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    const changed = next.map((entry, position) => ({ entry, position })).filter(({ entry, position }) => entry.sortOrder !== position);
    const results = await Promise.all(changed.map(({ entry, position }) => api(url(entry.id), { method: "PUT", json: { sortOrder: position } })));
    const failed = results.find((r) => !r.ok);
    if (failed && !failed.ok) toast(failed.error, "danger");
    await load();
  }

  const saved = (message: string) => {
    setEditing(null);
    toast(message);
    void load();
  };

  const searching = query.trim().length > 0;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!menu) return null;
    if (!q) return menu;
    return menu.map((c) => ({ ...c, items: c.items.filter((i) => i.name.toLowerCase().includes(q)) })).filter((c) => c.items.length > 0);
  }, [menu, query]);
  const all = menu?.flatMap((c) => c.items) ?? [];
  const soldOut = all.filter((i) => !i.available).length;
  const withPhotos = all.filter((i) => photoUrl(i)).length;

  return (
    <>
      <StaffTopbar current="/menu" me={me} />
      <main className="container container-md page stack" style={{ "--gap": "16px" } as React.CSSProperties}>
        <div className="row-between wrap">
          <div>
            <h1>Menu</h1>
            <p className="muted">{menu ? `${plural(all.length, "item")}${soldOut ? ` · ${soldOut} sold out` : ""}${all.length ? ` · ${withPhotos} with photos` : ""}` : "Loading…"}</p>
          </div>
          <div className="row wrap">
            {isOwner && <Button icon="plus" onClick={() => setEditing({ kind: "category", category: null })}>Category</Button>}
            {isOwner && menu && menu.length > 0 && <Button variant="primary" icon="plus" onClick={() => setEditing({ kind: "item", item: null, categoryId: menu[0].id })}>Add item</Button>}
          </div>
        </div>

        {error && <Alert tone="danger" action={<Button size="sm" onClick={load}>Retry</Button>}>{error}</Alert>}

        <div className="sticky-search">
          <div className="input-icon">
            <Icon name="search" size={18} />
            <input className="input" type="search" placeholder="Search the menu" aria-label="Search the menu" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        {!filtered && (
          <div className="card card-flush">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="menu-row"><Skeleton height={48} width={48} /><Skeleton height={18} width="50%" /></div>
            ))}
          </div>
        )}

        {menu?.length === 0 && (
          <div className="empty">
            <Icon name="store" size={36} />
            <p className="strong" style={{ color: "var(--text)" }}>Your menu is empty.</p>
            <p className="small">{isOwner ? "Start with a category like Mains or Drinks, then add your dishes." : "Ask the owner to add menu items."}</p>
            {isOwner && <Button variant="primary" style={{ marginTop: 14 }} icon="plus" onClick={() => setEditing({ kind: "category", category: null })}>Add your first category</Button>}
          </div>
        )}
        {filtered && filtered.length === 0 && menu && menu.length > 0 && (
          <div className="empty"><Icon name="search" size={32} /><p>No items match “{query}”.</p></div>
        )}

        {filtered?.map((category, ci) => (
          <section key={category.id} aria-labelledby={`c-${category.id}`}>
            <div className="cat-head">
              <h2 id={`c-${category.id}`}>{category.name}</h2>
              {isOwner && !searching && (
                <div className="row-actions">
                  <Button variant="ghost" size="sm" icon="arrowUp" aria-label={`Move ${category.name} up`} disabled={ci === 0} onClick={() => move(menu!, ci, -1, (id) => `/api/staff/menu/categories/${id}`)} />
                  <Button variant="ghost" size="sm" icon="arrowDown" aria-label={`Move ${category.name} down`} disabled={ci === menu!.length - 1} onClick={() => move(menu!, ci, 1, (id) => `/api/staff/menu/categories/${id}`)} />
                  <Button variant="ghost" size="sm" icon="edit" aria-label={`Edit ${category.name}`} onClick={() => setEditing({ kind: "category", category })} />
                  <Button size="sm" icon="plus" onClick={() => setEditing({ kind: "item", item: null, categoryId: category.id })}>Item</Button>
                </div>
              )}
            </div>
            <div className="card card-flush list">
              {category.items.length === 0 && <div className="menu-row subtle">No items yet.</div>}
              {category.items.map((item, ii) => {
                const photo = photoUrl(item);
                return (
                  <div key={item.id} className={`menu-row ${item.available ? "" : "off"}`}>
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="thumb" src={photo} alt="" loading="lazy" />
                    ) : (
                      <span className="thumb" aria-hidden="true"><Icon name="image" size={20} /></span>
                    )}
                    <div className="grow">
                      <div className="menu-row-name">{item.name}</div>
                      <div className="subtle num">
                        {money(item.priceCents)}
                        {item.modifierGroups.length > 0 && ` · ${plural(item.modifierGroups.length, "add-on group")}`}
                      </div>
                    </div>
                    {isOwner && !searching && (
                      <div className="row-actions">
                        <Button variant="ghost" size="sm" icon="arrowUp" aria-label={`Move ${item.name} up`} disabled={ii === 0} onClick={() => move(category.items, ii, -1, (id) => `/api/staff/menu/items/${id}`)} />
                        <Button variant="ghost" size="sm" icon="arrowDown" aria-label={`Move ${item.name} down`} disabled={ii === category.items.length - 1} onClick={() => move(category.items, ii, 1, (id) => `/api/staff/menu/items/${id}`)} />
                      </div>
                    )}
                    <label className="switch" title={item.available ? "Mark sold out" : "Back in stock"}>
                      <input type="checkbox" role="switch" checked={item.available} disabled={pending.has(item.id)} onChange={() => toggle(item)} aria-label={`${item.name} available`} />
                      <span />
                    </label>
                    {isOwner && <Button size="sm" icon="edit" aria-label={`Edit ${item.name}`} onClick={() => setEditing({ kind: "item", item, categoryId: category.id })}>Edit</Button>}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      {editing?.kind === "item" && menu && (
        <ItemSheet key={editing.item?.id ?? "new"} item={editing.item} categories={menu} categoryId={editing.categoryId} onClose={() => setEditing(null)} onSaved={saved} />
      )}
      {editing?.kind === "category" && <CategorySheet category={editing.category} count={menu?.length ?? 0} onClose={() => setEditing(null)} onSaved={saved} />}
      {toasts}
    </>
  );
}
