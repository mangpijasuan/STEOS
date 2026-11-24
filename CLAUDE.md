# CLAUDE.md: project instructions for AI-assisted development

## Product identity

- The product is **STOS**, the **Siamsil Technologies Operating System**. Tagline: *The Operating System for Business.* Secondary: *Sell. Manage. Automate. Grow.*
- STOS is a product of **Siamsil Technologies** (the parent company), not a separate legal entity.
- **SROS is the historical project name.** Use STOS in anything a person reads: UI text, emails, docs, comments, test names, pull requests. Do not reintroduce SROS, except in the places listed as intentionally unchanged in [docs/REBRANDING_MIGRATION.md](docs/REBRANDING_MIGRATION.md).
- Footer for STOS's own pages (home, sign-in): "© 2026 Siamsil Technologies, Inc. All rights reserved." and "STOS is a product of Siamsil Technologies." Restaurant storefronts carry the restaurant's brand, not STOS's.
- Brand colors: French navy, white and gold, with optional red accents. The restaurant storefronts have their own per-restaurant branding (Zogam Cafe is forest green).
- STOS is one multi-tenant platform with configurable modules, not a separate app per industry. Today only the restaurant modules are built. See [docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md) and [docs/STOS_MASTER_PLAN.md](docs/STOS_MASTER_PLAN.md).

## How we work

- **Founder** (Mangpi) decides product, pricing, fees, anything involving live payments, and merges. **Claude Code** implements. **Codex** reviews and verifies independently.
- Use a separate topic branch and a small pull request for each change. Open a pull request only when asked. Never approve or merge. Do not edit a branch another agent is working on.
- Do not change pricing, fees or live payment configuration without the founder's approval. Never put secrets in the repository, in chat or in a pull request.
- Preserve working behavior. Do not delete customer data, migrations, Git history, secrets or deployment settings. Stop and ask before anything destructive or production-sensitive.
- Report outcomes faithfully: say what was run, what passed, what failed and what was not tested.

## Engineering rules

- Modular monolith. Keep the current stack (Next.js App Router, React, TypeScript, Drizzle, PostgreSQL 16, Stripe Connect). No microservices.
- Tenant isolation is enforced in the database: every restaurant query runs inside `withTenant(restaurantId, ...)`, row-level security applies to the app role, and composite foreign keys stop cross-tenant references. See [docs/MULTI_TENANCY.md](docs/MULTI_TENANCY.md).
- Roles: owner and staff. Server routes check the role; screens only reflect it.
- Never store raw card data. Card details go from the browser to Stripe.
- Migrations are numbered SQL files in `db/migrations`. Never edit one that has been merged; add a new one.
- Keep identifiers that production depends on (database and role names, cookie names, environment variable names, API routes, webhook endpoints, local storage keys) unchanged unless the founder approves a migration.
- Reuse the design system (`app/ds.css`, `app/ui.tsx`). Every screen must work on desktop, tablet and phone.

## Commands

```bash
npm run typecheck      # TypeScript
npm test               # needs PostgreSQL 16 with a siamsil_test database (see docs/TESTING.md)
npm run build          # production build
npm run db:migrate     # apply migrations with the owner connection
npm run dev            # local server on port 3000
```

## Next.js version

This is a newer Next.js than most training data covers. Read the relevant guide in `node_modules/next/dist/docs/` before writing framework code, and heed deprecation notices. See also AGENTS.md.

## Documentation map

[docs/STOS_MASTER_PLAN.md](docs/STOS_MASTER_PLAN.md) · [docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md) · [docs/PRODUCT_ROADMAP.md](docs/PRODUCT_ROADMAP.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/MULTI_TENANCY.md](docs/MULTI_TENANCY.md) · [docs/SECURITY.md](docs/SECURITY.md) · [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · [docs/TESTING.md](docs/TESTING.md) · [docs/REBRANDING_MIGRATION.md](docs/REBRANDING_MIGRATION.md)
