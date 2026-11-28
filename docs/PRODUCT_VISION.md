# Siamsil product vision

Siamsil is an all-in-one business operating system, sold as multi-tenant software. A business signs up, says what kind of business it is, and gets the modules it needs on one platform with one login, one customer list and one set of reports. The target market is the United States first, then worldwide.

## Who it is for

Restaurants and cafes first (built today). Then convenience stores, grocery and other retail, and later small and mid-sized businesses in other fields: e-commerce, wholesale and distribution, professional services, manufacturing, and larger multi-location organizations.

## Modules

All of these are modules of one platform, not separate products. Status is honest: only some exist.

| Module | Responsibility | Status |
| --- | --- | --- |
| Siamsil Core | Platform foundation, tenants, staff accounts, roles | Built |
| Siamsil Commerce | Online ordering and e-commerce | Built for restaurants (storefront, pickup, QR dine-in, checkout) |
| Siamsil POS | In-person sales | Built for restaurants (till, receipts, discounts, manual payments) |
| Siamsil Kitchen | Restaurant kitchen operations | Built |
| Siamsil Payments | Payment processing and reconciliation | Built on Stripe Connect; sandbox testing and dispute handling pending |
| Siamsil Customers | CRM and loyalty | Not built (promo codes only) |
| Siamsil Inventory | Products, stock and inventory | Not built (menu items only) |
| Siamsil Supply | Suppliers and procurement | Not built |
| Siamsil Finance | Accounting and bookkeeping | Not built (reports only) |
| Siamsil Workforce | Employees and scheduling | Not built (staff accounts only) |
| Siamsil Website | Merchant websites | Not built (branded storefront only) |
| Siamsil Logistics | Delivery and fulfillment | Not built; decided not to start now |
| Siamsil Learning | Employee training | Not built |
| Siamsil Safety | Safety and compliance | Not built |
| Siamsil Enterprise | ERP and multi-location management | Not built (one default location per tenant) |
| Siamsil Intelligence | AI and business automation | Not built |

## How a business is configured

Each tenant picks a business type and enables modules. For example, a restaurant uses Commerce, Kitchen, POS, Payments and Inventory; a convenience store uses POS, Inventory, Payments and Suppliers; a grocery store adds purchasing and weighted products; a hybrid business combines any compatible set. The mechanism is tenant-level configuration, feature flags and permission-based navigation. The design is in [MULTI_TENANCY.md](MULTI_TENANCY.md); it is not implemented yet.

## What we will not do

Become a consumer marketplace that sends customers between businesses; build a separate application or business engine per industry; or build every module before anyone pays for one.
