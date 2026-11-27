import type { ReactNode } from "react";
import "./legacy.css";
import { branding, metaDescription } from "@/lib/branding";
import { APPEARANCE_SCRIPT } from "./appearance";

export const metadata = {
  title: branding.name,
  description: metaDescription,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the script below may set data-appearance on <html> before React loads, so the first paint
    // already has the person's chosen light or dark look and does not flash the other one.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
