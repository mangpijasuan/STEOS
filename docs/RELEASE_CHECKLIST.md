# Phase 5 staging release gate

Status: not passed. Record PR, commit, environment, date and evidence for each completed item. The founder approves production promotion separately.

- [ ] Current Claude Phase 4 work reviewed and integrated without overwriting concurrent changes.
- [ ] Clean dependency installation, typecheck, production build and full PostgreSQL tests pass in CI.
- [ ] Tenant separation and role authorization regression checks pass.
- [ ] Browser smoke tests cover storefront, staff login, kitchen, menu, POS, tables, promotions and order history at desktop/mobile sizes.
- [ ] Stripe test connected account completes payment authorization, capture, decline, expiry, cancellation and refund; recorded totals reconcile.
- [ ] Payment reconciliation and recovery verified with simulated provider failures and repeated events.
- [ ] Checkout retry and pickup scheduling edge cases have regression coverage.
- [ ] Contabo/Coolify staging deployment documented; clean database migrations, no production data, secure runtime role, configuration validation.
- [ ] Scheduled expiry and reconciliation jobs run reliably; health checks and external uptime monitoring configured.
- [ ] Backups stored off-server; restore successfully rehearsed on a disposable database.
- [ ] Resend test sign-in works; operational alerts reach designated operator without sensitive customer data.
- [ ] Staff POS and pay-later ordering correctly report payment state, refunds and any invoiced fees.
- [ ] Pilot support contact, fallback workflow and rollback procedure documented.
- [ ] No unresolved P0 defects; founder explicitly approves release.

Live payments remain disabled until sandbox evidence, merchant onboarding, real deployment configuration, recovery readiness and founder approval are complete.
