// The single source of the platform's identity. Everything a person reads that names the product (page titles, metadata,
// email subjects, fee labels, footers, alerts, reports) comes from here, so a name change is a one-file change.
//
// This is the PLATFORM's brand. A restaurant's storefront keeps its own brand (name, logo, colors); nothing here is
// applied to it. `tests/branding.test.ts` fails if a screen or library file hard-codes the platform name instead.
//
// Values are the founder's approved defaults. `domain` and `logo` are not set yet. `colors` are proposed defaults; they
// are applied by app/ds.css (the `data-brand="platform"` block, which has to repeat the hex values because CSS cannot
// import this file) to the platform's own screens only, and `tests/branding.test.ts` checks the two stay in step.

export const branding = {
  name: "STEOS",
  fullName: "Siamsil Technologies Enterprise Operating System",
  company: "Siamsil Technologies",
  tagline: "One Platform. Every Business.",
  domain: null,
  logo: {
    light: null,
    dark: null,
  },
  colors: {
    primary: "#183153",
    secondary: "#D4AF37",
    white: "#FFFFFF",
  },
  poweredBy: {
    enabled: false,
    text: "Powered by STEOS",
  },
} as const;

/** The registered company name used in the footer. Taken from the founder's directive; not yet verified against a filing. */
export const legalName = "Siamsil Technologies, Inc.";

/** The year the footer shows. Fixed on purpose: it is the year of first publication, not "today". */
export const copyrightYear = 2026;

/** "Kitchen · STEOS": the browser tab title for a platform page. */
export const pageTitle = (page: string) => `${page} · ${branding.name}`;

/** "STEOS fee": the label for the platform's fee in pricing and reports. */
export const feeLabel = `${branding.name} fee`;

/** The subject of the sign-in email. */
export const signInSubject = `Sign in to ${branding.name}`;

/** The two footer lines for the platform's own pages (home, sign-in). */
export const footerLines = [
  `© ${copyrightYear} ${legalName} All rights reserved.`,
  `${branding.name} is a product of ${branding.company}.`,
] as const;

/** The short description used in page metadata. */
export const metaDescription = `${branding.name} by ${branding.company}: ${branding.tagline}`;
