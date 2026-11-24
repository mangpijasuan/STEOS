import type { ReactNode } from "react";
import "./legacy.css";

export const metadata = {
  title: "STOS",
  description: "STOS, the Siamsil Technologies Operating System: sell, manage, automate and grow your business.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
