// Formatting shared by server and client components.

export const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Whole dollars when the amount is round ("$12"), otherwise cents ("$12.50"). For compact labels. */
export const moneyShort = (cents: number) =>
  cents % 100 === 0 ? `$${(cents / 100).toLocaleString("en-US")}` : money(cents);

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "6:30 PM", or "Tue 6:30 PM" when the time is not today, both in the restaurant's time zone. */
export function clockTime(iso: string, timeZone?: string, alwaysDay = false): string {
  const when = new Date(iso);
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone });
  const showDay = alwaysDay || day(when) !== day(new Date());
  return when.toLocaleString("en-US", { timeZone, hour: "numeric", minute: "2-digit", ...(showDay ? { weekday: "short" } : {}) });
}
