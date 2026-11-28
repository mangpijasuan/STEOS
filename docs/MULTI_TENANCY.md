# Multi-tenancy

Siamsil is multi-tenant: many businesses ("tenants", stored today as `restaurants`) share one application and one database. Isolation is enforced in the database, so a bug in a route cannot leak another tenant's rows.

## How it works today

- Every tenant-owned table has a `restaurant_id` and a row-level security policy that compares it with the `app.restaurant_id` setting.
- `withTenant(restaurantId, fn)` in `lib/db.ts` opens a transaction, sets `app.restaurant_id` for that transaction only, and runs `fn`. Outside it the setting is empty and queries return no rows.
- The app connects as `siamsil_app`, which does not own the tables, so the policies apply to it. Migrations run as `siamsil_owner` through `DATABASE_OWNER_URL`, which is never used at runtime.
- Composite foreign keys `(id, restaurant_id)` mean a row can only point at a row of the same tenant (an order item cannot reference another tenant's menu item).
- Cross-tenant lookups that must happen before the tenant is known (a customer's order link, a session cookie) are hardened `security definer` functions that return only what is needed.
- Each tenant has a default location. Orders record it.
- Each staff account belongs to one tenant and is either owner or staff.
- `tests/tenant-isolation.test.ts` proves isolation against a real database, and the other suites check that each route refuses another tenant's data.

## What is not built yet: business types and modules

Today every tenant is a restaurant. To support other business types without forking the code, the plan is:

1. **Tenant configuration.** A business type and a set of enabled modules stored per tenant (a `tenant_modules` table, or a JSON column, chosen when it is built).
2. **Feature flags read on the server.** A route for a disabled module returns "not found", and the same check hides it from navigation. The screens never decide on their own.
3. **Permission-based navigation.** Today the sidebar already hides owner-only items; it would also filter by enabled module.
4. **Defaults by business type.** For example restaurant: Commerce, Kitchen, POS, Payments, Inventory; convenience store: POS, Inventory, Payments, Suppliers; grocery adds purchasing and weighted products.
5. **Naming.** The table is still called `restaurants`. Renaming it to `tenants` is a database migration and needs the founder's approval; introduce a view or an alias first if it is ever done.

Rules for any module that is added: every table has a tenant id and a policy, every query runs inside `withTenant`, every route checks the role and the module flag, and the module has tests that try to read another tenant's data.
