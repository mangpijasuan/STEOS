import type { ReactNode } from "react";
import "./legacy.css";
import { branding, metaDescription } from "@/lib/branding";

export const metadata = {
  title: branding.name,
  description: metaDescription,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
