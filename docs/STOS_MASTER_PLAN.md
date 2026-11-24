# STOS master plan

**STOS** is the Siamsil Technologies Operating System: one multi-tenant platform with configurable business modules. *The Operating System for Business. Sell. Manage. Automate. Grow.* It is a product of Siamsil Technologies and was previously named SROS.

This page is the short version of the plan. The detail is in [PRODUCT_VISION.md](PRODUCT_VISION.md), [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## What we are building

A platform a business runs for itself: its own storefront, customers, payments and operations, configured for its business type by turning modules on. We evolve the working restaurant platform. We do not start over, and we do not build a separate application for each industry.

## Where we are

- **Built and merged:** pickup ordering with card authorization and capture, QR dine-in with pay now or pay later, a staff till with discounts and receipts, a kitchen screen, a menu editor with photos, promo codes, an owner dashboard and reports, email sign-in, database-enforced tenant isolation, and CI. Zogam Cafe has a branded storefront and a menu importer.
- **Not yet proven:** real Stripe payments, real email delivery, a live restaurant, and any business type other than restaurants.
- **Not built:** recurring subscription billing, business-type onboarding with module flags, barcode and retail features, inventory, and everything else in the module list.

## Principles

1. Modular monolith first. No microservices until a real problem needs them.
2. One platform, many modules. Industries are configurations, not forks.
3. Tenant isolation is enforced in the database, not only in code.
4. Never store raw card data. Sensitive financial actions need explicit approval.
5. Keep working software working. Evolve; do not rewrite.
6. Build a module only when a paying customer needs it. Define its boundaries first.

## Sequence

1. Launch Zogam Cafe for real and learn from it.
2. Complete merchant onboarding and recurring subscription billing.
3. Retail foundations: a universal product catalog, barcodes, convenience-store pilot.
4. Inventory and suppliers, then finance, then the enterprise modules, then intelligence.

Full ERP, advanced accounting, fuel integration, payroll and manufacturing are deferred until the first commercial platform is stable.

## Decisions that belong to the founder

Pricing, fees and anything involving live payments; the trademark and legal-entity questions in [REBRANDING_MIGRATION.md](REBRANDING_MIGRATION.md); renaming production identifiers and the GitHub repository; and which modules to build next.
