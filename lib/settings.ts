import { and, eq } from "drizzle-orm";
import { businessHours, locations, restaurants } from "../db/schema";
import type { Tx } from "./db";
import { HttpError } from "./http";
import { isValidHHMM, type HoursPeriod } from "./hours";

export async function getSettings(db: Tx) {
  const rows = await db
    .select({
      name: restaurants.name,
      slug: restaurants.slug,
      timezone: restaurants.timezone,
      status: restaurants.status,
      taxRateBps: restaurants.taxRateBps,
      minPrepMinutes: restaurants.minPrepMinutes,
      maxAdvanceDays: restaurants.maxAdvanceDays,
      acceptingOrders: restaurants.acceptingOrders,
      dineInEnabled: restaurants.dineInEnabled,
      payLaterEnabled: restaurants.payLaterEnabled,
    })
    .from(restaurants);
  if (!rows[0]) throw new HttpError(404, "Not found");
  return rows[0];
}

export async function updateSettings(
  db: Tx,
  restaurantId: string,
  patch: { acceptingOrders?: boolean; minPrepMinutes?: number; maxAdvanceDays?: number; taxRateBps?: number; dineInEnabled?: boolean; payLaterEnabled?: boolean },
) {
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (Object.keys(clean).length === 0) throw new HttpError(400, "Nothing to update");
  await db.update(restaurants).set(clean).where(eq(restaurants.id, restaurantId));
  return getSettings(db);
}

async function defaultLocationId(db: Tx, lock = false): Promise<string> {
  const query = db.select({ id: locations.id }).from(locations).where(eq(locations.isDefault, true));
  const rows = await (lock ? query.for("update") : query);
  if (!rows[0]) throw new HttpError(404, "No default location");
  return rows[0].id;
}

export async function getHours(db: Tx): Promise<HoursPeriod[]> {
  const locationId = await defaultLocationId(db);
  const rows = await db.select().from(businessHours).where(eq(businessHours.locationId, locationId));
  return rows
    .map((h) => ({ weekday: h.weekday, opens: h.opens.slice(0, 5), closes: h.closes.slice(0, 5) }))
    .sort((a, b) => a.weekday - b.weekday || a.opens.localeCompare(b.opens));
}

/** Replaces every opening period of the default location. Periods on the same day may not overlap. */
export async function replaceHours(db: Tx, restaurantId: string, periods: HoursPeriod[]): Promise<HoursPeriod[]> {
  for (const p of periods) {
    if (!isValidHHMM(p.opens) || !isValidHHMM(p.closes)) throw new HttpError(400, "Times must look like 09:30");
    if (p.closes <= p.opens) throw new HttpError(400, "Closing time must be after opening time");
  }
  for (let day = 0; day < 7; day++) {
    const sorted = periods.filter((p) => p.weekday === day).sort((a, b) => a.opens.localeCompare(b.opens));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].opens < sorted[i - 1].closes) throw new HttpError(400, "Opening periods on the same day overlap");
    }
  }
  const locationId = await defaultLocationId(db, true);
  await db.delete(businessHours).where(and(eq(businessHours.locationId, locationId)));
  if (periods.length) {
    await db.insert(businessHours).values(periods.map((p) => ({ restaurantId, locationId, weekday: p.weekday, opens: p.opens, closes: p.closes })));
  }
  return getHours(db);
}
