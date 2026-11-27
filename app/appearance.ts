// Light or dark for STEOS's own screens, chosen per person and remembered in this browser. "auto" follows the device.

export type Appearance = "auto" | "light" | "dark";

export const APPEARANCE_KEY = "steos:appearance";
const ORDER: Appearance[] = ["auto", "light", "dark"];

export const parseAppearance = (value: unknown): Appearance => (value === "light" || value === "dark" ? value : "auto");

/** The choice after pressing the button: Match device, then Light, then Dark, then back. */
export const nextAppearance = (current: Appearance): Appearance => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];

export const APPEARANCE_LABEL: Record<Appearance, string> = { auto: "Match device", light: "Light", dark: "Dark" };
/** The same choices in one or two words, for the narrow sidebar. */
export const APPEARANCE_SHORT: Record<Appearance, string> = { auto: "Auto", light: "Light", dark: "Dark" };

/** Runs in <head> before the page paints, so a chosen look never flashes the other one. Kept dependency-free on purpose. */
export const APPEARANCE_SCRIPT = `try{var a=localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)});if(a==="light"||a==="dark")document.documentElement.dataset.appearance=a}catch(e){}`;

export function readAppearance(): Appearance {
  try {
    return parseAppearance(localStorage.getItem(APPEARANCE_KEY));
  } catch {
    return "auto";
  }
}

export function saveAppearance(value: Appearance) {
  const root = document.documentElement;
  if (value === "auto") delete root.dataset.appearance;
  else root.dataset.appearance = value;
  try {
    if (value === "auto") localStorage.removeItem(APPEARANCE_KEY);
    else localStorage.setItem(APPEARANCE_KEY, value);
  } catch {}
}
