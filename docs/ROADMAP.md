# SROS shared development roadmap

Owner: Mangpi Jasuan | Siamsil Technologies, LLC
Baseline: Phase 4, 513d079 on claude/practical-archimedes-hbvsl7. Recheck the current branch and existing PRs before implementation. This roadmap does not certify production readiness.

## Product direction

Preserve the existing Next.js/TypeScript, PostgreSQL/Drizzle, tenant isolation, Stripe Connect provider abstraction, shared orange/neutral design system, responsive staff navigation and dark kitchen display. No rewrite. Deploy to the existing Contabo VPS using Coolify and Cloudflare. Start with one restaurant and pickup-first ordering; enable dine-in and POS only after validating those workflows.

## Phase 5: Production readiness (v0.6)

All tickets below are P0 for the staging release. Acceptance evidence belongs in the PR and HANDOFF.md.

| ID | Task | Acceptance evidence |
|---|---|---|
| SROS-501 | Integrate Phase 4 | Review existing Claude branch, reconcile conflicts, verify build and database tests; owner approves merge |
| SROS-502 | Payment reliability | Durable payment operation and reconciliation records; recover interrupted and duplicate payment events; abandoned checkout cleanup; verify order/payment state consistency |
| SROS-503 | Stripe sandbox | Test Connect onboarding/configuration, authorization, acceptance/capture, decline, cancellation, expiry and refunds; reconcile against Stripe test records; never use live credentials for tests |
| SROS-504 | Tests and CI | Clean PostgreSQL test database with restricted app role and owner migrations; typecheck, build, integration suite and browser smoke tests in CI |
| SROS-505 | Contabo/Coolify staging | Reproducible container build, documented migration job, separate staging database, health check, scheduler, TLS and rollback procedure |
| SROS-506 | Recovery | Automated encrypted off-site backups, retention policy, restore rehearsal using non-production data, documented recovery time and recovery point objectives |
| SROS-507 | Operational hardening | Validate production configuration, role boundaries, rate limiting, trusted proxy settings, logging and alerts, privacy and retention; verify expiry worker and uptime monitoring |
| SROS-508 | Collaboration | Shared roadmap, handoff, decisions and release checklist maintained by both agents |

Sprint 6 already introduced Resend, sign-in confirmation, database rate limiting, logging, alerts and health checks. Verify and complete these rather than reimplementing them.

## Phase 6: First restaurant onboarding (v0.7, P1)

Platform owner dashboard, manual restaurant/location onboarding, staff invitations, Stripe connected-account status, business hours and restaurant settings, plan administration, fee statements and audit history. Minimum viable onboarding first; self-service later. Do not bill externally recorded POS or dine-in fees until an explicit billing model is approved.

## Phase 7: Commercial site and pilot (v0.9–v1.0, P1)

Keep the existing design system. Improve product marketing, public pricing after founder approval, demo requests, restaurant branding, mobile checkout, receipts and order notifications. Validate a supervised pilot and collect operational feedback before general availability.

## Phase 8: Restaurant operations (v1.5, P2)

Inventory, recipes and food cost, shifts, cash drawer, kitchen printers, customer directory, loyalty and accounting exports.

## Phase 9: Delivery and integrations (v2.0, P3)

Restaurant-managed delivery, delivery fees and zones, driver coordination, payment terminal evaluation, accounting and POS integrations where demand justifies them.

## Phase 10: Intelligence (v3.0, P4)

Sales forecasting, inventory demand, menu profitability, staffing recommendations and management summaries.

## Scope and decisions

Do not change pricing, fees, live payment configuration, core architecture, brand, or production infrastructure without founder approval. Do not promise an exact all-in processing rate where fees are estimates. Separate payment readiness from feature completion. No additional features are required for Phase 5.
