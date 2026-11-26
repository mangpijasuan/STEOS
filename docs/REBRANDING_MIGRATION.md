# SROS to STEOS rebranding and migration

STEOS replaces the working name SROS. (The first draft of the directive spelled it "STOS"; the founder confirmed **STEOS** as the official name.) This page records what was audited, what changed, what was deliberately left alone and what still needs the founder's approval. SROS remains the historical project name only.

## Audit result

The repository was searched for every reference to SROS (62 lines in 26 files, on `main` at `b7fc7a7`) and for the Siamsil name. There are no environment variables, cookies, routes or webhook endpoints named SROS.

| Class | What | Action |
| --- | --- | --- |
| Safe to rename | UI text (home page, sidebar fallback, page titles, pricing and reports labels, tables setup text), email subject and alert text, console output, code comments, test names, README and docs | Changed to STEOS |
| Needs compatibility | Browser local storage keys `sros:customer` and `sros:side`; the internal field name `srosRevenueCents` in `lib/pricing.ts` and its tests | **Left unchanged.** Renaming the storage keys would reset a customer's saved name and phone and a user's sidebar choice; the field is internal. Rename later with a read-old-write-new step |
| Merged migrations | Two SQL comments in `db/migrations/0013_tables.sql` | **Left unchanged.** Merged migrations are not edited |
| Historical | Ticket IDs such as SROS-501 in `docs/PHASE_4_INTEGRATION.md`; older links that use the repository's former name `Siamsil-SROS` (GitHub redirects them) | **Left unchanged** |
| Needs production migration | Database name `siamsil`, roles `siamsil_owner` and `siamsil_app`, test database `siamsil_test`, session cookie `sr_session`, npm package name `siamsil-restaurant` | **Left unchanged.** None of these are visible to users, and renaming a live database or role is risky for no customer benefit |
| Needs founder approval | New logo and brand assets; the customer-facing name on restaurant storefronts | **Not done**. The founder has already renamed the GitHub repository to `STEOS` |

## What changed

- Product name and descriptions: README, `package.json` description, browser title and description, email subject (now "Sign in to STEOS"), alert prefix, platform report, and every user-visible mention in the app.
- The footer "© 2026 Siamsil Technologies, Inc. All rights reserved. / STEOS is a product of Siamsil Technologies." appears on STEOS's own pages (home and sign-in). It does **not** appear on restaurant storefronts, which carry the restaurant's brand.
- Each restaurant page's browser tab now shows the restaurant's name. Before, every page showed the platform name, so Zogam Cafe's customers saw "Siamsil Restaurant" in the tab.
- `docs/architecture.md` became `docs/ARCHITECTURE.md` (renamed, history kept). A file that differs only in capitalization would break checkouts on macOS and Windows, so there is exactly one.
- New documents: CLAUDE.md, STEOS_MASTER_PLAN, PRODUCT_VISION, PRODUCT_ROADMAP, SECURITY, MULTI_TENANCY, DEPLOYMENT, TESTING and this page. AGENTS.md keeps the Next.js notice and gains STEOS instructions.

## What did not change

Behavior, database schema, migrations, payment code, pricing and fees, API routes, webhook endpoints, environment variables, secrets, Zogam Cafe's storefront and data, and Git history.

## Open questions for the founder

1. **Trademark.** The name STEOS has not been searched. A search of the US trademark database for the different spelling "stos" (9 results; four live, none in business software) says nothing about STEOS, so it has to be repeated for STEOS and for close variants, in the software and business-services classes (9, 35, 36, 42). Then have a trademark attorney give an opinion before spending on logos or a public launch.
2. **Legal entity.** The footer says "Siamsil Technologies, Inc.". I could not verify that this is the exact registered name. Confirm it before launch.
3. **Brand assets.** The brand colors are French navy, white and gold. No STEOS logo exists in the repository yet, and the design system still uses its current orange accent for STEOS's own screens. A logo and color pass is a separate piece of work.
4. **Repository and domain.** The founder renamed the GitHub repository to `STEOS`. GitHub redirects the old address, but local clones should update their remote (`git remote set-url origin https://github.com/mangpijasuan/STEOS.git`). Decide on the domain and the expansion of the name (what the letters stand for) before they are printed anywhere.

## Rollback

Everything here is text and documentation on one branch. Revert the pull request to restore the old names. Nothing was changed in the database or in deployment settings, so no data or production step is involved.

## Later, with approval

Rename the local storage keys with a migration; rename the internal revenue field; move the package name; and, only if there is a customer reason, introduce new database role names through a planned migration.
