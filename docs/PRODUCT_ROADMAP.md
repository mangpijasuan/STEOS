# Siamsil Restaurant — product roadmap

Founder-approved 90-day strategy. Dates are targets, not promises; each phase depends on the preceding release gates. Siamsil Restaurant is the selected product name pending commercial trademark clearance.

## Strategy

One Platform. Every Business. Start with independent restaurants operating their own storefronts, customers and payments. Zogam Cafe in Tulsa is the first pilot, subject to owner approval. No consumer marketplace or proprietary driver network.

## First 90 days

| Window | Priority | Exit criteria |
| --- | --- | --- |
| Days 1–15 | Code release and staging | Integrated CI, secure HTTPS staging, least-privilege database roles, health and worker checks, tested backup restore, verified email |
| Days 16–30 | Zogam sandbox pilot | Owner confirms menu, prices, hours and tax; mobile pickup, kitchen, QR and till acceptance tests; Stripe sandbox authorization, capture, refunds, webhook retries and reconciliation |
| Days 31–45 | First commercial pickup launch | Founder and restaurant approve fees, entity and payment setup, legal policies, security and operational gates; small live order and refund; monitor first week and reconcile daily |
| Days 46–60 | Stabilize pickup pilot | Reconcile actual orders and refunds; measure support time and restaurant satisfaction; delivery remains deferred |
| Days 61–90 | Validate additional restaurant demand | Learn from pilot, configurable tenant branding and timezone, documented onboarding, agreed fee collection and reconciliation, support and retention metrics |

## Current baseline

Merged: pickup authorization/capture, QR pay now/later, till discounts and receipts, kitchen, menu photos, promotions, dashboards, email-link authentication, database tenant isolation, Zogam storefront/importer, centralized branding, Docker build and health endpoints. PR CI passed for the integrated branding/deployment branch; live operation is not certified. Six Zogam dishes need owner-confirmed prices. Real Stripe, email delivery, physical devices/printer, staging and live restaurant acceptance remain unverified.

## Payment and commercial gates

- Pickup first. Pricing models remain experimental until founder and restaurant approve; no automatic plan switching. Record immutable order fee snapshots and reconcile actual processing fees, refunds and payouts.
- Verify sandbox authorization/capture, failed payments, cancellation, expiration, duplicate/delayed webhooks and refunds. Resolve material reconciliation gaps and establish dispute monitoring and handling before live launch.
- Check mobile wallet compatibility and fraud controls; do not promise Apple Pay, Google Pay or saved cards until tested with the actual Connect charge model.
- Till/pay-later fees are recorded but not automatically billed. Agree collection before charging; recurring subscription billing is not implemented.
- No live keys, real orders or courier dispatch until explicitly approved. See [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) once merged and [DEPLOY_COOLIFY.md](DEPLOY_COOLIFY.md).

## After pilot stability

Prioritize repeat ordering and opt-in loyalty, then merchant onboarding improvements; recurring billing only after founder approval based on customer demand. Retail/barcodes, universal catalog, inventory/supply, finance, enterprise and intelligence are future modules, not 90-day commitments. No rewrite, large redesign, proprietary payment processor or shared card vault.

## Founder decisions

Confirm six dish prices, owner email, timezone, tax and hours, fee plans and collection, till-paid cancellation authority, entity and trademark clearance, hosting/email/Stripe access, and explicit live launch approval.

## Operating discipline

Small tested changes, independent review, founder approval for merges and financial decisions. Track actual orders, completion rate, payment discrepancies, restaurant savings, contribution margin and support burden. No phase is complete until its exit criteria are evidenced.

The proposed [90-day execution plan](90_DAY_EXECUTION_PLAN.md) (PR #52, pending merge) is the detailed launch tracker; the proposed [product names](PRODUCT_NAMES.md) (PR #51) should be reviewed against the naming decision in [REBRANDING_MIGRATION.md](REBRANDING_MIGRATION.md). No independent commercial product before ten paying restaurant locations, three reliable months, documented support/onboarding, positive contribution margin and no critical payment/security issues. These are expansion gates, not forecast claims.
