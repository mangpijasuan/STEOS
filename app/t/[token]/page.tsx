"use client";

import { use, useEffect, useState } from "react";
import Storefront, { type TableContext } from "../../r/[slug]/Storefront";

type Resolved = {
  table: { label: string; floorName: string | null };
  restaurant: { name: string; slug: string };
  dineInEnabled: boolean;
  payLaterEnabled: boolean;
};

/** Where a table's QR code leads: the restaurant's menu, in table-ordering mode. */
export default function TablePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [info, setInfo] = useState<Resolved | null>(null);
  const [problem, setProblem] = useState<"invalid" | "network" | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch(`/api/t/${token}`, { cache: "no-store" }).catch(() => null);
      if (!live) return;
      if (!res) return setProblem("network");
      if (!res.ok) return setProblem("invalid");
      setProblem(null);
      setInfo(await res.json());
    })();
    return () => {
      live = false;
    };
  }, [token, attempt]);

  if (problem) {
    return (
      <main>
        <h1>{problem === "network" ? "No connection" : "This table code isn't valid"}</h1>
        <p role="alert">{problem === "network" ? "Check your internet and try again." : "Please ask a member of staff to help you order."}</p>
        {problem === "network" && <button onClick={() => setAttempt((a) => a + 1)} style={{ padding: "10px 14px", fontSize: 16 }}>Try again</button>}
      </main>
    );
  }
  if (!info) return <main><p>Loading menu…</p></main>;
  if (!info.dineInEnabled) {
    return (
      <main>
        <h1>{info.restaurant.name}</h1>
        <p>Ordering from the table isn't available right now. Please ask a member of staff.</p>
      </main>
    );
  }
  const table: TableContext = { token, label: info.table.label, floorName: info.table.floorName, payLaterEnabled: info.payLaterEnabled };
  return <Storefront slug={info.restaurant.slug} table={table} />;
}
