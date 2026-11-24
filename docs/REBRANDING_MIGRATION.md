# SROS to STOS rebranding and migration

STOS (Siamsil Technologies Operating System) replaces the working name SROS. This page records what was audited, what changed, what was deliberately left alone and what still needs the founder's approval. SROS remains the historical project name only.

## Audit result

The repository was searched for every reference to SROS (62 lines in 26 files, on `main` at `b7fc7a7`) and for the Siamsil name. There are no environment variables, cookies, routes or webhook endpoints named SROS.

| Class | What | Action |
| --- | --- | --- |
| Safe to rename | UI text (home page, sidebar fallback, page titles, pricing and reports labels, tables setup text), email subject and alert text, console output, code comments, test names, README and docs | Changed to STOS |
| Needs compatibility | Browser local storage keys `sros:customer` and `sros:side`; the internal field name `srosRevenueCents` in `lib/pricing.ts` and its tests | **Left unchanged.** Renaming the storage keys would reset a customer's saved name and phone and a user's sidebar choice; the field is internal. Rename later with a read-old-write-new step |
| Merged migrations | Two SQL comments in `db/migrations/0013_tables.sql` | **Left unchanged.** Merged migrations are not edited |
| Historical | Ticket IDs such as SROS-501 in `docs/PHASE_4_INTEGRATION.md`; links to the GitHub repository `Siamsil-SROS` | **Left unchanged** |
| Needs production migration | Database name `siamsil`, roles `siamsil_owner` and `siamsil_app`, test database `siamsil_test`, session cookie `sr_session`, npm package name `siamsil-restaurant` | **Left unchanged.** None of these are visible to users, and renaming a live database or role is risky for no customer benefit |
| Needs founder approval | Renaming the GitHub repository; new logo and brand assets; the customer-facing name on restaurant storefronts | **Not done** |

## What changed

- Product name and descriptions: README, `package.json` description, browser title and description, email subject (now "Sign in to STOS"), alert prefix, platform report, and every user-visible mention in the app.
- The footer "© 2026 Siamsil Technologies, Inc. All rights reserved. / STOS is a product of Siamsil Technologies." appears on STOS's own pages (home and sign-in). It does **not** appear on restaurant storefronts, which carry the restaurant's brand.
- Each restaurant page's browser tab now shows the restaurant's name. Before, every page showed the platform name, so Zogam Cafe's customers saw "Siamsil Restaurant" in the tab.
- `docs/architecture.md` became `docs/ARCHITECTURE.md` (renamed, history kept). A file that differs only in capitalization would break checkouts on macOS and Windows, so there is exactly one.
- New documents: CLAUDE.md, STOS_MASTER_PLAN, PRODUCT_VISION, PRODUCT_ROADMAP, SECURITY, MULTI_TENANCY, DEPLOYMENT, TESTING and this page. AGENTS.md keeps the Next.js notice and gains STOS instructions.

## What did not change

Behavior, database schema, migrations, payment code, pricing and fees, API routes, webhook endpoints, environment variables, secrets, Zogam Cafe's storefront and data, and Git history.

## Open questions for the founder

1. **Trademark.** The name STOS has not been searched. A very short acronym may already be used in software or business services. Do a trademark search (the US trademark database, then a lawyer) before spending on logos or public launch.
2. **Legal entity.** The footer says "Siamsil Technologies, Inc.". I could not verify that this is the exact registered name. Confirm it before launch.
3. **Brand assets.** The brand colors are French navy, white and gold. No STOS logo exists in the repository yet, and the design system still uses its current orange accent for STOS's own screens. A logo and color pass is a separate piece of work.
4. **Repository and domain.** Renaming the GitHub repository breaks links in existing pull requests and local clones until they are updated. Decide when, if at all.

## Rollback

Everything here is text and documentation on one branch. Revert the pull request to restore the old names. Nothing was changed in the database or in deployment settings, so no data or production step is involved.

## Later, with approval

Rename the local storage keys with a migration; rename the internal revenue field; move the package name; rename the GitHub repository; and, only if there is a customer reason, introduce new database role names through a planned migration.
