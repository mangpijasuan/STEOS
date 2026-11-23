"use client";

import QRCode from "qrcode";
import { use, useEffect, useMemo, useState } from "react";
import { Alert, Button, StaffTopbar, api, useMe } from "../../ui";
import { Icon } from "../../icons";
import { plural } from "@/lib/format";
import type { Board } from "../types";

/** Printable cards, one per table. Each QR code opens that table's ordering page. */
export default function QrPage({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  const { table: onlyTable } = use(searchParams);
  const me = useMe();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [floor, setFloor] = useState("all");
  const [svgs, setSvgs] = useState<Record<string, string>>({});
  const [restaurant, setRestaurant] = useState("");

  useEffect(() => {
    void (async () => {
      const r = await api<Board>("/api/staff/tables");
      if (!r.ok) return setError(r.error);
      setBoard(r.data);
      const s = await api<{ name: string }>("/api/staff/settings");
      if (s.ok) setRestaurant(s.data.name);
    })();
  }, []);

  const tables = useMemo(() => {
    const list = (board?.tables ?? []).filter((t) => t.active && t.qrToken);
    if (onlyTable) return list.filter((t) => t.id === onlyTable);
    return floor === "all" ? list : list.filter((t) => (floor === "none" ? t.floorId === null : t.floorId === floor));
  }, [board, floor, onlyTable]);

  // The QR code holds this site's address plus the table's secret, so it works on whatever domain you are using.
  const urlFor = (token: string) => `${window.location.origin}/t/${token}`;

  useEffect(() => {
    let live = true;
    void (async () => {
      const entries = await Promise.all(
        tables.map(async (t) => [t.qrToken!, await QRCode.toString(urlFor(t.qrToken!), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1c1917", light: "#ffffff" } })] as const),
      );
      if (live) setSvgs(Object.fromEntries(entries));
    })();
    return () => {
      live = false;
    };
  }, [tables]);

  return (
    <>
      <StaffTopbar current="/tables" me={me} />
      <main className="container container-md page stack" style={{ "--gap": "16px" } as React.CSSProperties}>
        <div className="row-between wrap no-print">
          <div>
            <a href="/tables" className="small"><Icon name="arrowLeft" size={14} /> Tables</a>
            <h1>QR codes</h1>
            <p className="muted">{board ? `${plural(tables.length, "card")} ready to print` : "Loading…"}</p>
          </div>
          <Button variant="primary" icon="printer" disabled={tables.length === 0} onClick={() => window.print()}>Print</Button>
        </div>

        {error && <Alert tone="danger">{error === "Not allowed for your role" ? "Only the owner can print QR codes." : error}</Alert>}

        {!onlyTable && (board?.floors.length ?? 0) > 0 && (
          <div className="catnav-inner no-print" style={{ paddingBlock: 0 }} role="group" aria-label="Floor">
            <button className="chip" aria-current={floor === "all"} onClick={() => setFloor("all")}>All floors</button>
            {board!.floors.map((f) => <button key={f.id} className="chip" aria-current={floor === f.id} onClick={() => setFloor(f.id)}>{f.name}</button>)}
          </div>
        )}

        {board && tables.length === 0 && !error && (
          <div className="empty no-print"><Icon name="qr" size={32} /><p>No tables to print yet. Add tables first.</p></div>
        )}

        <div className="qr-grid">
          {tables.map((t) => (
            <article key={t.id} className="qr-card" aria-label={`QR code for table ${t.label}`}>
              <div className="qr-name">{restaurant}</div>
              <div className="qr-table">Table {t.label}</div>
              {svgs[t.qrToken!] ? <div dangerouslySetInnerHTML={{ __html: svgs[t.qrToken!] }} role="img" aria-label={`QR code for table ${t.label}`} /> : <div style={{ height: 190 }} />}
              <div className="qr-hint">Scan to see the menu, order and pay from your seat</div>
            </article>
          ))}
        </div>
      </main>
    </>
  );
}
