# Order terminal

Phase 1 is an optional staff workspace at `/pos/terminal`, accessible from the standard till (`/pos`). The customer storefront and staff dashboard are unchanged. Both till views share a component, session-scoped menu and table APIs, server pricing, modifier selection, idempotent order submission, and existing payment and receipt workflow.

- Compact item rows with actual prices, availability, modifier entry and quantity in the ticket.
- Category sidebar on desktop; responsive category grid and existing ticket sheet on smaller screens.
- `/` focuses search; Alt+0 selects all and Alt+1 through Alt+9 select the first nine categories in menu order. Shortcuts do not run inside text inputs, selectors or while a modal is open.
- French navy, white and restrained gold accents, scoped to the terminal.
- The header reports menu/table load state only; it is not live connection or online-ordering telemetry.

Phase 2 adds inline editing of an unsent ticket line. Staff can change quantity, available modifiers and special instructions or cancel the edit. Required choices are checked before saving; a saved edit must receive a fresh server quote before payment or kitchen submission is enabled. Existing Clear is a local draft reset, not a void of a submitted sale.

The next phases require explicit product decisions and tests: durable held tickets, split payment/ticket workflows, corporate accounts and a constrained command palette which previews ambiguous or consequential actions. No payment or ordering availability changes are introduced here.

Verify with `npm run typecheck`, `npm test`, `npm run build` and `npm run e2e -- e2e/order-terminal.spec.ts e2e/till.spec.ts` against a disposable local database. Test desktop, tablet and phone; no real payment provider is needed.
