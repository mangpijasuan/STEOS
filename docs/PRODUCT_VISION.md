# STOS product vision

STOS is an all-in-one business operating system, sold as multi-tenant software. A business signs up, says what kind of business it is, and gets the modules it needs on one platform with one login, one customer list and one set of reports. The target market is the United States first, then worldwide.

## Who it is for

Restaurants and cafes first (built today). Then convenience stores, grocery and other retail, and later small and mid-sized businesses in other fields: e-commerce, wholesale and distribution, professional services, manufacturing, and larger multi-location organizations.

## Modules

All of these are modules of one platform, not separate products. Status is honest: only some exist.

| Module | Responsibility | Status |
| --- | --- | --- |
| STOS Core | Platform foundation, tenants, staff accounts, roles | Built |
| STOS Commerce | Online ordering and e-commerce | Built for restaurants (storefront, pickup, QR dine-in, checkout) |
| STOS POS | In-person sales | Built for restaurants (till, receipts, discounts, manual payments) |
| STOS Kitchen | Restaurant kitchen operations | Built |
| STOS Payments | Payment processing and reconciliation | Built on Stripe Connect; sandbox testing and dispute handling pending |
| STOS Customers | CRM and loyalty | Not built (promo codes only) |
| STOS Inventory | Products, stock and inventory | Not built (menu items only) |
| STOS Supply | Suppliers and procurement | Not built |
| STOS Finance | Accounting and bookkeeping | Not built (reports only) |
| STOS Workforce | Employees and scheduling | Not built (staff accounts only) |
| STOS Website | Merchant websites | Not built (branded storefront only) |
| STOS Logistics | Delivery and fulfillment | Not built; decided not to start now |
| STOS Learning | Employee training | Not built |
| STOS Safety | Safety and compliance | Not built |
| STOS Enterprise | ERP and multi-location management | Not built (one default location per tenant) |
| STOS Intelligence | AI and business automation | Not built |

## How a business is configured

Each tenant picks a business type and enables modules. For example, a restaurant uses Commerce, Kitchen, POS, Payments and Inventory; a convenience store uses POS, Inventory, Payments and Suppliers; a grocery store adds purchasing and weighted products; a hybrid business combines any compatible set. The mechanism is tenant-level configuration, feature flags and permission-based navigation. The design is in [MULTI_TENANCY.md](MULTI_TENANCY.md); it is not implemented yet.

## What we will not do

Become a consumer marketplace that sends customers between businesses; build a separate application or business engine per industry; or build every module before anyone pays for one.
