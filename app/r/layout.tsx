import type { ReactNode } from "react";
import "../ds.css";
import "../customer-appearance.css";
import { CustomerAppearance } from "../customer-appearance";

// Customer screens use the design system (see app/ds.css), in light or dark to match the device.
export default function Layout({ children }: { children: ReactNode }) {
  return <CustomerAppearance>{children}</CustomerAppearance>;
}
