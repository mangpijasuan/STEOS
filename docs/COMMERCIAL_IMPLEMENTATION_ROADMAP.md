# STEOS commercial implementation roadmap — 2026-11-27

Status snapshot, not a release authorization. Existing production launch checklist remains governing; phase numbers here describe proposed competitive modules, not prior migration numbers.

## Immediate priority: first paying restaurant

Main includes enterprise Order Terminal via PR #41. PR #42 split payments is open and not merged; prior CI passed, independent review still required. Existing staging setup, menu seed and photos have been demonstrated earlier, but full current launch evidence is not established. Do not advertise all planned modules as available.

| Gate | Work | Responsibility |
| --- | --- | --- |
| G1 Code | Review PR #42, founder decides merge; verify clean main CI and migration sequence; review photo importer PR #37 | Claude implementation, Codex independent verification, founder merge |
| G2 Infrastructure | Confirm isolated staging, restricted origin, verified proxy configuration, worker heartbeat, monitoring, backup and successful restore, email deliverability | Founder configuration, Claude/Codex verify |
| G3 Payments | Run real Stripe sandbox end-to-end scenarios in docs/STRIPE_SANDBOX.md; captures, declines, expiry, duplicate events, refunds, payout/fee reconciliation, disputes | Founder account, Claude run, Codex verify |
| G4 Restaurant acceptance | Owner-approved menu prices, photos, hours, tax, actual phone/tablet/printer workflows and staff training | Founder and restaurant |
| G5 Commercial | Entity/agreements, approved fee model, production account, controlled live test, monitoring/support playbook | Founder |

All mandatory gates in docs/LAUNCH_CHECKLIST.md apply. Initial commercial scope is pickup; QR/till only after their separate acceptance. Delivery, loyalty and marketing stay disabled until tested. A green CI run alone does not constitute launch approval.

## Implement in ordered increments

| Priority | Module | Evidence/status | Next implementation |
| --- | --- | --- | --- |
| P0 | 5A split payments | PR #42 open | Review and merge by founder |
| P1 | 5B persistent ledger | Design | Partial collection, cancellation, accounting; item split and settled tender refunds later |
| P1 | 7 customer accounts | Design | Verified identity, history, reorder, transactional notifications |
| P1 | 10 website builder | Design | Reuse storefront data, publishing, verified custom domains and SEO |
| P2 | 6 delivery | Design | Fake provider, quote and fulfillment; real provider only after commercial approval |
| P2 | 8 loyalty | Design | Audited points, reservations, refund handling |
| P2 | 9 marketing | Design | Consent, mock outbox, owner-approved campaigns |
| P2 | 11 POS interoperability | Design | Square read-only catalog preview, sandbox order sync and fee review |
| P3 | 12 catering | Design | Inquiry and quote first, capacity next, deposits after payment ledger |
| P3 | 13 inventory/procurement | Planned | Recipe/stock tracking, supplier purchase workflows |
| P3 | 14 workforce | Planned | Scheduling and role-based operations |
| P3 | 15 multi-location | Planned | Location-level permissions, data and aggregate reporting |
| P4 | 16 intelligence | Planned | Descriptive analytics, forecasting after data quality is demonstrated |

Customer and website improvements can run independently of delivery, so prioritize real pilot feedback. No consumer marketplace is included unless founder explicitly changes product vision.

## Specifications (immutable branch commits)

- Phase 5B.1: https://github.com/mangpijasuan/STEOS/blob/226c18fbd94b895d52f96ab411ce1c793ef0e795/docs/PARTIAL_PAYMENT_LEDGER.md
- Phase 6: https://github.com/mangpijasuan/STEOS/blob/b9f5b99a5d2ded735e665b3d99dbbef2d2cd3522/docs/DELIVERY_FULFILLMENT.md
- Phases 7–8: https://github.com/mangpijasuan/STEOS/blob/2866b85f68fbeb23cb9dbb9ede8264f3655e14a8/docs/CUSTOMER_GROWTH.md
- Phase 9: https://github.com/mangpijasuan/STEOS/blob/48c26f12c18e960d2f0c1253a6af8eeb9b930515/docs/MARKETING_AUTOMATION.md
- Phase 10: https://github.com/mangpijasuan/STEOS/blob/67fc7859196d09af88d79bf9dd3b5390a35b665e/docs/WEBSITE_BUILDER.md
- Phase 11: https://github.com/mangpijasuan/STEOS/blob/89d60f0037676699fd11863d9d04c6d8533d0658/docs/POS_INTEROPERABILITY.md
- Phase 12: [Catering](CATERING.md)

## Commercial milestones, not calendar promises

1. First verified paid pickup order at Zogam Cafe after gates.
2. Complete controlled pilot; measure order success, refund accuracy, support time, repeat purchase and restaurant feedback.
3. Onboard up to five Tulsa restaurants with the proven scope; test onboarding cost, service capacity and subscription economics.
4. Introduce delivery and growth features incrementally when reliability and unit economics justify them.
5. Expand beyond Tulsa after documented repeatable onboarding, monitoring and support procedures.

Pricing proposals remain separate from approved pricing. Compare subscription, payment processing, messaging, onboarding, support, courier cost and taxes using real pilot data. No hidden fees or unverified savings claims.

## Engineering workflow

Claude implements on small topic branches from current main; Codex independently reviews; founder approves merge and deployment. Use new forward-only migrations, tenant RLS and composite references, immutable financial records, idempotent retries, explicit failure recovery, typecheck, PostgreSQL tests, production build, browser CI and Docker smoke. Each PR must state scope, acceptance tests, dependencies and migration/deployment notes. Never change live credentials, price or dispatch settings without founder authorization.
