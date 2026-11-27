# Order terminal

Phase 1 is an optional staff workspace at `/pos/terminal`, accessible from the standard till (`/pos`). The customer storefront and staff dashboard are unchanged. Both till views share a component, session-scoped menu and table APIs, server pricing, modifier selection, idempotent order submission, and existing payment and receipt workflow.

- Compact item rows with actual prices, availability, modifier entry and quantity in the ticket.
- Category sidebar on desktop; responsive category grid and existing ticket sheet on smaller screens.
- `/` focuses search; Alt+0 selects all and Alt+1 through Alt+9 select the first nine categories in menu order. Shortcuts do not run inside text inputs, selectors or while a modal is open.
- French navy, white and restrained gold accents, scoped to the terminal.
- The header reports menu/table load state only; it is not live connection or online-ordering telemetry.

Phase 2 adds inline editing of an unsent ticket line. Staff can change quantity, available modifiers and special instructions or cancel the edit. Required choices are checked before saving; a saved edit must receive a fresh server quote before payment or kitchen submission is enabled. Existing Clear is a local draft reset, not a void of a submitted sale.

Phase 3 introduced hold and resume. Phase 4 replaces the session-only list with database-backed held tickets (migration `0016_held_tickets.sql`). Up to 100 open drafts per restaurant can be shared across authorized staff workstations. Holding saves items, quantities, modifiers, notes, customer/table context, and an applied promo or valid owner discount; no payment or price snapshot is accepted. The last saved version survives refresh, failure or restart; edits to a resumed draft are not autosaved until Hold is pressed again. Unsaved changes trigger the normal browser leave warning. No sensitive information is saved to browser storage.

The list exposes only IDs, status, item counts and order type. Resume requires an empty active ticket and atomically claims the saved draft with a version and unique claim ID. An explicit Recover transfers a claimed ticket to a new workstation, invalidating the former claim; it restores the last saved snapshot, not another workstation's unsaved edits. A new quote is required on resume. An owner-only discount is not carried forward if staff resume the ticket. The list refreshes periodically and on window focus; a known stale claim disables payment. The actual submission transaction locks the draft, checks its claim and version, saves the priced order and payment (if selected), and marks the draft submitted in the same database transaction. A stable, separate held-order idempotency namespace prevents duplicate orders. A stale workstation cannot submit or rehold a recovered draft. Cancel only affects an unsent draft. Audit events record creation, recovery, rehold, cancellation and submission; closed draft payloads are cleared. Tenant RLS and composite foreign keys protect both tables.

Before live use, verify the migration and concurrency/tenant isolation tests with a disposable PostgreSQL 16 database, then test the physical cashier workflow on two workstations. Recovery is an explicit handoff, not a guarantee against an operator accepting cash outside the application. No Stripe integration, ticket splitting or live payment setting is changed.

The next phases require explicit product decisions and tests: split payment/ticket workflows, corporate accounts and a constrained command palette which previews ambiguous or consequential actions.

Verify with `npm run typecheck`, `npm test`, `npm run build` and `npm run e2e -- e2e/order-terminal.spec.ts e2e/till.spec.ts` against a disposable local database. Test desktop, tablet and phone; no real payment provider is needed.
