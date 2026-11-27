"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Appearance = "system" | "light" | "dark";
const KEY = "steos:customer-appearance";
const AppearanceContext = createContext<{ appearance: Appearance; choose: (value: Appearance) => void }>({ appearance: "system", choose: () => {} });

export function CustomerAppearance({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>("system");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark" || saved === "system") setAppearance(saved);
    } catch {}
  }, []);
  function choose(value: Appearance) {
    setAppearance(value);
    try { localStorage.setItem(KEY, value); } catch {}
  }
  return <AppearanceContext.Provider value={{ appearance, choose }}>
    <div className="ds customer-appearance" data-theme={appearance === "system" ? undefined : appearance}>{children}</div>
  </AppearanceContext.Provider>;
}

export function CustomerAppearanceControl() {
  const { appearance, choose } = useContext(AppearanceContext);
  return <select className="customer-theme-select" aria-label="Appearance" value={appearance}
    onChange={event => choose(event.target.value as Appearance)}>
    <option value="system">System</option>
    <option value="light">Light</option>
    <option value="dark">Dark</option>
  </select>;
}
