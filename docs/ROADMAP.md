# SROS roadmap (one page)

Last updated 2026-11-24. This is a working plan, not a promise. Detailed steps for launch are in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) once it merges.

## The bet

SROS is the ordering system a restaurant runs for itself: its own storefront, its own customers, its own money. It is not a marketplace and does not send customers from one restaurant to another. We start with independent restaurants (family-owned, Asian restaurants, cafes), beginning with Zogam Cafe in Tulsa, then more Tulsa restaurants, then wider. The founder decides pricing, fees and anything involving live payments.

## Where we are

- **Built and merged:** pickup ordering with card authorization and capture, QR dine-in with pay-now or pay-later, staff till with discounts and receipts, kitchen screen, menu editor with photos, promo codes, owner dashboard and reports, sign-in by email link, tenant isolation, CI on every pull request.
- **Zogam Cafe:** menu importer and branded storefront are merged. Six dishes still need prices from the owner.
- **Tested so far:** more than 230 automated tests and hand checks in a browser on desktop, tablet and phone, all using a built-in fake payment provider.
- **Not yet tested:** real Stripe, real email delivery, a real printer, real phones, and a live restaurant.

## Next three bets, in order

1. **Launch Zogam Cafe for real.** Run the Stripe sandbox test, set up hosting and backups, confirm sign-in email, import the menu, take one small real order and refund it. Done when Zogam takes real orders for a full week and we have read every alert. Steps: the launch checklist.
2. **Learn from Zogam, then add 3 to 5 Tulsa restaurants.** Fix what the first week shows. Add per-restaurant branding as data instead of code, a timezone setting, and billing for the platform fee on till and pay-later orders. Done when a new restaurant can be set up in an afternoon without a code change.
3. **Bring customers back.** Loyalty and repeat-order tools on the restaurant's own page (order again, simple points or stamps, opt-in messages). This is the feature most likely to make a restaurant stay, because it grows their own customer list.

## Payments: what we take from Olo Pay, built on Stripe

Olo Pay's pitch is faster, safer checkout and one place to see the money. We get most of that from Stripe Connect, which we already use, so we add to it instead of building a processor. Card details already go straight to Stripe and never touch our servers.

- **At launch:** in the Stripe sandbox, check that Apple Pay and Google Pay appear at checkout on a real phone (Apple Pay needs the domain verified), and review Stripe's fraud-screening settings. Direct-ordering sites attract card testing, and we have per-client request limits but no card-specific screening of our own yet.
- **Bet 2:** handle disputes and chargebacks. Today we track captures and refunds but do not listen for dispute events, so a chargeback would only show up in Stripe. Add the events, an alert and a line in reports, and one view that reconciles captures, refunds, disputes and fees against Stripe payouts.
- **Bet 3:** one-click checkout for returning customers. Try Stripe's own saved-card options (such as Link, which works across Stripe merchants) before building anything. Check how they behave with direct charges on each restaurant's account before promising it.

## What we will not build now

- Our own payment processor or a card vault shared across restaurants (Olo Pay's "borderless" checkout). It depends on a large network, and it brings licensing and compliance work that is not worth it at this size.
- A consumer marketplace or restaurant discovery. That makes us a competitor to the restaurants we want to serve.
- A driver network. If delivery comes, it starts with a restaurant's own drivers or a partner's driver service, in that order.
- Eight named product modules, enterprise integrations for large chains, or AI forecasting. Revisit after bet 2.
- A rewrite or a large redesign. Changes stay small and tested.

## Decisions waiting on the founder

- Real prices for the six Zogam dishes, and the owner's email address.
- Whether to add a timezone field (new restaurants default to America/Chicago).
- How platform fees on till and pay-later orders will be collected.
- Whether declining a till-paid order stays open to staff or becomes owner-only.
- Stripe account access, the hosting account (Contabo, Coolify, Cloudflare), and a verified email sender.

## How we work

Claude builds in small branches and pull requests. Codex reviews and verifies independently. Mangpi merges and decides anything about money. Nothing is called done until someone has seen it work.
