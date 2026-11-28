// The Siamsil mark: a ring around four tiles. Colors come from CSS variables so one component works on light and dark
// surfaces (navy and gold on light; white and gold on the midnight dark theme). Decorative: the name is next to it as text.
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg className={`brand-mark${className ? ` ${className}` : ""}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="46" fill="none" stroke="var(--mark-a, #183153)" strokeWidth="4" />
      <path d="M32,20H45.5Q48,20 48,22.5V45.5Q48,48 45.5,48H22.5Q20,48 20,45.5V32Q20,20 32,20Z" fill="var(--mark-a, #183153)" />
      <path d="M54.5,20H68Q80,20 80,32V45.5Q80,48 77.5,48H54.5Q52,48 52,45.5V22.5Q52,20 54.5,20Z" fill="var(--mark-b, #C8921F)" />
      <path d="M22.5,52H45.5Q48,52 48,54.5V77.5Q48,80 45.5,80H32Q20,80 20,68V54.5Q20,52 22.5,52Z" fill="var(--mark-b, #C8921F)" />
      <path d="M54.5,52H77.5Q80,52 80,54.5V68Q80,80 68,80H54.5Q52,80 52,77.5V54.5Q52,52 54.5,52Z" fill="var(--mark-a, #183153)" />
    </svg>
  );
}
