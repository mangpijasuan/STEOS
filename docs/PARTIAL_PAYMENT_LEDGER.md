# Phase 5B.1 — Persistent manual payment ledger (implementation specification)

Status: proposed; dependency PR #42 (Phase 5A) must pass independent review and merge before implementation is merged. No changes to live payment configuration, subscriptions, or fees.

## Scope

Record externally collected manual tenders against an existing accepted, ready or completed pay-later order. Preserve one aggregate payment per order as the completed-sale authority. No automated card charging, item allocation, or post-settlement partial refunds in this increment.

## Data and invariants

- Add a tenant-scoped append-only collection and reversal ledger, linked by composite foreign keys to orders and staff identities. Use positive integer cents, explicit event kind, method, immutable timestamp, idempotency key and actor. Reversal references a specific collection and cannot exceed its unreversed amount.
- Protect tenant ownership with database RLS and least-privilege grants. No raw card data, no free-form card details.
- Lock the order row before reading the outstanding amount or recording any event. Revalidate status, mode, total and payment state in the same transaction. Serialize competing terminals and all legacy payment/cancellation paths. A matching retry returns the original result; conflicting reuse of a key returns 409.
- Net collected = collections minus reversals. Remaining = order total minus net collected. Reject amounts above remaining, zero, negative or noninteger values. Do not mark paid until remaining is zero.
- Prevent legacy full-pay endpoints from settling a partially collected order independently. At full collection, atomically create the existing aggregate captured payment and complete its manual tender breakdown. Do not double count any ledger amount in existing sales reports.
- Preserve migration 0017 and existing fully settled orders. Design migration forward-only with no destructive data rewrite. Explicitly resolve how settlement breakdown accommodates multiple collections and reversals without exceeding the existing 20-position limit; reject unsupported cases rather than silently truncate.
- Prevent totals edits and cancellation while an outstanding collected balance exists. Owner may record confirmed external returns against each collection; cancellation becomes eligible when net collected is zero. Never infer that money has been returned. Existing post-settlement full refunds retain their historical behavior. Individual post-settlement refunds are separate work.

## UI and API

- Staff receipt and table dashboard display total, collected, remaining, payment history and timestamp. Use a consistent statement snapshot for payment-related reads.
- Record payment dialog shows cash/external terminal/other, amount and explicit confirmation that funds were received; never asks for card credentials.
- For retried or uncertain responses, retain the idempotency key and reconcile the exact recorded transaction before permitting another collection. Reopening from another terminal fetches the server ledger.
- Staff can collect; only owners can record confirmed reversals. Show partial payment status on kitchen/table views; do not allow ordinary cancellation or clearing to lose a balance.
- Print individual collection receipts marked partial when balance remains. Preserve existing settled receipt layout.
- Reporting: distinguish cash received by event date from recognized completed-sale gross by settlement date. Display unresolved collected balances and reversals separately; reconcile both views without counting money twice.

## Acceptance matrix

| Scenario | Expected |
| --- | --- |
| $120 order, $40 cash then $30 external terminal | $70 collected, $50 remaining; no aggregate captured payment |
| Reopen after process restart | Same ledger, same remaining balance |
| Simultaneous $50 and $60 against $50 balance | Only valid settlement succeeds; no overpayment |
| Exact retry after lost response | Same collection, no duplicate |
| Reuse key with changed amount/method/order | Conflict, no mutation |
| Final $50 | Exactly one captured aggregate; complete bill; closed balance |
| Standard pay route during partial collection | Conflict, no second payment |
| Cancellation before confirmed reversal | Conflict; recorded funds retained |
| Owner confirms reversal, duplicate retry | Exactly one reversal |
| Other tenant accesses order or ledger | Not found; database prevents cross-tenant access |
| Reporting across midnight | Cash event date and completed-sale date independently reconcile |
| Existing unpaid, fully paid, and refunded orders | Prior semantics preserved |

## Delivery and release gates

Implement on a new topic branch after reviewing current main and PR #42. Run typecheck, PostgreSQL integration tests, production build, browser tests on all viewports and Docker smoke tests. Review ledger and migration independently. Verify staging using fake/manual tenders only; founder approves merge and deployment. Phase 5B.2 item-level allocations, Phase 5B.3 settled tender refunds, and Phase 6 delivery are follow-ups. Do not dispatch live couriers or modify payment pricing as part of this work.
