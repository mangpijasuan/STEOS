# Engineering handoff

## Starting point

- Claude branch reviewed: claude/practical-archimedes-hbvsl7, commit 513d079.
- Main at prior audit: ba5034e (Sprint 5). Recheck upstream before acting.
- Phase 1–4 delivered menu editor/photos, QR tables and service requests, POS/promotions/receipts, dashboard and order navigation.
- Sprint 6 partial hardening delivered sign-in confirmation, Resend, database rate limiting, logging, alerts and health endpoint.
- Codex verification at 513d079: npm ci, typecheck and production build passed; 200 test declarations found. Full test execution blocked by unavailable local PostgreSQL. Stripe sandbox and live UI were not verified.
- Phase 5 is next; nothing is certified for live payments.

## Collaboration

Claude Code leads feature implementation; Codex provides independent review, verification and agreed fixes. Mangpi is product owner and final merge/release authority. Use separate topic branches, small PRs, and coordinate overlapping files before work. Read ROADMAP.md and RELEASE_CHECKLIST.md. Record significant decisions in DECISIONS.md. Do not modify an active agent's branch directly.

## Handoff template

- Ticket / PR / commit:
- Scope and files:
- Implemented / remaining:
- Tests actually run and results:
- Database or configuration changes:
- Risks / rollback:
- Next owner / action:
- Founder approval required:
