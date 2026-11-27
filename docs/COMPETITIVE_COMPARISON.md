# STEOS vs ChowNow: one-page comparison

Prepared 2026-11-27 for the founder. Fees and plans are the founder's decisions; nothing here changes them. Plan numbers for STEOS are the unapproved experiments in `lib/pricing.ts`.

## Where the facts come from

| Fact | Source | Status |
| --- | --- | --- |
| ChowNow plans, fees, features | [get.chownow.com/pricing](https://get.chownow.com/pricing/), read 2026-11-27 | Verified on their page |
| 7.5% diner "Support Local Fee" | [ChowNow support page](https://get.chownow.com/restaurant-support/does-chownow-charge-a-fee-for-diners/) | Verified. Their page says it applies only to orders on the ChowNow App or eat.chownow.com (their marketplace). |
| "22% average commission" and "$16K saved a year" | ChowNow's own marketing | Their claim, not independently verified |
| DoorDash and Uber Eats drive more new-customer discovery; support complaints | Third-party blogs, G2, Reddit, Facebook | Unverified, anecdotal |
| Contract term, cancellation, free trial | Not on ChowNow's pricing page | Unknown. Ask them or read their Terms. |

## ChowNow, as published

| | Launch | Grow | Elevate |
| --- | --- | --- | --- |
| Price per month, billed annually (monthly billing) | from $229 ($249) | from $319 ($349) | from $409 ($449) |

Extra costs: setup fee $119 to $499; card processing 2.95% + $0.29 per transaction; $99 a year Apple developer fee for the branded app; printer $250 to $420; $7.98 per order for Flex Delivery.

Includes: direct ordering, a Squarespace website, a branded app, a commission-free marketplace and discovery listings (Google, Apple Maps, Yelp and others), catering, QR ordering, email and SMS marketing, loyalty, fraud and chargeback protection, 30+ POS integrations, third-party order aggregation, reporting and 24/7 support. The page does not make clear which tier has which feature, only that the lowest tier lacks some marketing and aggregation extras.

## Monthly cost to the restaurant

Assumptions: $25 average order, no tax, tips or discounts; ChowNow Launch billed annually, without setup, printer or app fees; Stripe's card fee at 2.9% + $0.30 (about the same as ChowNow's 2.95% + $0.29). The marketplace column uses ChowNow's 22% figure, commission only.

| Orders per month | ChowNow Launch | STEOS 3% + card fees | STEOS 6% all-in | STEOS 7% founding | STEOS growth plan* | Marketplace at 22% |
| --- | --- | --- | --- | --- | --- | --- |
| 300 | $537 | $533 | $450 | $525 | $762 | $1,650 |
| 1,000 | $1,257 | $1,775 | $1,500 | $1,750 | $2,354 | $5,500 |
| 3,000 | $3,312 | $5,325 | $4,500 | $5,250 | $6,904 | $16,500 |

\*5% + card fees + $79 a month; not available yet because monthly billing is not built.

**Where STEOS is cheaper than ChowNow Launch:** below about 306 orders a month on the 3% plan, 485 on the 6% all-in plan and 317 on the 7% founding plan. The growth plan is cheaper only below about 120, so as designed it does not work against ChowNow.

**Against a marketplace**, every STEOS plan saves most of the commission: at $25 an order, 6% all-in costs $1.50 against about $5.50.

## Zogam Cafe: what we know so far

The cafe pays DoorDash **15%** (reported by the founder). Still to confirm from a DoorDash statement: which DoorDash plan, whether the 15% is for delivery or pickup orders, and whether card processing is charged on top.

Cost per order moved from DoorDash to direct ordering, by order size:

| Order | DoorDash at 15% | STEOS 6% all-in | STEOS 7% founding | STEOS 3% + card fees |
| --- | --- | --- | --- | --- |
| $15 | $2.25 | $0.90 | $1.05 | $1.19 |
| $25 | $3.75 | $1.50 | $1.75 | $1.78 |
| $35 | $5.25 | $2.10 | $2.45 | $2.37 |

At a $25 order the cafe saves about $2.00 to $2.25 for each order that moves from DoorDash to direct, so every 100 orders moved saves roughly $200 to $225 a month. That is a smaller saving than against a 22% marketplace.

Cautions:

- The saving only applies to orders that would otherwise go through DoorDash. A customer who would have phoned or walked in costs the cafe a new fee on a direct order.
- STEOS has no delivery. Only DoorDash pickup orders can move, so the real saving may be smaller than the table suggests.
- DoorDash may charge card processing separately, which would make the comparison more favorable to STEOS. Confirm before quoting a number.

## Zogam Cafe worksheet (fill in the rest)

1. Direct orders a month: ____   Average order: $____   Marketplace orders a month: ____
2. What the cafe pays DoorDash a month (15% commission and any other fees): $____
3. STEOS cost = orders × average order × plan rate (6% all-in, or 3% plus card fees of 2.9% + $0.30 per order).
4. Saving if marketplace orders move to direct ordering = line 2 minus line 3 for those orders.

## Where STEOS can win

- **Small and new restaurants:** a percentage with no setup fee or monthly bill is cheaper and less risky than a $229 subscription plus setup.
- **All-in-one stack:** direct ordering, QR dine-in with pay-at-table, a till with split payments and a kitchen screen under one login, with no POS to integrate.
- **Direct money:** card payments go to the restaurant's own Stripe account.
- **No diner fee** on the STEOS storefront as built today (check before using it in marketing).
- **Founder-led support** for the pilot restaurants.

## Where STEOS loses today

- **Discovery:** no marketplace, and no listings on Google, Apple Maps or Yelp.
- **Marketing and loyalty:** no email, SMS or rewards. Customers get no message when an order is ready.
- **Protection:** no dispute or chargeback handling.
- **Support and scale:** no 24/7 support, no POS integrations, no flat-fee plan for busy restaurants, no track record.

## Rules for what we say

- **Do not say "commission-free".** STEOS takes a percentage per order. Say "a much lower rate than marketplaces, and no monthly fee".
- Quote ChowNow's figures only with their source and date, and call their 22% and $16K "their claim".
- Do not promise features that are not built (notifications, loyalty, disputes).

## Decisions for the founder

1. Redesign or drop the growth plan, and decide whether to offer a flat monthly plan for busier restaurants (needs monthly billing).
2. Whether discovery listings (Google, Apple Maps, Yelp) go on the roadmap.
3. The order of customer notifications, loyalty and dispute handling.
4. Which restaurants to target first: small, direct-ordering restaurants like Zogam, not high-volume ones.
