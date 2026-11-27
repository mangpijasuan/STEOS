# Phase 6 — Delivery fulfillment engine

Proposed engineering specification. No production courier dispatch or pricing changes authorized. Start with a fake provider, disabled by default per restaurant. Founder approves commercial rates and launch.

## 6A: Core and simulation

Preserve existing pickup, counter, dine-in and payment flows. Introduce delivery as an explicit order fulfillment type, with new forward-only migrations after the latest merged migration. Audit order-type constraints, checkout fingerprints, public order projections, staff order filters, receipts and reporting; never reinterpret existing pickup orders.

- Per-location delivery settings: enabled, eligible service areas, delivery hours, minimum food subtotal, prep time, customer fee rule. Begin with explicitly configured postal-code zones; do not claim street-level distance accuracy.
- Require a normalized delivery address, contact phone and optional instructions. Keep private address/contact data in tenant-isolated records, restrict staff visibility to operational need, never publish or log it.
- Quote server-side with integer cents: food, discount, tax, delivery fee, tip and total. Store an expiring quote bound to location, cart, address and fulfillment time. Reprice at checkout; changed price requires customer confirmation. Preserve existing fee basis for food and separately account for courier expense. Validate applicable taxes before live launch.
- Require online payment for delivery initially. Keep current authorization/capture lifecycle, including idempotency and refund recovery. No card data storage. Do not allow any dispatch before confirmed capture and restaurant acceptance.
- Fake provider returns deterministic test quotes and simulated lifecycle events; no external calls. Maintain distinct customer fee and courier cost snapshots. Delivery fee and subsidy configurable only by owner, with founder-approved defaults.
- Data model: fulfillment record per order, delivery quote, dispatch attempt, append-only delivery events and durable dispatch outbox. Composite tenant foreign keys and RLS. Unique provider delivery IDs and immutable event keys. Never allow another tenant to read address or dispatch status.

## 6B: Provider integration

A provider interface exposes quote, create, fetch status and cancel capabilities. Choose first real provider only after commercial approval, official API review, sandbox access and coverage validation in Tulsa. DoorDash Drive and Uber Direct are candidates, not promised integrations.

Use durable outbox and stable provider request IDs. Never retry an ambiguous dispatch with a new ID. Reconcile status first. Authenticate provider callbacks, deduplicate events, validate transitions, and handle out-of-order updates. Retry bounded transient failures; escalate unresolved attempts to staff. Keep provider credentials runtime-only.

## 6C: Tracking and operation

Separate food preparation status from fulfillment status: quoted, dispatch pending, assigned, picked up, delivered, canceled or exception. Kitchen-ready does not mean delivered. Define explicit permitted transitions. Customer sees approved tracking link/status and estimated arrival; no other customer's contact information. Staff can review dispatch failures and contact customers through authorized workflows. Notifications are opt-in where required and transactional alerts are distinct from marketing.

## 6D: Reconciliation and cancellation

Persist actual courier charges separately from quoted estimates, customer delivery income and platform fees. Reconcile order and delivery identifiers and expose charge discrepancies. Cancellation before dispatch, after assignment and after pickup have different outcomes; avoid automatically promising a refund when courier charges are irreversible. Reconcile actual provider cancellation response and customer refunds separately. Track who approved an exception.

## Acceptance tests

- Existing pickup, table, POS and split payment flows unchanged.
- Delivery disabled by default; outside zone, closed hours and below minimum rejected.
- Stale quote or changed cart requires requote; cents and taxes consistent between quote, charge, receipt and report.
- Failed or declined payment never dispatches. Repeated checkout, worker retry and duplicate callbacks never create duplicate dispatch.
- Lost dispatch response reconciles original attempt. Conflicting or late events do not regress terminal status.
- Tenant isolation on settings, address, quote, fulfillment and events; guest receives only own authorized tracking.
- Courier outage and cancellation exercise explicit recovery states.
- Mobile, tablet and desktop checkout; database integration, typecheck, production build, browser CI and Docker smoke checks.

## Release sequence

1. Separate topic branch for 6A, after reviewing latest main and migration allocation.
2. Independent review and founder approval; staging fake provider only.
3. Provider approval, sandbox proof, actual unit economics and support playbook.
4. Controlled pilot at Zogam Cafe with staff training, verified refund/cancellation processes and founder approval before live dispatch.
5. Measure quote-to-order conversion, on-time delivery, delivery cost, exception rate and net contribution. Expand only when reliable.

This design does not assume that a percentage of food subtotal covers courier costs. Use actual courier quotes, transparent customer fees and explicitly budgeted restaurant subsidies.
