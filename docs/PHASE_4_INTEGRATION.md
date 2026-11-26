# SROS-501 integration handoff

The proposed Phase 5 roadmap, release checklist, and engineering handoff are under review separately. [PR #1](https://github.com/mangpijasuan/Siamsil-SROS/pull/1)

- Integration starts at `main` commit `f5c171d` (merged audit PR #2). Source for the feature ports is `513d079`. The source branch remains available for independent reviews.
- The foundation PR integrates the Sprint 6 differences before the feature ports. Main's shared rate-limit table and restricted authentication functions are the starting point. This PR adds operational alerts, a styled confirmation page, sender configuration compatibility, and worker readiness.
- Migration allocation on the integration path is `0011` for worker health, then `0012` for menu images, `0013` for tables, and `0014` for promotions and POS. Main's `0007` through `0010` stay in place. Port each feature migration with its code.
- The allocation assumes the target database is on the main migration history. An environment that ran the feature branch's migrations requires a separate inventory and reconciliation before these migrations are applied.
- Next feature PRs cover the photos and menu editor, tables and dine-in, till and promotions, then dashboard and navigation. Preserve the ordering-hours editor when integrating the menu UI.
- When porting tables and POS, expose a tenant-scoped staff display-name lookup for the table board and till. Preserve the runtime role's current restrictions on authentication data.
- In the tables port, add regression tests proving that dine-in pay-later orders stay out of card expiry and refund processing while eligible card orders still go through those paths.
- When porting POS, record a settlement timestamp for cash and include it in financial reporting. When adding promotions to checkout, include the normalized promo code in the request fingerprint and account for previously stored fingerprints. Keep the audited payment retry and reconciliation behavior for dine-in and pickup.
- Rollout remains subject to the shared release checklist and founder approval. Configure the trusted client-IP header at ingress and subscribe the Stripe Connect webhook to the refund events documented in the README.

## Photos and menu port (migration 0012)

- Branch `integration/photos-menu`, based on `integration/sprint-6-foundation`. Adds the `images` table and `menu_items.image_id` (0012), owner-only upload, public serving, orphan cleanup in the order worker, the menu editor at `/menu`, and photos on the existing storefront.
- `/manage` keeps the ordering settings and weekly hours editor unchanged. Its plain menu forms are replaced by a link to `/menu`; per-option availability, which only those forms offered, is now a switch in the new editor.
- The design system arrives scoped under `.ds` (`app/ds.css`) so other screens do not change. The remaining screens (kitchen, storefront, order page, login, dashboard, reports, pricing) still need to be moved over; that port must keep this branch's behavior (kitchen paging and error handling, derived pickup selection, retry header in checkout, refund and net fields in reports).
- Tests: image rules, file-type detection, tenant isolation, serving and cleanup (11 tests). Verified in a browser on a fresh database: upload, add-ons, out-of-stock option, reload, customer photos, hours and settings saves.

## Tables and dine-in port (migration 0013)

- Branch `integration/tables-dinein`, stacked on `integration/photos-menu` (it needs the scoped design system). Adds floors, tables, QR codes, guest requests and table orders (0013), the table board at `/tables`, the QR print sheet, and `/t/<code>` for guests.
- Handoff items handled: a tenant-scoped staff display-name lookup (`tenant_staff_directory()`, names only; `staff_users` stays revoked from the runtime role); cash payments are stored with `captured_at` so reports count them; the retry header and idempotency behavior apply to table orders; the checkout fingerprint gains the table and payment choice only for table orders, so stored pickup fingerprints keep matching.
- Dine-in pay-later stays out of card paths, with tests: the sweep and refund reconciliation skip pay-later orders while card orders still go through them, and a database constraint forbids a deadline on a pay-later order.
- Differences from the feature branch: the guest page reuses this branch's audited storefront and checkout (a table mode) instead of the redesigned storefront, which is a later port. Kitchen cards gain the table and payment state; the customer status page and `/manage` settings gain the dine-in toggles.
- Still to come: till and promotions (0014), dashboard and navigation, and moving the remaining screens to the design system.

## Till and promotions port (migration 0014)

- Branch `integration/till-promos`, stacked on `integration/tables-dinein`. Adds promo codes, discounts, till orders and receipts (0014), `/pos`, `/promos` and the receipt page, and a promo field on the existing storefront and checkout.
- Handoff items handled: the normalized promo code is in the checkout fingerprint only when a code is used, so stored fingerprints keep matching; cash and manual payments keep their capture time; the audited retry and reconciliation behavior is untouched.
- Additions beyond the feature branch: promo uses are returned for orders that never complete (declined, expired, payment failed or cancelled), till requests use a keyed fingerprint instead of comparing totals, and `created_by` has a same-restaurant composite key.
- Founder decision (resolved): the STEOS fee stays on the food at its full price, before discounts. Discounts are the restaurant's cost. The fee is still capped at the amount charged.
- Still to come: dashboard and navigation, and moving the remaining screens to the design system. Till and promo pages are on the scoped design system; the storefront promo field is in the existing style.

## Dashboard and navigation port (no migration)

- Branch `integration/dashboard-nav`, stacked on `integration/till-promos`. Adds the side navigation, the dashboard, the orders page, charts, order history, category sales and the period comparison. Read-only data, so no migration.
- Differences from the feature branch, to keep Codex's reporting semantics: the headline "Sales", the daily chart and the "vs last period" change use sales after refunds (`netChargedCents`, and `refundCents` per day), not gross captured money, and the summary comparison carries `netChargedCents`.
- The feature navigation had no entry for Hours & settings. It is kept in the Manage group for owners, because the ordering-hours editor at `/manage` must stay reachable.
- Staff still mark dishes sold out from `/menu`. The new dashboard no longer has those toggles.
- Still to come: moving the remaining screens (kitchen, storefront, order status, login, reports, pricing, hours and settings) onto the design system, which will bring them the side menu.

## Remaining screens on the design system (no migration)

- Branch `integration/design-system-screens`, stacked on `integration/dashboard-nav`. Moves the kitchen, storefront, checkout, table page, order status, reports, pricing, hours and settings, sign-in and the home page onto the design system. Every screen except the server-rendered sign-in confirmation page is now on it.
- The audited behavior was carried over screen by screen, not copied from the feature branch, which predates it: kitchen paging, abort and error handling; the derived pickup time and keyed quote; the checkout attempt key and retry proof; the order page's refund message; reports' refund and net fields; the hours editor; and the sign-in messages. Each was exercised in a browser against the built-in fake payment provider, not a real Stripe sandbox, including failures (a dropped connection, a failed refund, a request that dies mid-flight, a pending refund settling).
- Beyond the feature branch: the order API returns the table, the restaurant slug and the discount; the order page keeps polling until a pending refund settles; a table guest who switches between paying now and later starts a fresh attempt instead of reusing a request key; the hours editor is laid out by day (it still saves the same list of periods).
- `legacy.css` now only frames pages outside the design system, such as Next's 404 page.

