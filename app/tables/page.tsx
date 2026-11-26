"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../icons";
import { Alert, Button, Skeleton, StaffTopbar, api, useMe, useToasts } from "../ui";
import { plural } from "@/lib/format";
import { SetupSheet } from "./SetupSheet";
import { TableSheet } from "./TableSheet";
import type { Board, BoardTable } from "./types";

const POLL_MS = 4000;
const TABS = [
  { id: "assigned", label: "Assigned" },
  { id: "priority", label: "Priority" },
  { id: "all", label: "All" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const LEGEND: [string, string][] = [
  ["Available", "var(--surface-3)"],
  ["Browsing", "#1565c0"],
  ["Pending", "#d84315"],
  ["Preparing", "#6a4c93"],
  ["Ready", "#c62828"],
  ["Served", "#2e7d32"],
  ["Bill / service", "#f59e0b"],
  ["Paid", "#14532d"],
];

export default function Tables() {
  const me = useMe();
  const [board, setBoard] = useState<Board | null>(null);
  const [offline, setOffline] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [floor, setFloor] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const lastPriority = useRef(0);
  const { toast, toasts } = useToasts();

  const refresh = useCallback(async () => {
    const r = await api<Board>("/api/staff/tables");
    if (r.ok) {
      setBoard(r.data);
      setOffline(false);
    } else if (r.status === 0 || r.status >= 500) setOffline(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const poll = setInterval(refresh, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const isOwner = board?.me.role === "owner" || me?.role === "owner";
  const mine = board?.me.id;
  const active = useMemo(() => (board?.tables ?? []).filter((t) => t.active), [board]);
  const priorityCount = active.filter((t) => t.priority).length;

  // A short beep when a table newly needs attention, if the waiter turned sound on.
  useEffect(() => {
    document.title = priorityCount ? `(${priorityCount}) Tables · STEOS` : "Tables · STEOS";
    if (soundOn && audio.current && priorityCount > lastPriority.current) {
      const ctx = audio.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
    lastPriority.current = priorityCount;
  }, [priorityCount, soundOn]);

  function toggleSound() {
    if (soundOn) return setSoundOn(false);
    audio.current ??= new AudioContext();
    void audio.current.resume();
    setSoundOn(true);
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return active.filter((t) => {
      if (tab === "assigned" && t.assignedTo?.id !== mine) return false;
      if (tab === "priority" && !t.priority) return false;
      if (floor !== "all" && (floor === "none" ? t.floorId !== null : t.floorId !== floor)) return false;
      if (q && !t.label.toLowerCase().includes(q) && !(t.assignedTo?.name.toLowerCase().includes(q) ?? false)) return false;
      return true;
    });
  }, [active, tab, floor, query, mine]);

  const open = board?.tables.find((t) => t.id === openId) ?? null;
  const unfloored = active.some((t) => t.floorId === null);
  const assignedCount = active.filter((t) => t.assignedTo?.id === mine).length;

  return (
    <>
      <StaffTopbar current="/tables" me={me} />
      <main className="container container-md page stack" style={{ "--gap": "14px" } as React.CSSProperties}>
        <div className="row-between wrap">
          <div>
            <h1>Tables</h1>
            <p className="muted">
              {board ? `${plural(active.length, "table")}${priorityCount ? ` · ${priorityCount} need attention` : ""}` : "Loading…"}
            </p>
          </div>
          <div className="row wrap">
            <span className={`badge ${offline ? "badge-danger" : "badge-success"}`} role="status">
              <span className={`dot ${offline ? "" : "dot-live"}`} />
              {offline ? "Offline" : "Live"}
            </span>
            <Button size="sm" icon={soundOn ? "bell" : "bellOff"} aria-pressed={soundOn} onClick={toggleSound}>
              {soundOn ? "Sound on" : "Sound off"}
            </Button>
            {isOwner && <Button size="sm" icon="table" onClick={() => setSetup(true)}>Set up tables</Button>}
          </div>
        </div>

        {offline && <Alert tone="danger">Connection lost. The board may be out of date. Retrying…</Alert>}

        <div className="input-icon">
          <Icon name="search" size={18} />
          <input className="input" type="search" placeholder="Search tables or waiters" aria-label="Search tables" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <div className="tabs" role="tablist" aria-label="Which tables">
          {TABS.map((t) => (
            <button key={t.id} role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === "priority" && priorityCount > 0 && <span className="tab-dot" aria-label={`${priorityCount} need attention`} />}
              {t.id === "assigned" && assignedCount > 0 && <span className="tab-count">{assignedCount}</span>}
            </button>
          ))}
        </div>

        {(board?.floors.length ?? 0) > 0 && (
          <div className="catnav-inner" style={{ paddingBlock: 0 }} role="group" aria-label="Floor">
            <button className="chip" aria-current={floor === "all"} onClick={() => setFloor("all")}>All</button>
            {board!.floors.map((f) => (
              <button key={f.id} className="chip" aria-current={floor === f.id} onClick={() => setFloor(f.id)}>{f.name}</button>
            ))}
            {unfloored && <button className="chip" aria-current={floor === "none"} onClick={() => setFloor("none")}>No floor</button>}
          </div>
        )}

        {!board && (
          <div className="tiles">
            {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} height={132} style={{ borderRadius: 16 }} />)}
          </div>
        )}

        {board && active.length === 0 && (
          <div className="empty">
            <Icon name="table" size={36} />
            <p className="strong" style={{ color: "var(--text)" }}>No tables yet.</p>
            <p className="small">{isOwner ? "Add your tables, print their QR codes, and guests can order from their seat." : "Ask the owner to set up the tables."}</p>
            {isOwner && <Button variant="primary" style={{ marginTop: 14 }} icon="plus" onClick={() => setSetup(true)}>Set up tables</Button>}
          </div>
        )}

        {board && active.length > 0 && visible.length === 0 && (
          <div className="empty">
            <Icon name={tab === "priority" ? "check" : "search"} size={32} />
            <p>{tab === "priority" ? "Nothing needs attention right now." : tab === "assigned" ? "No tables are assigned to you." : "No tables match."}</p>
          </div>
        )}

        <div className="tiles">
          {visible.map((t) => (
            <TableTile key={t.id} table={t} onOpen={() => setOpenId(t.id)} />
          ))}
        </div>

        {board && active.length > 0 && (
          <div className="legend" aria-label="Colour key">
            {LEGEND.map(([label, color]) => (
              <span key={label} style={{ "--c": color } as React.CSSProperties}><i />{label}</span>
            ))}
          </div>
        )}
      </main>

      {open && board && (
        <TableSheet
          table={open}
          board={board}
          isOwner={!!isOwner}
          myId={mine}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
          toast={toast}
        />
      )}
      {setup && board && <SetupSheet board={board} onClose={() => setSetup(false)} onChanged={refresh} toast={toast} />}
      {toasts}
    </>
  );
}

function TableTile({ table: t, onOpen }: { table: BoardTable; onOpen: () => void }) {
  const first = t.assignedTo?.name.split(/\s+/)[0] ?? "";
  const initial = t.assignedTo ? (t.assignedTo.name.split(/\s+/)[1]?.[0] ? `${first} ${t.assignedTo.name.split(/\s+/)[1][0]}.` : first) : "";
  return (
    <button className={`tile tile-${t.state} ${t.priority ? "priority" : ""}`} onClick={onOpen} aria-label={`Table ${t.label}, ${t.statusLabel}${t.assignedTo ? `, ${t.assignedTo.name}` : ""}`}>
      <span className="tile-top">
        {t.state === "bill" && <Icon className="tile-icon" name={t.statusLabel.includes("Card") ? "card" : "cash"} size={18} />}
        {t.state === "service" && <Icon className="tile-icon" name="bell" size={18} />}
        <span className="tile-num">{t.label}</span>
        <span className="tile-who">{initial || (t.state === "available" ? `${t.seats} seats` : "")}</span>
      </span>
      <span className="tile-status">{t.statusLabel}</span>
    </button>
  );
}
