# STEOS Customers — CRM and loyalty (Phases 7–8)

Proposed implementation specification. Preserve guest checkout and tenant-owned customer relationships. Not implemented; no marketing sends, pricing change, or production enablement authorized. This module is independent of courier integration, and may be implemented earlier if the founder prioritizes pickup retention.

## Phase 7A: Customer identity and history
- Use a distinct customer authentication/session boundary from staff accounts. Verified email sign-in using the existing mail service pattern; short-lived, single-use tokens, rate limits, secure sessions and logout. Never grant staff permissions from customer identity.
- Customer records scoped by restaurant; an authenticated account may access only its own verified relationship with that restaurant. No automatic cross-restaurant linking, discovery or shared marketing lists.
- Preserve guest checkout. Explicitly associate new orders with verified customer identity when signed in; never claim historical orders merely because a typed email or telephone matches. Provide a separately verified claim flow if needed.
- Customer portal: profile, order history, receipt, favorites, repeat order. Reorder revalidates current menu, availability, modifiers and prices; user approves changed or unavailable items before checkout.
- Owner CRM: searchable customer list, visits, last order, lifetime net purchase amount, and consent state. Staff permissions restrict sensitive contact information and exports. No public exposure of internal order IDs or contact data.
- Provide export, correction, deletion request and retention controls. Preserve minimum financial records required by applicable policies, with personal data separated from accounting snapshots. Review applicable privacy obligations before launch.

## Phase 7B: Transactional notifications
Durable outbox for order confirmation, acceptance, ready-for-pickup and delivery updates when delivery exists. Record intent and deduplicate by order plus event, retry bounded transient failures, track provider IDs and delivery status. Transactional notices must not contain marketing add-ons. Use verified contact destinations, minimize information, and do not expose other diners. Test with fake mail/SMS adapters first. Marketing is a separate opt-in module.

## Phase 8A: Restaurant-specific loyalty
- Owner-configurable program with explicit earn rate in integer points per eligible cent, redemption conversion, minimum redemption, maximum discount, expiry rule, and activation date. Founder approves initial commercial settings. No transferable or cash-redeemable balances.
- Tenant-scoped immutable event ledger: earn, redeem, release reservation, refund reversal, expiration and authorized adjustment. Reference order and actor; unique idempotency keys, composite foreign keys and RLS. Lock customer wallet before any mutation.
- Earn only after eligible captured/completed sales according to a documented rule; exclude tax, tip, delivery and refunded amounts by default. No earnings for unpaid orders. Persist rule snapshot on each award.
- Reserve points during checkout, commit only when order reaches the defined successful state, release on failure/expiry. Checkout retry cannot double spend. Recheck cart and redemption server-side; preserve promo compatibility policy and current platform fee rules.
- Full refund reverses earned points and returns eligible redeemed points once. Design future partial-refund allocation before enabling coexistence with individual tender refunds; keep unsupported cases disabled. If previously earned points were spent, record a transparent adjustment rather than silently creating value.
- Show balance, activity and redemption preview. Owner reports issued, redeemed, outstanding and expired points. No monetary liability accounting claim without accountant review.

## Phase 8B: Campaign foundations
Maintain per-restaurant per-channel consent with timestamp, source, withdrawal and suppression. Separate promotional email/SMS from service notices. Honor unsubscribe and do-not-contact across retries. Do not infer consent from purchases or staff-uploaded contacts. Legal review and provider configuration before any promotional sends. Start with manual owner-approved campaigns and mock delivery. Add occasion reminders and win-back segmentation only after consent and attribution are proven.

## Acceptance criteria
- Guest checkout unchanged; verified user sees only own orders; cross-tenant and cross-customer data access denied.
- Reorder with changed prices/options forces review; no duplicate checkout on retry.
- Concurrent redemptions cannot overspend points; duplicate completion/refund callbacks do not duplicate awards or reversals.
- Declined, canceled or expired order releases uncommitted reservations; no rewards on unpaid tickets.
- Owner adjustments auditable; staff cannot export or adjust without permission.
- Marketing disabled by default; withdrawn consent prevents pending promotional sends.
- Database integration, browser tests on all viewports, typecheck, build and Docker smoke tests pass. Verify via fake providers in staging; founder approves merge and release.

## Delivery order
1. 7A: authenticated customer portal and owner CRM on a separate topic branch.
2. 7B: reliable transactional notifications.
3. 8A: points and rewards ledger; reconcile with advanced payments.
4. 8B: consent-aware marketing foundations; real provider testing and commercial validation.

Pilot with Zogam Cafe. Measure repeat-order rate, customer activation, redemption costs, opt-in rates and support effort before expanding. Keep the restaurant relationship local; no consumer marketplace or cross-restaurant advertising.
