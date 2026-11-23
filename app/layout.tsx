import type { ReactNode } from "react";
import "./legacy.css";

export const metadata = { title: "Siamsil Restaurant" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
