import { eq } from "drizzle-orm";
import { businessHours, restaurants } from "../db/schema";
import type { MenuTree } from "./cart";
import { pool, withTenant } from "./db";
import { HttpError } from "./http";
import { computeSlots, isOpenNow, type HoursPeriod } from "./hours";
import { imageUrl } from "./images";
import { getMenu } from "./menu";

export type PublicRestaurant = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  taxRateBps: number;
  status: string;
  minPrepMinutes: number;
  maxAdvanceDays: number;
  acceptingOrders: boolean;
  defaultLocationId: string | null;
};

export type Store = { restaurant: PublicRestaurant; menu: MenuTree; periods: HoursPeriod[] };

const SLUG = /^[a-z0-9][a-z0-9-]{1,48}$/i;

export async function slugParam(ctx: { params: Promise<{ slug: string }> }): Promise<string> {
  const { slug } = await ctx.params;
  if (!SLUG.test(slug)) throw new HttpError(404, "Restaurant not found");
  return slug.toLowerCase();
}

/** The same store for a signed-in staff member, found by their restaurant id rather than a public slug. */
export async function loadStoreById(restaurantId: string): Promise<Store> {
  const found = await withTenant(restaurantId, (db) => db.select({ slug: restaurants.slug }).from(restaurants));
  if (!found[0]) throw new HttpError(404, "Restaurant not found");
  return loadStore(found[0].slug);
}

/** Looks up a restaurant by its public slug, then reads its menu and hours inside that restaurant's scope. */
export async function loadStore(slug: string): Promise<Store> {
  const found = await pool.query("select * from public_restaurant_by_slug($1)", [slug]);
  const row = found.rows[0];
  if (!row) throw new HttpError(404, "Restaurant not found");

  const restaurant: PublicRestaurant = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    timezone: row.timezone,
    taxRateBps: row.tax_rate_bps,
    status: row.status,
    minPrepMinutes: row.min_prep_minutes,
    maxAdvanceDays: row.max_advance_days,
    acceptingOrders: row.accepting_orders,
    defaultLocationId: row.default_location_id,
  };

  const { menu, periods } = await withTenant(restaurant.id, async (db) => {
    const menu = await getMenu(db);
    const hours = restaurant.defaultLocationId
      ? await db.select().from(businessHours).where(eq(businessHours.locationId, restaurant.defaultLocationId))
      : [];
    return {
      menu,
      periods: hours.map((h) => ({ weekday: h.weekday, opens: h.opens.slice(0, 5), closes: h.closes.slice(0, 5) })),
    };
  });
  return { restaurant, menu, periods };
}

export const orderingEnabled = (r: PublicRestaurant) => r.status !== "paused" && r.acceptingOrders;

export function pickupSlots(store: Store, now = new Date()): Date[] {
  if (!orderingEnabled(store.restaurant)) return [];
  return computeSlots({
    now,
    timeZone: store.restaurant.timezone,
    periods: store.periods,
    minPrepMinutes: store.restaurant.minPrepMinutes,
    maxAdvanceDays: store.restaurant.maxAdvanceDays,
  });
}

/** What the public storefront may see. No internal ids, timestamps or soft-deleted rows. */
export function toPublicStore(store: Store, now = new Date()) {
  const { restaurant, menu, periods } = store;
  const slots = pickupSlots(store, now);
  const open = isOpenNow(now, restaurant.timezone, periods);
  return {
    restaurant: {
      name: restaurant.name,
      slug: restaurant.slug,
      timezone: restaurant.timezone,
      taxRateBps: restaurant.taxRateBps,
      orderingOpen: orderingEnabled(restaurant),
      openNow: open,
      minPrepMinutes: restaurant.minPrepMinutes,
      // The earliest pickup right now, or null if nothing can be ordered.
      asap: open && slots[0] ? slots[0].toISOString() : null,
    },
    categories: menu
      .filter((c) => c.items.length > 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
        items: c.items.map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          priceCents: i.priceCents,
          available: i.available,
          imageUrl: i.imageId ? imageUrl(i.imageId) : i.imageUrl,
          modifierGroups: i.modifierGroups.map((g) => ({
            id: g.id,
            name: g.name,
            minChoices: g.minChoices,
            maxChoices: g.maxChoices,
            options: g.options.map((o) => ({
              id: o.id,
              name: o.name,
              priceDeltaCents: o.priceDeltaCents,
              available: o.available,
            })),
          })),
        })),
      })),
  };
}
