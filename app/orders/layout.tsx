import type { ReactNode } from "react";
import "../ds.css";

// Screens under this layout use the design system (see app/ds.css). Others keep their original look.
export default function Layout({ children }: { children: ReactNode }) {
  return <div className="ds">{children}</div>;
}
