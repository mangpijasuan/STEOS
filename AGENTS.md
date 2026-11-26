<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## STEOS project instructions

These apply to every coding agent working in this repository. They extend, and do not replace, the Next.js notice above. [CLAUDE.md](CLAUDE.md) holds the same rules with more detail.

- **The product is STEOS** (Siamsil Technologies Enterprise Operating System), a product of Siamsil Technologies. Tagline: *One Platform. Every Business.* The platform's name, tagline, company, footer, page titles, email subject and fee label live in `lib/branding.ts`; import from it and never hard-code them (`tests/branding.test.ts` enforces this). A restaurant's storefront keeps its own brand. **SROS is the historical name only.** Use STEOS in UI text, emails, docs, comments and pull requests.
- One multi-tenant platform with configurable modules, not a separate app per industry. Only the restaurant modules are built today. See `docs/PRODUCT_VISION.md` and `docs/STEOS_MASTER_PLAN.md`.
- Roles: the founder decides product, pricing, fees and live payment settings and merges. Claude Code implements. Codex reviews independently. Agents never approve or merge, and open a pull request only when asked.
- Small topic branches and small pull requests. Do not edit another agent's active branch. Record decisions in the pull request or the docs.
- Preserve working behavior and production identifiers (database and role names, cookie names, environment variable names, API routes, webhook endpoints). Do not edit merged migrations. Stop and ask before anything destructive.
- Tenant isolation is enforced in the database (`withTenant`, row-level security, composite foreign keys). Never store raw card data. Never commit secrets.
- Run `npm run typecheck`, `npm test` and `npm run build` before proposing a change, and report honestly what passed and what was not tested.
