"use client";

import { use, useEffect, useState } from "react";
import Storefront, { type TableContext } from "../../r/[slug]/Storefront";
import { Icon } from "../../icons";
import { Button, Skeleton } from "../../ui";

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
      <main className="container container-sm page">
        <div className="empty">
          <Icon name={problem === "network" ? "wifiOff" : "table"} size={36} />
          <p className="strong" style={{ color: "var(--text)" }}>{problem === "network" ? "No connection" : "This table code isn't valid"}</p>
          <p className="small">{problem === "network" ? "Check your internet and try again." : "Please ask a member of staff to help you order."}</p>
          {problem === "network" && <Button variant="primary" style={{ marginTop: 14 }} onClick={() => setAttempt((a) => a + 1)}>Try again</Button>}
        </div>
      </main>
    );
  }
  if (!info) {
    return (
      <main className="container container-sm page stack" aria-busy="true">
        <Skeleton height={34} width="55%" />
        <Skeleton height={18} width="35%" />
      </main>
    );
  }
  if (!info.dineInEnabled) {
    return (
      <main className="container container-sm page">
        <div className="empty">
          <Icon name="store" size={36} />
          <p className="strong" style={{ color: "var(--text)" }}>{info.restaurant.name}</p>
          <p className="small">Ordering from the table isn't available right now. Please ask a member of staff.</p>
        </div>
      </main>
    );
  }
  const table: TableContext = { token, label: info.table.label, floorName: info.table.floorName, payLaterEnabled: info.payLaterEnabled };
  return <Storefront slug={info.restaurant.slug} table={table} />;
}
