# Phase 10 — Merchant website builder and local search

Proposed specification. Extend the existing tenant storefront, branding settings and menu data. Do not create separate deployments per restaurant. No DNS changes, domain purchases, indexing activation or commercial plan changes authorized by this document.

## 10A: Website editor and publishing

- Owner-managed structured templates: home, menu/order, about, contact/location, gallery and optional catering inquiry. Use shared accessible responsive components and per-tenant design tokens (logo, colors, typography, light/dark/system).
- Persist validated page blocks, revisions, navigation, metadata, theme and media references. Composite tenant foreign keys, RLS, owner-only publishing; separate draft preview from immutable published revision. Revert to previous published revision without losing drafts.
- Reuse menu availability, hours, locations, photos and checkout routes as authoritative data. Never duplicate prices into static content. Guest checkout continues unchanged.
- Preview desktop and phone layouts; publish atomically, invalidate only associated tenant cache keys. No arbitrary scripts, raw HTML or unrestricted embeds. Validate external links and media; use upload limits and existing image rules.
- Empty content and disabled ordering remain readable. Avoid misleading hours, unsupported dietary claims, placeholder reviews and manufactured testimonials.

## 10B: Custom domains

- Verified domain mapping to tenant and optional canonical hostname. Unique normalized ASCII host, ownership proof via DNS TXT challenge, lifecycle pending/verified/active/revoked and audit history. Do not accept requests for a custom host until ownership and TLS are verified.
- Reverse proxy routes only allowlisted active hosts; unknown hosts return a neutral error, never another tenant. Normalize host safely, reject ambiguous inputs and use trusted ingress configuration, not arbitrary forwarded headers. Cache keys include tenant and host.
- Display DNS setup instructions, verification status and certificate health in owner UI. Start on platform subdomain; customer or authorized operator applies DNS records. Safe renewal, removal and re-verification; never redirect a removed host to another tenant.
- Preserve existing APP_URL and authentication boundaries; separate staff login origin from restaurant domains. Order links and callbacks use verified canonical URLs. Review cookie scope, CORS and payment return URLs; do not alter webhook endpoints.
- Cloudflare/Coolify integration begins manual and controlled; automate provisioning only after review, with narrowly scoped credentials and ownership checks.

## 10C: Search and accessibility

- Server-render published pages with unique truthful titles, descriptions, canonical URLs, sitemap and robots policy; staging stays noindex. Use structured restaurant data that reflects verified location, hours, menu and contact details. No invented ratings.
- Existing storefront redirects and menu deep links remain valid; canonicalize aliases and preserve ordering routes. Do not index draft, checkout, receipt, account or staff pages.
- Provide owner checklist for business listing consistency and links to verified profiles. Search integration is not a guarantee of rankings or listing approval.
- Optimize image formats and sizes, lazy loading below fold, responsive layout, contrast, keyboard focus and meaningful labels. Measure page speed and accessibility using CI and real devices.

## 10D: Productized onboarding

- Standard template package, menu import, branding, domain connection, preview, owner acceptance and publishing checklist. Show which features are included in the subscription, but do not hard-code prices before founder approval.
- Track onboarding work, support time, hosting resources, renewal failures and site health per tenant. Offer optional pages, custom designs and managed support only after operational cost validation.
- Suitable for other verticals later through reusable block and template primitives; restaurant-specific operational data stays in the restaurant module.

## Acceptance and release

- Existing platform-hosted restaurant storefront and QR URLs remain functional.
- Draft changes cannot leak into published pages; atomic publish and revision rollback are verified.
- Owner cannot edit another tenant; customer cannot publish; host mapping, media and cache isolation tested across two tenants.
- Unknown, unverified and revoked domains never serve tenant content; HTTPS and redirect behavior tested on authorized staging hosts.
- Sitemap excludes private/draft/staging pages; metadata reflects real business data. Browser tests cover phone/tablet/desktop, keyboard navigation and checkout.
- Typecheck, PostgreSQL integration, production build, browser CI and Docker smoke checks before independent review.
- Pilot Zogam Cafe on platform host, then a verified custom domain with founder approval. Record onboarding time, speed, search impressions and ordering conversion. No DNS mutation or new live billing until authorized.
