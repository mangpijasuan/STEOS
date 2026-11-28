// Opening hours and pickup slots. All times are handled in the restaurant's time zone, including daylight saving.

export type HoursPeriod = { weekday: number; opens: string; closes: string }; // "HH:MM" ("24:00" allowed for closes: midnight), weekday 0 = Sunday

export const SLOT_MINUTES = 15;
const MAX_SLOTS = 200;

type Zoned = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      weekday: "short",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function zonedParts(date: Date, timeZone: string): Zoned {
  const p = Object.fromEntries(formatter(timeZone).formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    weekday: WEEKDAYS[p.weekday as string],
  };
}

/** Converts a wall-clock time in a time zone to the matching instant. */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const local = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += target - local;
  }
  return new Date(guess);
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function isOpenNow(now: Date, timeZone: string, periods: HoursPeriod[]): boolean {
  const p = zonedParts(now, timeZone);
  const minutes = p.hour * 60 + p.minute;
  return periods.some((x) => x.weekday === p.weekday && minutes >= toMinutes(x.opens) && minutes < toMinutes(x.closes));
}

export type SlotOptions = {
  now: Date;
  timeZone: string;
  periods: HoursPeriod[];
  minPrepMinutes: number;
  maxAdvanceDays: number;
};

/**
 * Pickup times a customer can choose, every 15 minutes inside opening periods, from now + prep time
 * until the end of the last allowed day. The last slot of a period is 15 minutes before closing.
 */
export function computeSlots({ now, timeZone, periods, minPrepMinutes, maxAdvanceDays }: SlotOptions): Date[] {
  const earliest = now.getTime() + minPrepMinutes * 60_000;
  const today = zonedParts(now, timeZone);
  const slots: Date[] = [];

  for (let offset = 0; offset <= maxAdvanceDays; offset++) {
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    const weekday = day.getUTCDay();
    const offsets = new Set([-24, 0, 24].map((hour) => {
      const sample = new Date(Date.UTC(y, m - 1, d, hour));
      const local = zonedParts(sample, timeZone);
      return Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - sample.getTime();
    }));
    const daySlots = new Set<number>();

    const todays = periods.filter((p) => p.weekday === weekday).sort((a, b) => toMinutes(a.opens) - toMinutes(b.opens));
    for (const period of todays) {
      const open = toMinutes(period.opens);
      const close = toMinutes(period.closes);
      for (let minute = open; minute <= close - SLOT_MINUTES; minute += SLOT_MINUTES) {
        const wallTime = Date.UTC(y, m - 1, d, 0, minute);
        for (const offset of offsets) {
          const candidate = wallTime - offset;
          if (candidate < earliest) continue;
          const local = zonedParts(new Date(candidate), timeZone);
          if (Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) === wallTime) {
            daySlots.add(candidate);
          }
        }
      }
    }
    slots.push(...[...daySlots].sort((a, b) => a - b).map((slot) => new Date(slot)));
    if (slots.length >= MAX_SLOTS) return slots.slice(0, MAX_SLOTS);
  }
  return slots;
}

export function isValidHHMM(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** The closing time that means "until midnight". A period may close at 24:00, which is the end of that day. */
export const MIDNIGHT = "24:00";

/** An opening time is a normal clock time. A closing time may also be 24:00 (midnight). */
export function isValidClosing(value: string): boolean {
  return value === MIDNIGHT || isValidHHMM(value);
}
