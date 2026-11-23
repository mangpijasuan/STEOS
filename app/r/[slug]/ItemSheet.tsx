"use client";

import { useRef, useState } from "react";
import { Button, Sheet, Stepper } from "../../ui";
import { money } from "@/lib/format";

export type Option = { id: string; name: string; priceDeltaCents: number; available: boolean };
export type Group = { id: string; name: string; minChoices: number; maxChoices: number; options: Option[] };
export type Item = { id: string; name: string; description: string; priceCents: number; available: boolean; imageUrl?: string | null; modifierGroups: Group[] };
export type CartLine = { key: string; itemId: string; quantity: number; optionIds: string[]; note: string };

/** Choose add-ons, quantity and a note for one dish. Used by the storefront and by the staff till. */
export function ItemSheet({ item, onAdd, onClose }: { item: Item; onAdd: (line: Omit<CartLine, "key">) => void; onClose: () => void }) {
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const firstProblem = useRef<HTMLFieldSetElement>(null);

  const problems = new Map(
    item.modifierGroups
      .map((g) => {
        const count = g.options.filter((o) => chosen.has(o.id)).length;
        return [g.id, count < g.minChoices ? `Choose ${g.minChoices === 1 ? "one" : `at least ${g.minChoices}`}` : null] as const;
      })
      .filter(([, p]) => p !== null) as [string, string][],
  );

  function toggle(group: Group, option: Option) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(option.id)) {
        next.delete(option.id);
      } else {
        if (group.maxChoices === 1) group.options.forEach((o) => next.delete(o.id));
        const count = group.options.filter((o) => next.has(o.id)).length;
        if (count < group.maxChoices) next.add(option.id);
      }
      return next;
    });
  }

  const extra = item.modifierGroups.flatMap((g) => g.options).filter((o) => chosen.has(o.id)).reduce((s, o) => s + o.priceDeltaCents, 0);

  function submit() {
    if (problems.size) {
      setTried(true);
      firstProblem.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onAdd({ itemId: item.id, quantity, optionIds: [...chosen], note: note.trim() });
  }

  const firstProblemId = item.modifierGroups.find((g) => problems.has(g.id))?.id;
  return (
    <Sheet
      title={item.name}
      subtitle={item.description || undefined}
      onClose={onClose}
      hero={
        item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" />
        ) : undefined
      }
      footer={
        <div className="row">
          <Stepper value={quantity} onChange={setQuantity} label="Quantity" />
          <Button variant="primary" size="lg" className="grow" onClick={submit}>
            Add to order · {money((item.priceCents + extra) * quantity)}
          </Button>
        </div>
      }
    >
      <div className="stack" style={{ "--gap": "20px" } as React.CSSProperties}>
        {item.modifierGroups.map((group) => {
          const problem = problems.get(group.id);
          return (
            <fieldset key={group.id} ref={group.id === firstProblemId ? firstProblem : undefined} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
              <legend className="row-between" style={{ width: "100%", marginBottom: 8 }}>
                <span className="strong">{group.name}</span>
                <span className={`badge ${group.minChoices > 0 ? (tried && problem ? "badge-danger" : "badge-brand") : ""}`}>
                  {group.minChoices > 0 ? "Required" : group.maxChoices > 1 ? `Up to ${group.maxChoices}` : "Optional"}
                </span>
              </legend>
              {group.options.map((option) => (
                <label key={option.id} className="option">
                  <input
                    type={group.maxChoices === 1 ? "radio" : "checkbox"}
                    name={group.id}
                    disabled={!option.available}
                    checked={chosen.has(option.id)}
                    onChange={() => toggle(group, option)}
                  />
                  <span className="grow">{option.name}{!option.available && " · sold out"}</span>
                  {option.priceDeltaCents > 0 && <span className="muted num">+{money(option.priceDeltaCents)}</span>}
                </label>
              ))}
              {tried && problem && <span className="error-text">{problem}</span>}
            </fieldset>
          );
        })}
        <label className="field">
          <span className="label">Special instructions</span>
          <textarea className="textarea" value={note} maxLength={200} rows={2} placeholder="Allergies, no onions, extra spicy…" onChange={(e) => setNote(e.target.value)} />
          <span className="hint">{note.length}/200</span>
        </label>
      </div>
    </Sheet>
  );
}
