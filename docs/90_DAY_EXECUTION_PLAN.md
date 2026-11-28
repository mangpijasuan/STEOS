# 90-day execution plan

**Primary objective: launch Siamsil Restaurant commercially and win its first paying customers.**

Written 2026-11-28 from the founder's approved direction. This page separates the long-term corporate vision from what is being built and sold now. It records decisions; it does not change pricing, production configuration or any code. Anything not yet verified is left blank on purpose.

## 1. Vision and execution are separate

| | Long-term vision | Immediate execution |
| --- | --- | --- |
| What | The whole Siamsil Technologies portfolio: restaurant, retail, church, safety, learning, language, literature, intelligence, research and more | Siamsil Restaurant, with POS, KDS and Ordering as modules of it, plus a limited Web service |
| Status | Kept as strategy. Not a commitment to build | Active development and launch |
| Where it lives | The founder's corporate plan; [PRODUCT_VISION.md](PRODUCT_VISION.md) for platform modules | This page, [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md), [LAUNCH_EVIDENCE.md](LAUNCH_EVIDENCE.md) |

Names and what each means: [PRODUCT_NAMES.md](PRODUCT_NAMES.md).

**Tagline decision (recorded):** "One Platform. Every Business." stays for the business software division and is what the product shows today (`lib/branding.ts`). "Empowering Business. Preserving Language. Advancing Intelligence." is the proposed corporate mission for Siamsil Technologies; it is not used in the product until the founder says where.

## 2. Product priorities

| Rank | Product | Decision |
| ---: | --- | --- |
| 1 | Siamsil Restaurant | Active development and launch |
| 2 | Siamsil POS | Module of Restaurant |
| 3 | Siamsil KDS (kitchen) | Module of Restaurant |
| 4 | Siamsil Ordering | Module of Restaurant |
| 5 | Siamsil Web | Limited revenue-generating service. Cash, not the main bet |
| 6 | Siamsil Language | Existing long-term research track |
| 7 | Siamsil Literature | Existing cultural mission |
| 8 | Siamsil Church | Customer discovery only, no build |
| 9 | Siamsil Retail | Deferred |
| 10 | Siamsil Safety | Deferred pending the founder's employment review |
| 11 | Siamsil LMS | Deferred |
| 12 | Siamsil ERP | Long-term vision |

Not started and not planned in these 90 days: Delivery (decided not to start now), Loyalty, Inventory, a shared identity service, monthly subscription billing.

## 3. The three windows

Day 1 is the day the founder starts the plan: **______________**. These are target windows, not promised dates.

### Days 1–30: production readiness

Goal: everything that must be true before a real customer pays.

| # | Gate | Owner | Evidence | Done |
| --- | --- | --- | --- | --- |
| 1 | Main is green: merged PRs, CI and e2e passing, clean build | Claude | CI link, commit | |
| 2 | Real Stripe **test-mode** run of scenarios A to I in [STRIPE_SANDBOX.md](STRIPE_SANDBOX.md), results recorded | Founder, Claude | Payment ids, dated notes | |
| 3 | Staging healthy: `/api/health` ok, separate owner and app database roles, worker supervised, robots off | Founder | Health output, date | |
| 4 | Backups scheduled off-server, retention written, **one real backup restored** with [BACKUP_RESTORE.md](BACKUP_RESTORE.md) | Founder, Claude | Restore time and result | |
| 5 | Real sign-in email arrives (Gmail and one other provider) | Founder | Screenshots, date | |
| 6 | Production address chosen once, before any QR code is printed ([DOMAINS.md](DOMAINS.md)) | Founder | Address | |
| 7 | Zogam owner returns [ZOGAM_OWNER_CONFIRMATION.md](ZOGAM_OWNER_CONFIRMATION.md): prices, tax rate, hours, prep time | Founder, Zogam owner | Signed page | |
| 8 | Kitchen tablet and printer tested at the restaurant | Founder | Notes | |
| 9 | Legal and policy items in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) section 9 | Founder | | |
| 10 | Owner approves the sandbox results in writing | Founder, Zogam owner | | |

Exit: every gate above is done, evidence recorded in [LAUNCH_EVIDENCE.md](LAUNCH_EVIDENCE.md), and the founder approves a controlled live test. **Live Stripe keys stay off until that approval.**

### Days 31–60: Zogam Cafe pilot

Goal: real orders, correct money, calm kitchen.

