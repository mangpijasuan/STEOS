// Shapes returned by GET /api/staff/tables. Kept in one place so the board, table sheet and setup agree.

export type RequestKind = "waiter" | "bill_cash" | "bill_card" | "water" | "other";

export type BoardOrder = {
  id: string;
  number: number;
  status: string;
  paymentMode: "online" | "pay_later";
  paidAt: string | null;
  totalCents: number;
  tipCents: number;
  createdAt: string;
  items: { name: string; quantity: number; options: { name: string }[]; note: string | null }[];
};

export type BoardTable = {
  id: string;
  label: string;
  floorId: string | null;
  seats: number;
  active: boolean;
  assignedTo: { id: string; name: string } | null;
  state: "available" | "browsing" | "pending" | "preparing" | "ready" | "served" | "bill" | "service" | "paid";
  statusLabel: string;
  priority: boolean;
  requests: { id: string; kind: RequestKind; createdAt: string }[];
  orders: BoardOrder[];
  unpaidCents: number;
  /** Only sent to owners. */
  qrToken?: string;
};

export type Board = {
  floors: { id: string; name: string; sortOrder: number }[];
  tables: BoardTable[];
  staff: { id: string; name: string }[];
  me: { id: string; role: "owner" | "staff" };
};

export const REQUEST_TITLES: Record<RequestKind, string> = {
  waiter: "Called a waiter",
  water: "Wants water",
  bill_cash: "Bill · cash",
  bill_card: "Bill · card",
  other: "Needs help",
};

export const STATUS_TEXT: Record<string, string> = {
  awaiting_acceptance: "Waiting for kitchen",
  accepted: "Preparing",
  ready: "Ready to serve",
  completed: "Served",
};
