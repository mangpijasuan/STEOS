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

