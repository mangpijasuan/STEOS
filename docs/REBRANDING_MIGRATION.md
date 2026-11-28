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

## How the branding is centralized

`lib/branding.ts` holds the platform's identity as the founder approved it: name `STEOS`, full name "Siamsil Technologies Enterprise Operating System", company "Siamsil Technologies", tagline "One Platform. Every Business.", domain and logos (not set yet), colors (French navy `#183153`, gold `#D4AF37`, white; proposed defaults, applied to STEOS's own screens only, see below) and a "Powered by STEOS" option that is **off**. It also builds the strings that name the product: browser titles, metadata description, the sign-in email subject, the "STEOS fee" label, alert and report prefixes, and the two footer lines on the home and sign-in pages.

- Screens and libraries import from it. `tests/branding.test.ts` fails if a file under `app`, `lib` or `scripts` types the product name into a string or page text, or uses the old name SROS (apart from the two kept storage keys and one internal field).
- Restaurant storefronts do not use it. Zogam Cafe keeps its own name, logo and colors; the test checks the storefront does not import the config.
- To rename the product again, change `lib/branding.ts` and the documentation; no screen needs editing.
- **Colors.** STEOS's own screens (home, sign-in, the staff and owner screens and the kitchen) carry `data-brand="platform"` and use navy as the main color in light mode, with a gold accent on the logo letter and the active sidebar item. In dark mode (and the kitchen, which is always dark) gold becomes the main accent, because navy on a dark background is unreadable. Restaurant-facing pages (the storefront, table page and order status) do **not** carry it, so each restaurant keeps its own look: Zogam Cafe stays green and other restaurants keep the default orange.
- Documentation cannot import code, so the docs still spell the name out; keep them in step by hand.

## What changed

- Product name and descriptions: README, `package.json` description, browser title and description, email subject (now "Sign in to STEOS"), alert prefix, platform report, and every user-visible mention in the app.
- The footer "© 2026 Siamsil Technologies. All rights reserved. / STEOS is a product of Siamsil Technologies." appears on STEOS's own pages (home and sign-in). It does **not** appear on restaurant storefronts, which carry the restaurant's brand.
- Each restaurant page's browser tab now shows the restaurant's name. Before, every page showed the platform name, so Zogam Cafe's customers saw "Siamsil Restaurant" in the tab.
- `docs/architecture.md` became `docs/ARCHITECTURE.md` (renamed, history kept). A file that differs only in capitalization would break checkouts on macOS and Windows, so there is exactly one.
- New documents: CLAUDE.md, STEOS_MASTER_PLAN, PRODUCT_VISION, PRODUCT_ROADMAP, SECURITY, MULTI_TENANCY, DEPLOYMENT, TESTING and this page. AGENTS.md keeps the Next.js notice and gains STEOS instructions.

## What did not change

Behavior, database schema, migrations, payment code, pricing and fees, API routes, webhook endpoints, environment variables, secrets, Zogam Cafe's storefront and data, and Git history.

## Open questions for the founder

1. **Trademark.** The name STEOS has not been searched. A search of the US trademark database for the different spelling "stos" (9 results; four live, none in business software) says nothing about STEOS, so it has to be repeated for STEOS and for close variants, in the software and business-services classes (9, 35, 36, 42). Then have a trademark attorney give an opinion before spending on logos or a public launch.
2. **Legal entity.** The footer says "Siamsil Technologies, Inc.". I could not verify that this is the exact registered name. Confirm it before launch.
3. **Brand assets.** No STEOS logo exists yet (the sidebar and home page use a navy square with a gold "S" as a placeholder), and the domain is unset. The navy and gold are applied (see below) but are proposed defaults.
4. **Repository and domain.** The founder renamed the GitHub repository to `STEOS`. GitHub redirects the old address, but local clones should update their remote (`git remote set-url origin https://github.com/mangpijasuan/STEOS.git`). Decide on the domain before it is printed anywhere (`domain` is unset in `lib/branding.ts`).

## Rollback

Everything here is text and documentation on one branch. Revert the pull request to restore the old names. Nothing was changed in the database or in deployment settings, so no data or production step is involved.

## Later, with approval

Add the logo and domain once they exist; switch on "Powered by" for restaurant storefronts if the founder wants it; rename the local storage keys with a migration; rename the internal revenue field; move the package name; and, only if there is a customer reason, introduce new database role names through a planned migration.

## STEOS to Siamsil

The founder renamed the product from STEOS to **Siamsil** and adopted the Siamsil mark: a ring around four tiles in navy and gold. This section records that second rename. The sections above describe the SROS to STEOS rename and stay as written, because they are history.

### What changed

- `lib/branding.ts`: name `Siamsil`, full name "Siamsil Enterprise Operating System", logo paths, "Powered by Siamsil", and the footer. Page titles, the sign-in email subject, the fee label ("Siamsil fee") and the page description follow from it.
- The footer's second line used to read "STEOS is a product of Siamsil Technologies." It now shows the tagline, "One Platform. Every Business.", because "Siamsil is a product of Siamsil Technologies" reads badly. The first line is unchanged. **Founder to approve the wording.**
- The mark replaces the "S" tile in the sidebar, the phone header, the home page and sign-in (`app/brand-mark.tsx`). It switches to white and gold on the dark theme, because navy is unreadable on midnight navy. Files for places that need one are in `public/brand/`.
- Browser tab icon, `favicon.ico` and the phone home-screen icon were redrawn from the mark.
- `tests/branding.test.ts` now checks the Siamsil values and that no code or page text says STEOS.
- README, CLAUDE.md, AGENTS.md, `package.json`, the Dockerfile comment and every document that named the product.

### What was deliberately left unchanged

| What | Why |
| --- | --- |
| Local storage keys `steos:appearance` and `steos:customer-appearance` | Renaming resets each person's saved choice. Rename later with a read-old-write-new step. |
| Staging hostname `steos-staging.siamsil.org`, and the GitHub repository name `STEOS` | Hosting and repository settings are the founder's. See [DOMAINS.md](DOMAINS.md). |
| Container names `steos-smoke-*` in the CI script | Internal and invisible. |
| `docs/STEOS_MASTER_PLAN.md` | Renaming the file breaks links and history. The title inside says Siamsil. |
| `docs/releases/v1.0.0-rc.1.md` | A record of a past release. |
| Everything listed as unchanged in the sections above (database and role names, the `sr_session` cookie, routes, environment variables) | Production depends on them. |

### Still to do (founder)

- **The logo file.** The mark in the app is a redraw of the supplied picture, not a designer's final file. The supplied image has issues (soft edges, hard-to-read lettering, no dark version, and the "Kitchen Display System" subtitle that does not belong on the platform's main logo). Get a vector set before printing anything. The wordmark is typeset text, not the supplied lettering.
- **Trademark and ownership** of the name and the mark. Check before you spend on printing.
- **Where the old name still shows:** the staging address, the GitHub repository name, any Stripe statement descriptor or Connect branding, the Resend sender display name, and anything printed or sent already. None of these is set by this repository.
