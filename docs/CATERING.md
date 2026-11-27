# Phase 12 — Catering and scheduled orders

Proposed specification, not deployed. Preserve ordinary pickup scheduling, existing checkout, native POS and pricing. Catering disabled by default per location. No new live payment authorization, discounts, credit terms or courier dispatch.

## 12A: Inquiry and quotations
- Owner configures catering packages, tray sizes, serving ranges, minimum quantity, minimum order, lead time, eligible fulfillment methods and capacity. Reuse existing menu and modifier data where appropriate. Display explicit serving estimates, not unsupported guarantees.
- Customer inquiry captures event date, headcount, contact, location and requested items; clearly state inquiry is not a confirmed order. Guest inquiry allowed; authenticated customers may see only their own requests.
- Staff creates versioned itemized quote: food, discounts, tax, service/delivery fees, total, deposit requirement, expiry, schedule and cancellation terms. Customer accepts exact revision through authenticated or scoped expiring link. Quote revision invalidates previous acceptance; never change accepted amounts silently.
- Tenant/location scoped inquiries, quotes, lines, reservations, events and order references; RLS and composite foreign keys. Minimize personal data and restrict contact visibility. Rate limit public inquiries.

## 12B: Capacity and preparation
- Restaurant timezone, capacity slots, exceptions, holidays, preparation cutoff and lead-time rules. Schedule defined in local time with unambiguous UTC instant; test DST gaps and repeated times.
- Transactionally reserve capacity on quote acceptance, with expiry if deposit is required; avoid double booking under concurrency. Release on rejection/expiry/cancellation. Never promise fulfillment until restaurant confirms.
- Dashboard shows upcoming events, prep quantities, deadlines, status, owner and handoff. Keep catering distinct from immediate kitchen queue; release preparation at configured time. Staff can print a production list without unnecessary customer data.

## 12C: Deposits and settlement
- Start quote-only with no card collection. Next support manual confirmed deposits and final settlement after Phase 5B verified.
- Use dedicated audited payment schedule and ledger tied to order; net received, amount due, deposit refund rules and receipt snapshots. Preserve integer-cent totals and one recognized completed sale; no duplicate recognition across deposit and final collection.
- Online deposits require a separately reviewed payment lifecycle: do not rely on a card authorization remaining valid until a future event. Use verified provider capabilities, explicit consent for subsequent charges, independent idempotency and refund reconciliation. No automatic future card charge in initial release.
- Never treat a quote as paid or invoice issued as collected. Corporate credit/invoicing is later, subject to founder-approved policy, due dates and reconciliation.

## 12D: Group and corporate orders
Later increment: coordinator creates a bounded, expiring group invitation, participants select items, coordinator reviews aggregate cart and submits once; no shared payment details. Individual contributor payment/refunds depend on advanced ledger design. Business accounts, recurring schedules, catering delivery and credit terms require independent acceptance criteria.

## Acceptance
- Ordinary pickup and QR/POS flows unchanged; catering toggle defaults off.
- Expired or changed quote cannot be accepted; duplicate approval cannot create duplicate order or reservation.
- Two concurrent bookings cannot exceed capacity. Failed payment or expired reservation releases capacity with auditable state.
- Deposit plus final payment reconciles to exact total; refund/cancel paths do not lose collected funds. No live card tests.
- Tenant isolation, owner role controls, private guest views, timezone boundary tests, mobile/tablet/desktop, database CI, typecheck, production build and Docker smoke checks.
- Founder approves prices, deposit/cancellation policy, actual capacity, test provider and pilot. Begin at Zogam Cafe with inquiry-only workflow.
