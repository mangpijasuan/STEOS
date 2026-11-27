// A restaurant's own storefront look, stored as data (restaurants.branding) so a new restaurant needs no code change.
// This is the RESTAURANT's brand. The platform's own brand (STEOS) lives in lib/branding.ts and is never mixed with it.
//
// Everything is validated before it reaches a page: colors must be #rrggbb, the logo must be a file under /brands/, and any
// value that does not fit is dropped, so a bad row can never break a storefront or inject styles.
import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** One color mode. Only `brand` is required; the rest are worked out from it when missing. */
const mode = z
  .object({
    brand: hex, // buttons, active chips, accents
    hover: hex.optional(),
    ink: hex.optional(), // text on a brand-colored button
    soft: hex.optional(), // the header's tinted background
    softInk: hex.optional(), // text on that tint
    bg: hex.optional(), // page background
  })
  .strict();

export const restaurantBrandingSchema = z
  .object({
    colors: z.object({ light: mode, dark: mode.optional() }).strict().optional(),
    // The logo is shown as a white badge in a top bar. Files live in public/brands/.
    logo: z
      .object({
        src: z.string().regex(/^\/brands\/[A-Za-z0-9._-]+$/),
        alt: z.string().min(1).max(120),
        width: z.number().int().min(1).max(4000),
        height: z.number().int().min(1).max(4000),
      })
      .strict()
      .optional(),
    tagline: z.string().min(1).max(120).optional(),
    featured: z.array(z.string().min(1).max(80)).max(8).optional(), // dish names, shown as "favorites"
    search: z.boolean().optional(), // a menu search box
  })
  .strict();

export type RestaurantBranding = z.infer<typeof restaurantBrandingSchema>;
export type ColorMode = z.infer<typeof mode>;

/** Reads stored branding. Anything invalid means "no custom branding" rather than an error. */
export function parseBranding(raw: unknown): RestaurantBranding {
  const parsed = restaurantBrandingSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

// --- color helpers -------------------------------------------------------------------------------------------------

const toRgb = (c: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

/** `amount` of `other` mixed into `color` (0 to 1). */
export function mix(color: string, other: string, amount: number): string {
  const a = toRgb(color);
  const b = toRgb(other);
  return toHex(a.map((v, i) => v + (b[i] - v) * amount));
}

function luminance(color: string): number {
  const [r, g, b] = toRgb(color).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black, whichever reads better on `background`. */
export const inkOn = (background: string) => (contrast(background, "#ffffff") >= contrast(background, "#111111") ? "#ffffff" : "#111111");

/** Fills in every token a mode leaves out. Explicit values always win, so a restaurant can pin its exact palette. */
export function completeMode(m: ColorMode, dark: boolean): Required<Omit<ColorMode, "bg">> & { bg?: string } {
  return {
    brand: m.brand,
    hover: m.hover ?? (dark ? mix(m.brand, "#ffffff", 0.18) : mix(m.brand, "#000000", 0.22)),
    ink: m.ink ?? inkOn(m.brand),
    soft: m.soft ?? (dark ? mix(m.brand, "#000000", 0.75) : mix(m.brand, "#ffffff", 0.88)),
    softInk: m.softInk ?? (dark ? mix(m.brand, "#ffffff", 0.45) : mix(m.brand, "#000000", 0.35)),
    bg: m.bg,
  };
}

/** The dark palette when a restaurant gave only a light one: its brand color, lightened so it reads on a dark page. */
export const deriveDark = (light: ColorMode): ColorMode => ({ brand: mix(light.brand, "#ffffff", 0.45) });

function block(selector: string, m: ReturnType<typeof completeMode>): string {
  const lines = [`--brand:${m.brand}`, `--brand-hover:${m.hover}`, `--brand-ink:${m.ink}`, `--brand-soft:${m.soft}`, `--brand-soft-ink:${m.softInk}`];
  if (m.bg) lines.push(`--bg:${m.bg}`);
  return `${selector}{${lines.join(";")}}`;
}

/** CSS that scopes the restaurant's colors to its storefront (`.rb-store`). Built only from validated hex values. Null: no custom colors. */
export function brandCss(branding: RestaurantBranding): string | null {
  if (!branding.colors) return null;
  const light = completeMode(branding.colors.light, false);
  const dark = completeMode(branding.colors.dark ?? deriveDark(branding.colors.light), true);
  return `${block(".ds .rb-store", light)}@media (prefers-color-scheme: dark){${block(".ds .rb-store", dark)}}`;
}

/** True when the storefront needs the branded wrapper at all. */
export const hasBranding = (b: RestaurantBranding) => Object.keys(b).length > 0;

// --- the owner's editor ----------------------------------------------------------------------------------------------

/** What the owner can change on screen. The logo is not here: it is a file under public/brands/ and is kept as it is. */
export const brandingEditSchema = z
  .object({
    color: hex.nullable(), // null: no custom colors
    colorDark: hex.nullable(), // null: worked out from the brand color
    tagline: z.string().trim().max(120).nullable(),
    search: z.boolean(),
    featured: z.array(z.string().trim().min(1).max(80)).max(8),
  })
  .strict();

export type BrandingEdit = z.infer<typeof brandingEditSchema>;

export const LIGHT_PAGE = "#ffffff";
export const DARK_PAGE = "#121212";
/** A brand color is used as text and icons on the page, so it needs at least this much contrast with it (WCAG's bar for large text and icons). */
export const MIN_BRAND_CONTRAST = 3;

/** A plain sentence for each color that would be hard to read, or null when both are fine. */
export function colorProblem(edit: Pick<BrandingEdit, "color" | "colorDark">): string | null {
  if (edit.color && contrast(edit.color, LIGHT_PAGE) < MIN_BRAND_CONTRAST) return "That brand color is too light to read on a white page. Choose a darker one.";
  if (edit.color && edit.colorDark && contrast(edit.colorDark, DARK_PAGE) < MIN_BRAND_CONTRAST) return "That dark-mode color is too dark to read on a dark page. Choose a lighter one.";
  return null;
}

const same = (a: string | undefined, b: string) => a !== undefined && a.toLowerCase() === b.toLowerCase();

/**
 * Applies an edit to the stored branding. The logo is always kept. A color the owner did not change keeps every detail it had
 * (so a restaurant with a hand-tuned palette is not flattened by saving other fields); a color they changed is worked out afresh.
 */
export function applyBrandingEdit(current: RestaurantBranding, edit: BrandingEdit): RestaurantBranding {
  const next: RestaurantBranding = {};
  if (edit.color) {
    const light = same(current.colors?.light.brand, edit.color) ? current.colors!.light : { brand: edit.color.toLowerCase() };
    const dark = edit.colorDark ? (same(current.colors?.dark?.brand, edit.colorDark) ? current.colors!.dark! : { brand: edit.colorDark.toLowerCase() }) : undefined;
    next.colors = dark ? { light, dark } : { light };
  }
  if (current.logo) next.logo = current.logo;
  if (edit.tagline) next.tagline = edit.tagline;
  if (edit.featured.length) next.featured = [...new Set(edit.featured)];
  if (edit.search) next.search = true;
  return restaurantBrandingSchema.parse(next);
}
