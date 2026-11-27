import "../ds.css";

// The table board and QR sheets use the scoped design system. Screens outside this wrapper keep their original look.
export default function TablesLayout({ children }: { children: React.ReactNode }) {
  return <div className="ds" data-brand="platform">{children}</div>;
}
