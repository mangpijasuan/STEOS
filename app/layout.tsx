import type { ReactNode } from "react";

export const metadata = { title: "Siamsil Restaurant" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "1rem", maxWidth: 720 }}>
        {children}
      </body>
    </html>
  );
}