| Measure | Target | Actual |
| --- | --- | --- |
| Real customer orders completed | ______ | |
| Orders where Siamsil and Stripe amounts disagree | 0 | |
| Orders accepted within five minutes | ______ % | |
| Orders lost, duplicated or charged twice | 0 | |
| Refunds created and confirmed correctly | all | |
| Kitchen outages or tablet problems | ______ | |
| Owner satisfaction (weekly check-in, 1 to 5) | ______ | |
| Critical payment or security issues unresolved | 0 | |

Run it with a restricted window first (re-pause ordering on any failure). Settlement check: compare `/reports` with the Stripe Dashboard weekly; sales and refunds must match exactly.

### Days 61–90: commercial validation

Goal: find out whether this can be sold, and at what profit.

- Approach additional restaurants. Track every conversation below.
- Onboard only qualified customers (see section 5 for the support promise).
- Measure profitability per restaurant before taking more.

## 4. Customer acquisition (actual numbers only)

Fill this in as it happens. Do not estimate.

| Restaurant | Source | First contact | Demo | Agreed to pilot | Paying from | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Zogam Cafe (Tulsa) | Pilot | | | | | Pays DoorDash 15% today |
| | | | | | | |
| | | | | | | |

| Totals at day 90 | Number |
| --- | --- |
| Restaurants contacted | |
| Demos held | |
| Pilots agreed | |
| Paying locations | |

## 5. Operating costs and support

### Monthly operating costs (fill from real invoices)

| Item | Cost | Source |
| --- | --- | --- |
| Hosting (app and database) | $____ | Hosting invoice |
| Backup storage | $____ | |
| Email (Resend) | $____ | |
| Stripe fees on Siamsil's own account | $____ | Connect statement |
| Domain and certificates | $____ | |
| Monitoring and alerts | $____ | |
| Printer and tablet (pilot hardware) | $____ | Receipts |
| Legal and accounting | $____ | |
| Founder and contractor time | ____ hours | Time log |
| **Total** | **$____** | |

### Support requirements (to decide before taking more customers)

| Question | Answer |
| --- | --- |
| Who answers a restaurant on a Friday night? | |
| Support hours and channel (phone, text, email) | |
| Target response time for an outage | |
| Target response time for a billing question | |
| Written onboarding steps for a new restaurant | |
| Written steps when payments, orders or sign-in fail | |
| Who is on call, and what happens when they are not | |

Time spent on support per restaurant per week: ______ hours. Record it; it decides how many restaurants one person can serve.

### Profitability (per restaurant, monthly)

| | Amount |
| --- | --- |
| Siamsil fee earned | $____ |
| Minus card fees Siamsil bears (if any) | $____ |
| Minus hosting and tools share | $____ |
| Minus support time at $____/hour | $____ |
| **Contribution margin** | **$____** |

Do not forecast revenue here. Add projections only after real orders exist.

## 6. Gates before another independent commercial product

All of these, in writing, before work starts on a second commercial software product (Church, Retail, Safety, LMS or any other):

- [ ] Ten paying restaurant locations.
- [ ] Three consecutive months of reliable operation.
- [ ] Onboarding and support procedures written and used.
- [ ] Positive contribution margin after operating and support costs.
- [ ] No unresolved critical payment or security issue.

Customer discovery (conversations, not code) for Church, Safety and others is allowed at any time. Safety also needs the founder's employment and invention-assignment review first.

## 7. Pricing and technical decisions that do not change

- **Pricing:** the existing percentage-based options stay as they are (`lib/pricing.ts`). **No monthly subscription pricing** until the economics are compared and the founder formally approves a commercial model. Nothing here sets a price.
- **Technical:** one multi-tenant modular monolith, PostgreSQL row-level security, Stripe Connect. No new services, no separate apps per product, no shared identity service yet.
- **Payments:** Stripe stays in test mode until the founder approves live. "Siamsil Pay" is not a product; describe payments as "powered by Stripe".
- **Production identifiers** (database and role names, cookies, routes, environment variables) stay unchanged.

## 8. Risks to watch

| Risk | What to do |
| --- | --- |
| Stripe behaves differently from the fake provider | Scenario run before anything live; keep ordering paused until approved |
| One person supports every restaurant | Section 5 answers before customer two; stop taking customers when support time exceeds what is available |
| Zogam pays DoorDash 15% and may compare on price | Use the real comparison in [COMPETITIVE_COMPARISON.md](COMPETITIVE_COMPARISON.md) (if merged); never say "commission-free" |
| Orders lost on a bad deploy or database failure | Tested backups; worker health; rollback is redeploying the prior version |
| The rename and new logo confuse early customers | Settle names once ([PRODUCT_NAMES.md](PRODUCT_NAMES.md)); get a vector logo set before printing |
| Legal exposure (terms, privacy, tax, trademark) | Section 9 of the launch checklist; trademark check on the name and mark |
