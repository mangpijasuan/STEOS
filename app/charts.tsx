"use client";

// Small, dependency-free charts. Both come with a plain-text summary for screen readers; the pages that use
// them also offer the same numbers as a table.

import { useId, useMemo, useRef, useState } from "react";

export type Point = { label: string; value: number; detail?: string };

/** Rounds a maximum up to a tidy axis value: 1, 2, 5 or 10 times a power of ten. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** One line over time, with a hover crosshair and tooltip. A single series, so no legend: the card title names it. */
export function AreaChart({ data, format, summary }: { data: Point[]; format: (v: number) => string; summary: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => niceMax(Math.max(0, ...data.map((d) => d.value))), [data]);
  const n = data.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / max) * 100;
  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(d.value).toFixed(2)}`).join(" ");
  const area = n > 1 ? `${line} L100,100 L0,100 Z` : "";

  function at(clientX: number) {
    const box = ref.current?.getBoundingClientRect();
    if (!box || n === 0) return;
    const frac = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    setHover(n === 1 ? 0 : Math.round(frac * (n - 1)));
  }
  const active = hover !== null ? data[hover] : null;

  return (
    <div className="chart">
      <div className="chart-y" aria-hidden="true">
        <span>{format(max)}</span>
        <span>{format(max / 2)}</span>
        <span>{format(0)}</span>
      </div>
      <div
        ref={ref}
        className="chart-plot"
        role="img"
        aria-label={summary}
        tabIndex={0}
        onMouseMove={(e) => at(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchMove={(e) => at(e.touches[0].clientX)}
        onTouchEnd={() => setHover(null)}
        onFocus={() => setHover((h) => h ?? n - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n - 1) - 1));
          if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? 0) + 1));
        }}
      >
        <div className="chart-grid" aria-hidden="true"><i /><i /><i /></div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {area && <path className="chart-area" d={area} />}
          <path className="chart-line" d={line} />
        </svg>
        {active && hover !== null && (
          <>
            <div className="chart-cross" style={{ left: `${x(hover)}%` }} />
            <div className="chart-dot" style={{ left: `${x(hover)}%`, top: `${y(active.value)}%` }} />
            <div className="chart-tip" style={{ left: `${Math.min(88, Math.max(12, x(hover)))}%`, top: `${y(active.value)}%` }}>
              {format(active.value)}
              <small>{active.label}{active.detail ? ` · ${active.detail}` : ""}</small>
            </div>
          </>
        )}
      </div>
      <div className="chart-x" aria-hidden="true">
        <span>{data[0]?.label}</span>
        {n > 2 && <span>{data[Math.floor((n - 1) / 2)].label}</span>}
        {n > 1 && <span>{data[n - 1].label}</span>}
      </div>
    </div>
  );
}

export type Slice = { name: string; value: number; color: string };

/**
 * A part-to-whole ring for up to five parts. Each part has a gap of surface colour around it, and every part is
 * named in the list beside it with its value and share, so colour is never the only way to tell them apart.
 */
export function Donut({ slices, format, centerLabel }: { slices: Slice[]; format: (v: number) => string; centerLabel: string }) {
  const [active, setActive] = useState<number | null>(null);
  const id = useId();
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 42;
  const C = 2 * Math.PI * R;
  const GAP = 2;
  let offset = 0;
  const arcs = slices.map((s) => {
    const len = total ? (s.value / total) * C : 0;
    const arc = { ...s, dash: Math.max(0, len - (slices.length > 1 ? GAP : 0)), offset };
    offset += len;
    return arc;
  });
  const top = active !== null ? slices[active] : slices[0];
  const share = (v: number) => (total ? Math.round((v / total) * 100) : 0);

  return (
    <div className="donut-host">
    <div className={`donut-wrap ${active !== null ? "has-active" : ""}`}>
      <div className="donut">
        <svg viewBox="0 0 100 100" role="img" aria-label={`${centerLabel}: ${slices.map((s) => `${s.name} ${share(s.value)}%`).join(", ")}`}>
          {total === 0 && <circle cx="50" cy="50" r={R} className="donut-seg" style={{ stroke: "var(--surface-3)" }} />}
          {arcs.map((a, i) => (
            <circle key={`${id}-${a.name}`} cx="50" cy="50" r={R} className={`donut-seg ${active === i ? "on" : ""}`} style={{ stroke: a.color }} strokeDasharray={`${a.dash} ${C - a.dash}`} strokeDashoffset={-a.offset} />
          ))}
        </svg>
        <div className="donut-center">
          <strong>{top ? `${share(top.value)}%` : "—"}</strong>
          <span>{top ? top.name : centerLabel}</span>
        </div>
      </div>
      <div className="legend-list">
        {slices.map((s, i) => (
          <button key={s.name} type="button" className={`legend-row ${active === i ? "on" : ""}`} style={{ "--c": s.color } as React.CSSProperties} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}>
            <i />
            <span>{s.name}</span>
            <span>{format(s.value)}</span>
            <span className="pct">{share(s.value)}%</span>
          </button>
        ))}
      </div>
    </div>
    </div>
  );
}
