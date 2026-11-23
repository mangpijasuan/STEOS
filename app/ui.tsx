"use client";

// Shared interactive components. Styling lives in globals.css; these add behavior
// (loading states, focus handling, keyboard support) so every screen gets it for free.

import { useCallback, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

type Variant = "primary" | "secondary" | "success" | "danger" | "soft-danger" | "ghost";
type Size = "sm" | "md" | "lg" | "xl";

export function Button({
  variant = "secondary",
  size = "md",
  block,
  loading,
  icon,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; block?: boolean; loading?: boolean; icon?: IconName }) {
  const classes = [
    "btn",
    variant !== "secondary" && `btn-${variant}`,
    size !== "md" && `btn-${size}`,
    block && "btn-block",
    !children && "btn-icon",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={size === "sm" ? 18 : 20} /> : null}
      {children}
    </button>
  );
}

export function Alert({ tone = "info", children, action }: { tone?: "info" | "success" | "warning" | "danger"; children: ReactNode; action?: ReactNode }) {
  const icon: IconName = tone === "success" ? "check" : tone === "info" ? "info" : "alert";
  return (
    <div className={`alert ${tone !== "info" ? `alert-${tone}` : ""}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon name={icon} size={18} />
      <div className="grow">{children}</div>
      {action}
    </div>
  );
}

export function Skeleton({ height = 16, width = "100%", style }: { height?: number; width?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height, width, ...style }} aria-hidden="true" />;
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
  size?: "lg";
}) {
  return (
    <div className={`segmented ${size === "lg" ? "segmented-lg" : ""}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, min = 1, max = 50, onChange, size, label }: { value: number; min?: number; max?: number; onChange: (n: number) => void; size?: "sm"; label: string }) {
  return (
    <div className={`stepper ${size === "sm" ? "stepper-sm" : ""}`} role="group" aria-label={label}>
      <button type="button" aria-label={value <= min && min === 0 ? "Remove" : "Fewer"} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Icon name="minus" size={18} />
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label="More" disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}

/**
 * Modal sheet: slides up from the bottom on phones, centered dialog on larger screens.
 * Escape and the backdrop close it, page scroll is locked, focus moves in and returns on close.
 */
export function Sheet({ title, subtitle, onClose, children, footer, hero }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; hero?: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panel.current) {
        // Keep keyboard focus inside the sheet.
        const focusable = panel.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select, textarea, a[href]");
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet ${hero ? "has-hero" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panel} tabIndex={-1}>
        <div className="sheet-grip" aria-hidden="true" />
        {hero && (
          <div className="sheet-hero">
            {hero}
            <Button className="sheet-close" icon="x" aria-label="Close" onClick={onClose} />
          </div>
        )}
        <div className="sheet-header">
          <div className="stack" style={{ "--gap": "4px" } as React.CSSProperties}>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <div className="muted small">{subtitle}</div>}
          </div>
          {!hero && <Button variant="ghost" icon="x" aria-label="Close" onClick={onClose} />}
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>
  );
}

type Toast = { id: number; text: string; tone?: "danger" };

/** Brief confirmation messages. `toast("Saved")` from anywhere in the component that owns `<Toasts />`. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const toast = useCallback((text: string, tone?: "danger") => {
    const id = ++next.current;
    // One message at a time: a new one replaces the last, so quick repeated taps don't pile up over the page.
    setToasts([{ id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "danger" ? 6000 : 3500);
  }, []);
  const node = (
    <div className="toast-region" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone === "danger" ? "toast-danger" : ""}`}>
          <Icon name={t.tone === "danger" ? "alert" : "check"} size={18} />
          {t.text}
        </div>
      ))}
    </div>
  );
  return { toast, toasts: node };
}

/**
 * Fetch JSON with the app's conventions: sends the user to sign-in on 401, returns the parsed body,
 * and turns network failures and error responses into a readable message.
 */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    return { ok: false, status: 0, error: "No connection. Check your internet and try again." };
  }
  if (res.status === 401 && url.startsWith("/api/staff")) {
    window.location.href = "/login";
    return { ok: false, status: 401, error: "Please sign in again." };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.issues?.[0]?.message ?? body?.error ?? "Something went wrong. Please try again.";
    return { ok: false, status: res.status, error: body?.requestId ? `${message} (ref ${String(body.requestId).slice(0, 8)})` : message };
  }
  return { ok: true, data: body as T };
}

export type Me = { email: string; name: string; role: "owner" | "staff"; restaurantId: string };

/** Loads the signed-in staff member once per page. Redirects to sign-in when there is no session. */
export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    void api<Me>("/api/staff/me").then((r) => r.ok && setMe(r.data));
  }, []);
  return me;
}

const LINKS = [
  { href: "/dashboard", label: "Dashboard", ownerOnly: false },
  { href: "/menu", label: "Menu", ownerOnly: false },
  { href: "/tables", label: "Tables", ownerOnly: false },
  { href: "/manage", label: "Hours & settings", ownerOnly: true },
  { href: "/kitchen", label: "Kitchen", ownerOnly: false },
  { href: "/reports", label: "Reports", ownerOnly: true },
  { href: "/pricing", label: "Plan", ownerOnly: true },
];

/** The staff page header with links to the other staff screens. Screens not yet on the design system keep their own. */
export function StaffTopbar({ current, me }: { current: string; me: Me | null }) {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  }
  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <a className="brandmark" href="/dashboard" aria-label="SROS home">
          <span className="logo">S</span>
          <span className="sr-only">SROS</span>
        </a>
        <nav className="nav grow" aria-label="Staff">
          {LINKS.filter((l) => !l.ownerOnly || me?.role === "owner").map((l) => (
            <a key={l.href} href={l.href} aria-current={current === l.href ? "page" : undefined}>
              {l.label}
            </a>
          ))}
        </nav>
        {me && (
          <div className="row" style={{ "--gap": "6px" } as React.CSSProperties}>
            <span className="subtle" style={{ whiteSpace: "nowrap" }} title={me.email}>
              {me.role === "owner" ? "Owner" : "Staff"}
            </span>
            <Button variant="ghost" size="sm" icon="logout" aria-label="Sign out" loading={busy} onClick={signOut} />
          </div>
        )}
      </div>
    </header>
  );
}
