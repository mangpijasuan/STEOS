# STEOS product roadmap

A working plan, not a promise. Status words are literal: "built" means merged and tested, "not started" means no code.

## First 90 days: production readiness

| # | Priority | Status |
| --- | --- | --- |
| 1 | Complete the restaurant ordering platform | Built; waiting on real-payment testing |
| 2 | Launch Zogam Cafe as the first pilot, subject to the owner's approval | Menu imported in testing, storefront branded; needs prices for six dishes, hosting, a Stripe sandbox run and a live test order |
| 3 | Multi-tenant merchant onboarding | Partly: tenants, roles and a one-time importer exist; no self-service sign-up, no business-type choice, no timezone setting |
| 4 | Recurring SaaS subscription billing | Not started. Plans and fee estimates exist; nothing charges them or switches features on |
| 5 | Merchant and kitchen dashboards | Built |
| 6 | Validate checkout, payment and order workflows | Automated tests and browser checks done with a fake payment provider; real Stripe not tested |
| 7 | Automated deployment, monitoring and backups | Partly: CI runs on every pull request, a health endpoint and alerts exist; hosting, backups and a tested restore are not done |
| 8 | Universal product catalog | Not started. Today a "menu item" belongs to a restaurant |
| 9 | Barcode and basic retail POS | Not started |
| 10 | Convenience-store pilot | Not started |

## Payments: learn from Olo Pay, build on Stripe

We do not build our own processor or a card vault shared across businesses. We add what Stripe already offers.

- **At launch:** confirm Apple Pay and Google Pay appear at checkout on a real phone (Apple Pay needs the domain verified) and review Stripe's fraud-screening settings. Direct-ordering sites attract card testing; we have per-client request limits but no card-specific screening of our own.
- **Soon after:** handle disputes and chargebacks. The webhook handler does not listen for dispute events today, so a chargeback would only show in Stripe. Add the events, an alert, a line in reports, and one view that reconciles captures, refunds, disputes and fees against Stripe payouts.
- **Later:** one-click checkout for returning customers. Try Stripe's saved-card options (such as Link) first, and check how they behave with direct charges on a business's own account before promising it.
- **Billing STEOS itself:** a Stripe subscription for the platform fee, tied to a tenant so paying switches the plan on. Decide plans and prices first; that is the founder's call.

## Phases after the first 90 days

1. **STEOS Commerce:** finish Zogam Cafe, launch restaurant subscriptions.
2. **STEOS POS and retail:** barcodes, universal catalog, convenience-store pilot.
3. **STEOS Inventory and Supply:** stock, suppliers, purchasing.
4. **STEOS Finance:** accounting and bookkeeping.
5. **STEOS Enterprise:** ERP, training, safety, workforce and multi-location management.
6. **STEOS Intelligence:** AI and business automation.

Deferred until the first commercial platform is stable: full ERP, advanced accounting, fuel integration, payroll, manufacturing.

## Not now

A consumer marketplace; a driver network (if delivery ever comes, it starts with a business's own drivers or a partner's driver service); our own payment processor; a large redesign.

## Decisions waiting on the founder

Real prices for the six Zogam dishes and the owner's sign-in email; whether to add a timezone field (new tenants default to America/Chicago); how platform fees on till and pay-later orders are collected; whether declining a till-paid order stays open to staff; the plan and price for subscription billing; the trademark and entity questions in [REBRANDING_MIGRATION.md](REBRANDING_MIGRATION.md); and the Stripe, hosting and email accounts.
