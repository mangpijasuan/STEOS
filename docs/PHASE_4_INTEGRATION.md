# SROS-501 integration handoff

The proposed Phase 5 roadmap, release checklist, and engineering handoff are under review separately. [PR #1](https://github.com/mangpijasuan/Siamsil-SROS/pull/1)

- Integration starts at `main` commit `f5c171d` (merged audit PR #2). Source for the feature ports is `513d079`. The source branch remains available for independent reviews.
- The foundation PR integrates the Sprint 6 differences before the feature ports. Main's shared rate-limit table and restricted authentication functions are the starting point. This PR adds operational alerts, a styled confirmation page, sender configuration compatibility, and worker readiness.
- Migration allocation on the integration path is `0011` for worker health, then `0012` for menu images, `0013` for tables, and `0014` for promotions and POS. Main's `0007` through `0010` stay in place. Port each feature migration with its code.
- The allocation assumes the target database is on the main migration history. An environment that ran the feature branch's migrations requires a separate inventory and reconciliation before these migrations are applied.
- Next feature PRs cover the photos and menu editor, tables and dine-in, till and promotions, then dashboard and navigation. Preserve the ordering-hours editor when integrating the menu UI.
- When porting tables and POS, expose a tenant-scoped staff display-name lookup for the table board and till. Preserve the runtime role's current restrictions on authentication data.
- When porting POS, record a settlement timestamp for cash and include it in financial reporting. When adding promotions to checkout, include the normalized promo code in the request fingerprint and account for previously stored fingerprints. Keep the audited payment retry and reconciliation behavior for dine-in and pickup.
- Rollout remains subject to the shared release checklist and founder approval. Configure the trusted client-IP header at ingress and subscribe the Stripe Connect webhook to the refund events documented in the README.
