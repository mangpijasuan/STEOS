// Small inline icon set (stroke icons, 24px grid). No icon library needed; usable from server and client components.
import type { SVGProps } from "react";

const PATHS = {
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  x: "M6 6l12 12M18 6 6 18",
  check: "m5 12.5 4.5 4.5L19 7",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  alert: "M12 8v5m0 3.5v.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  info: "M12 11v5m0-8.5v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  bag: "M6 8h12l-1 12H7L6 8Zm3 0V6a3 3 0 0 1 6 0v2",
  chef: "M7 14h10v6H7v-6Zm0 0a4 4 0 0 1-.6-7.96 5 5 0 0 1 11.2 0A4 4 0 0 1 17 14",
  chart: "M4 20h16M7 16v-5m5 5V7m5 9v-8",
  tag: "M3 12V4h8l10 10-8 8L3 12Zm5-4.5h.01",
  logout: "M15 17l5-5-5-5m5 5H9m3-9H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Zm4 4a2 2 0 0 0 4 0",
  bellOff: "M3 3l18 18M8.6 4.8A6 6 0 0 1 18 11v4m-2 3H4l2-2v-5c0-.9.2-1.8.6-2.6M10 20a2 2 0 0 0 4 0",
  pause: "M9 6v12m6-12v12",
  play: "M8 5.5v13l11-6.5-11-6.5Z",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6m-6 4h3",
  search: "m20 20-4.5-4.5M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z",
  wifiOff: "M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.3-1.7M2 9.5a15 15 0 0 1 4.6-2.8M22 9.5A15 15 0 0 0 11 5.6M12 20h.01",
  arrowLeft: "M19 12H5m6-6-6 6 6 6",
  arrowRight: "M5 12h14m-6-6 6 6-6 6",
  store: "M4 10v10h16V10M3 4h18l-1.5 6a3 3 0 0 1-5.5 0 3 3 0 0 1-5.5 0 3 3 0 0 1-5.5 0L3 4Zm7 16v-5h4v5",
  mail: "M4 6h16v12H4V6Zm0 0 8 7 8-7",
  card: "M3 6h18v12H3V6Zm0 4h18M7 15h3",
  sparkle: "M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  refund: "M4 8h11a5 5 0 0 1 0 10H8M4 8l4-4M4 8l4 4",
  fire: "M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-1.5-2-1.5-3C7 10 6 12 6 15a6 6 0 0 0 6 6Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  arrowUp: "M12 19V5m-6 6 6-6 6 6",
  arrowDown: "M12 5v14m6-6-6 6-6-6",
  edit: "M4 20h4L19 9l-4-4L4 16v4Zm9.5-13.5 4 4",
  image: "M4 5h16v14H4V5Zm0 11 4.5-4.5 3.5 3.5 3-3L20 16M9 9.5h.01",
  trash: "M5 7h14M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3",
  camera: "M4 8h3l1.5-2h7L17 8h3v11H4V8Zm8 8.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  table: "M4 9h16M6 9v10m12-10v10M3 9l1-4h16l1 4",
  qr: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h2m4 0v2m-6 4h2m2-4v4",
  printer: "M7 8V4h10v4M7 17H5a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M7 14h10v6H7v-6Z",
  cash: "M3 7h18v10H3V7Zm9 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 10v.01M18 14v.01",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  home: "M4 11 12 4l8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-9Z",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  chevronLeft: "m15 6-6 6 6 6",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-13v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z",
  monitor: "M4 5h16v11H4V5Zm5 15h6m-3-4v4",
  chevronRight: "m9 6 6 6-6 6",
  trendUp: "m3 17 6-6 4 4 8-8m0 0h-5m5 0v5",
  trendDown: "m3 7 6 6 4-4 8 8m0 0h-5m5 0v-5",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, strokeWidth = 2, ...rest }: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      <path d={PATHS[name]} />
    </svg>
  );
}
