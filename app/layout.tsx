import type { ReactNode } from "react";
import "./legacy.css";

export const metadata = {
  title: "STEOS",
  description: "STEOS by Siamsil Technologies: sell, manage, automate and grow your business.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
