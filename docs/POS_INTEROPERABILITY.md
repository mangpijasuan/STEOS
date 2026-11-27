# Phase 11 — POS interoperability

Proposed implementation specification. Native STEOS POS remains available; external integration is optional and disabled by default. No production account connection, external charges or order writes authorized by this design.

## 11A: Foundation and Square sandbox

- Introduce tenant/location-scoped provider connections, external catalog mappings, order mappings, synchronization attempts and events. RLS and composite foreign keys; unique provider account/location and external order mappings prevent accidental cross-tenant association. Store secrets securely at runtime, not in logs or source.
- Owner explicitly connects through provider OAuth with least required scopes; verified state and authenticated callback; handle expiry, revocation and disconnect. Sandbox and production credentials and IDs must never mix.
- Read-only catalog import first: preview item/variation/modifier mapping; retain external IDs and source revision; require owner confirmation before applying changes. No automatic deletion, price overwrite or duplicate catalog creation.
- Use adapter interfaces for catalog read, order export, status reconciliation, capability discovery. Keep provider-specific representations out of checkout logic. Explicit one-way sync ownership per field, conflict queue, manual resolution rather than last-write-wins.
- Preserve existing Stripe/manual payment lifecycle. Imported or exported external order metadata is not a payment confirmation. Never charge a second payment to mirror an order.

## 11B: Controlled order synchronization

- Durable outbox for accepted eligible orders. Stable idempotency key per logical export; map external order identifier once; on ambiguity reconcile before retry.
- Translate immutable item and modifier snapshots, quantities, tax, discounts, tip, fulfillment and total. Verify provider totals against STEOS; surface mismatches and stop export. Separate payment settlement and fulfillment statuses.
- Validate authenticated callbacks, deduplicate, process out-of-order events safely; bounded retries and visible failure state. Never loop a reflected event back to its origin.
- Test actual POS hardware workflows in sandbox or controlled authorized pilot: external order appearance, fulfillment, cancellation and receipts. Feature capability is not assumed merely because an API exists.
- Report provider volume separately, reconcile mapped orders, do not count mirrored revenue twice. Refund authority stays with the original payment provider; cross-provider refunds disabled unless explicitly designed and verified.

## 11C: Commercial gates

Square's Orders API documentation states a 1% transaction fee for orders using a non-Square payment provider. Verify merchant eligibility, current terms, consent and actual fees before enabling export of Stripe-paid orders. Compare native STEOS, catalog-only interoperability and Square-managed payment options with the founder; do not switch providers or silently absorb/pass through fees.

Official references:
- https://developer.squareup.com/docs/orders-api/what-it-does
- https://developer.squareup.com/reference/square/orders-api/create-order
- https://developer.squareup.com/reference/square/orders-api

Evaluate other providers only after a proven Square pilot; access and approval may be required. No claims of Toast, Clover or other integrations before sandbox verification.

## Acceptance

- Existing native checkout, POS, refunds and reporting unaffected when integration disabled.
- Tenant isolation on connections, mappings, callbacks and logs; revoked connection stops synchronization.
- Preview import is non-mutating; repeated import/export is idempotent; conflicts cannot silently overwrite owner changes.
- Duplicate or delayed provider events do not duplicate orders or financial entries; ambiguous responses reconcile.
- External totals mismatch and unavailable provider fail safely with staff-readable status.
- No raw card data, live charges or production credentials in tests. Typecheck, database tests, browser tests, build and Docker smoke before independent review.
- Founder approves actual fees, provider permissions, merchant account linking, pilot and release. No merge or deployment from this specification alone.
