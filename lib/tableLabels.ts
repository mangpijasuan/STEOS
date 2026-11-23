// Turns what an owner types into table names: "1-12" gives twelve tables, "A1, A2, Patio 1" gives three.

const VALID = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,11}$/;
export const MAX_NEW_TABLES = 100;

export type ParsedLabels = { labels: string[]; error?: undefined } | { labels?: undefined; error: string };

export function parseTableLabels(input: string): ParsedLabels {
  const parts = input
    .split(/[,\n]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { error: "Enter table names, like 1-12 or A1, A2" };

  const out: string[] = [];
  for (const part of parts) {
    const range = part.match(/^(\d{1,3})\s*-\s*(\d{1,3})$/);
    if (range) {
      const [, from, to] = range;
      const a = Number(from);
      const b = Number(to);
      if (b < a) return { error: `“${part}” counts backwards` };
      if (b - a + 1 > MAX_NEW_TABLES) return { error: `Add up to ${MAX_NEW_TABLES} tables at a time` };
      // "01-12" keeps its leading zero so labels sort and print neatly.
      const width = from.startsWith("0") ? Math.max(from.length, String(b).length) : 0;
      for (let n = a; n <= b; n++) out.push(width ? String(n).padStart(width, "0") : String(n));
    } else if (VALID.test(part)) {
      out.push(part);
    } else {
      return { error: `“${part}” can't be a table name. Use letters, numbers, spaces or dashes, up to 12 characters.` };
    }
  }
  const seen = new Set<string>();
  const unique = out.filter((l) => !seen.has(l.toLowerCase()) && !!seen.add(l.toLowerCase()));
  if (unique.length > MAX_NEW_TABLES) return { error: `Add up to ${MAX_NEW_TABLES} tables at a time` };
  return { labels: unique };
}
