import type { ReactNode } from "react";
import "../ds.css";

// The kitchen always uses the dark theme: easier on the eyes all day on a tablet, and readable under bright lights.
export default function KitchenLayout({ children }: { children: ReactNode }) {
  return <div className="ds" data-theme="dark" data-brand="platform">{children}</div>;
}
