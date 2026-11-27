"use client";

import { useState } from "react";
import type { CartLine, Item } from "../../r/[slug]/ItemSheet";
import { Button, Stepper } from "../../ui";
import { money } from "@/lib/format";

/** Edits only an unsent ticket line; the server still prices and validates the resulting ticket. */
export function LineEditor({ item, line, onSave, onCancel }: { item: Item; line: CartLine; onSave: (line: CartLine) => void; onCancel: () => void }) {
  const [quantity, setQuantity] = useState(line.quantity);
  const [note, setNote] = useState(line.note);
  const [chosen, setChosen] = useState(() => new Set(item.modifierGroups.flatMap(g => g.options.filter(o => o.available && line.optionIds.includes(o.id)).map(o => o.id))));
  const valid = item.available && item.modifierGroups.every(g => {
    const count = g.options.filter(o => o.available && chosen.has(o.id)).length;
    return count >= g.minChoices && count <= g.maxChoices;
  });
  return <form className="terminal-line-editor stack" aria-label={`Edit ${item.name}`} onSubmit={e => { e.preventDefault(); if (valid) onSave({ ...line, quantity, note: note.trim(), optionIds: [...chosen] }); }}>
    <Stepper size="sm" value={quantity} label={`Editing quantity of ${item.name}`} onChange={setQuantity} />
    {item.modifierGroups.map(g => <fieldset key={g.id}>
      <legend>{g.name} <small>({g.minChoices}–{g.maxChoices} choices)</small></legend>
      {g.options.map(o => <label key={o.id} className="terminal-option"><input type="checkbox" disabled={!o.available} checked={chosen.has(o.id)} onChange={() => setChosen(prev => {
        const next = new Set(prev);
        if (next.has(o.id)) next.delete(o.id);
        else { if (g.maxChoices === 1) g.options.forEach(v => next.delete(v.id)); if (g.options.filter(v => next.has(v.id)).length < g.maxChoices) next.add(o.id); }
        return next;
      })} /><span>{o.name}{!o.available && " · sold out"}</span>{o.priceDeltaCents !== 0 && <small>{money(o.priceDeltaCents)}</small>}</label>)}
    </fieldset>)}
    <label className="field"><span className="label">Special instructions</span><textarea className="textarea" rows={2} maxLength={200} value={note} onChange={e => setNote(e.target.value)} /></label>
    {!valid && <p role="status" className="hint">Select the required available choices before saving.</p>}
    <div className="row"><Button type="button" size="sm" onClick={onCancel}>Cancel</Button><Button type="submit" size="sm" variant="primary" disabled={!valid}>Save changes</Button></div>
  </form>;
}
