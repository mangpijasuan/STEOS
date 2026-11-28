# Product names

What each name means, where it may appear, and what exists today. The code is one application; these names are for people (the website, the price list, sales material). Status here comes from the repository, not from plans. [PRODUCT_VISION.md](PRODUCT_VISION.md) is the module list; this page is about naming.

> **Rename in progress.** The product was called STEOS. The founder renamed it Siamsil (pull request #50). Until that merges, some documents and screens still say STEOS. This page uses Siamsil throughout.

## The hierarchy

| Level | Name | Means | Where it appears |
| --- | --- | --- | --- |
| Company | **Siamsil Technologies** | The company: legal text, copyright, contracts, invoices | Footers, terms, receipts to restaurants |
| Platform | **Siamsil** | The software every restaurant signs in to | Sign-in, dashboard, emails to staff, page titles. Set in `lib/branding.ts` |
| Module | **Siamsil Kitchen**, **Siamsil POS**, **Siamsil Ordering** ... | A part of the platform a restaurant can use. A sales label, not a separate app | Website, price list, sales material. Not in the app's own screens |
| Restaurant | The restaurant's own name | The customer-facing brand | The storefront, order page, table page, receipts diners see |

Rules that follow:

1. **One name inside the app.** Screens say "Kitchen", "Till", "Menu" and so on, not product names. A sign-in page that says "Siamsil" is enough.
2. **Diners do not see Siamsil Ordering.** A restaurant's storefront carries the restaurant's brand. Any "Powered by Siamsil" line is off by default (`branding.poweredBy.enabled`) and is the founder's call per restaurant.
3. **Siamsil Technologies for the company, Siamsil for the product.** Legal and money documents name the company.
4. **One emblem, many subtitles.** The ring-and-four-tiles mark is shared. A module may add a subtitle (for example "KITCHEN DISPLAY SYSTEM") on its own sales material. The platform's main logo carries no subtitle. A logo vector set is still needed; see [REBRANDING_MIGRATION.md](REBRANDING_MIGRATION.md).
5. **No new name without a thing behind it.** Do not announce a module until it can be used, and never in a way that suggests more than it does.

## The modules, and what exists

"Built" means it is on `main` and tested. It does not mean a restaurant has used it. Real Stripe, email delivery, devices and a live restaurant are still unverified (see [LAUNCH_EVIDENCE.md](LAUNCH_EVIDENCE.md)).

| Name | What it covers | Status on `main` |
| --- | --- | --- |
| **Siamsil Restaurant** | The bundle: everything below that a restaurant uses | Built for restaurants. Pilot (Zogam Cafe) not yet live |
| **Siamsil Ordering** | Pickup storefront, QR dine-in, checkout, order status, order again, promo codes | Built. "I'm here" arrival (PR #46), order again (#45) and late hours (#44) are open |
| **Siamsil Kitchen** (KDS) | Kitchen screen: new-order chime, five-minute acceptance countdown, accept or decline with a prep time, ticket stages, cancel after accept | Built |
| **Siamsil POS** | Till: cash and manual payments, receipts, discounts, staff order terminal, held tickets | Built. Split payments (#42) reviewed and not merged |
| **Siamsil Payments** | Card payments through Stripe Connect on the restaurant's own account, with an application fee | Built and tested with a fake provider. **Real Stripe sandbox run not done.** Dispute handling not built |
| Siamsil Customers | Loyalty and customer records | Not built (promo codes only) |
| Siamsil Inventory | Stock and food cost | Not built (menu items only) |
| Siamsil Delivery | Couriers and fulfillment | Not built. Decided not to start now |
| Siamsil Enterprise and the rest | ERP, multi-location, finance, workforce, learning, safety, intelligence | Not built. See [PRODUCT_VISION.md](PRODUCT_VISION.md) |

### What the kitchen module does and does not do

Does: shows incoming orders in real time with a chime, a five-minute accept countdown, accept (with prep time) or decline, stages through to ready, works on a tablet, and has light and dark themes (the kitchen itself stays dark).

Not on `main` yet: arrived guests shown first (PR #46). Does not yet: send the customer a text or email when the order is ready (not built; listed under "Not built yet" in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)), route tickets to separate stations (grill, fryer, drinks), or run on its own without Siamsil Ordering or the till feeding it orders.

## Two cautions

**"Siamsil Pay" is not a product today.** Money goes through Stripe Connect on the restaurant's own account. A product called Pay suggests Siamsil holds or moves customers' money, which carries licensing and compliance duties. Describe it as "Payments, powered by Stripe" until the founder and a lawyer decide otherwise. This also applies to any future "Siamsil Pay" for other business lines.

**A module sold on its own needs work we have not done.** Modules are not switched on and off per restaurant yet (one default location per tenant, no entitlement check). To sell the kitchen screen alone, the platform would need a module access check per restaurant, a sign-up path for that customer, and a way to take orders from another system. Do not promise it until those exist.

## Prices

Modules have no prices of their own. The only pricing in the code is a fee on orders (`lib/pricing.ts`; the plans are on the owner's Pricing page). A price per module, or a bundle price, is a founder decision and is not part of this page.

## When a name changes

Change `lib/branding.ts` for the platform name. Update this page and [PRODUCT_VISION.md](PRODUCT_VISION.md) by hand, because documents cannot import code.
