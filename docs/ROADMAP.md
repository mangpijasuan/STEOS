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

## What we will not build now

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
