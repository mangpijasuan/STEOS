# Phase 9 — Restaurant marketing automation

Proposed design, dependent on STEOS Customers and consent controls (Phases 7–8). No production campaign sends authorized. Restaurant-owned audience only; no marketplace or cross-tenant advertising.

## 9A: Campaign builder and audience

Owner dashboard supports draft, preview, test send, scheduled send, pause and cancellation. Templates for announcements, seasonal specials, loyalty rewards, inactive customers and post-visit feedback. Owner selects channel and audience; show eligible recipients, estimated provider cost and offer terms before explicit approval. No imported contacts until consent provenance and suppression checks are supported. No arbitrary external target lists.

Segments use tenant-owned verified-order history: first-time customers, repeat customers, eligible loyalty members, lapsed customers. Define local timezone boundaries, minimum cohort size for aggregate analytics, and explicit exclusion rules. Avoid inferred sensitive characteristics.

## 9B: Delivery pipeline

- Tenant-scoped campaign, template version, audience snapshot, recipient intent, consent event, suppression, outbox, delivery event and attribution records; composite keys and RLS.
- Durable scheduler stores UTC send time and owner-selected local timezone. Enforce per-tenant quotas, local quiet hours, rate limits, budget caps and frequency caps.
- Recheck consent, suppression, campaign state and budget at the moment of sending; suppress queued recipients who withdraw. Do not promise recall after provider acceptance.
- Stable intent idempotency keys, unique recipient/campaign constraint, transactional outbox; reconcile ambiguous provider responses rather than blindly retrying. Signed callbacks, deduplication and bounded retries. Pause on elevated failures or complaints.
- Fake provider first; email through a dedicated marketing stream separate from transactional authentication mail. SMS provider selection, sender registration, commercial approval and applicable legal review precede live use.
- Use approved branded sender domains and unsubscribe mechanisms. No marketing sent from the login sender. Never add promotional text to transactional order messages.

## 9C: Automation and measurement

Trigger candidates: welcome after opt-in, first-order follow-up, repeat-customer thanks, lapsed-customer return offer, reward balance reminder. Each rule is opt-in, owner-approved, versioned, limited by frequency and budget; no automated AI publishing. Trigger only from verified events; avoid notifying about canceled or refunded orders as successful purchases.

Dashboard distinguishes queued, accepted, delivered where observable, bounced, unsubscribed, clicked, attributed orders, net sales after refunds, promotion cost and estimated message expense. Define attribution window and deduplicate order attribution. Observational attribution is not causal lift; compare against randomized holdouts when feasible. Do not rely on email opens as proof of engagement.

Coupon integration uses the existing server-authoritative promotion flow; enforce validity, usage cap and redemption rules without changing existing fee policy. No unapproved discounts. Owner sees preview and test send before publishing.

## 9D: Optional AI assistance

Suggest copy or segment criteria using aggregate tenant context, not raw customer contact lists. Generated content is draft only, with owner review for accuracy, offer terms and tone. No invented offers, dietary claims or autonomous campaign sends.

## Acceptance gates

- No sends without eligible verified consent; opt-out blocks future queued messages.
- Tenant isolation, role restrictions, audit trail, export controls and deletion handling.
- Duplicate jobs, worker restarts and repeated provider callbacks do not double-send; ambiguous acceptance enters reconciliation.
- Paused/canceled campaigns stop pending work; quotas, budgets, quiet hours and frequency caps enforced across concurrent workers.
- Incorrect coupon, invalid template or expired offer fails safely; preview matches rendered message.
- Refund reduces attributed net sales; one order not counted twice in aggregate attribution.
- Fake providers in CI and staging; typecheck, database tests, browser tests and production build.
- Founder approves rates, provider onboarding, sender identity, privacy/marketing compliance and live campaign activation.

## Rollout

1. Implement 9A with drafts and preview only after Phase 7A.
2. Implement 9B mock outbox and consent checks; independent review.
3. Add real provider sandbox and 9C reporting; test with internal authorized recipients.
4. Pilot a small opt-in campaign with Zogam Cafe and measure unsubscribes, conversions, cost and owner workload.
5. Expand only if deliverability, financial outcomes and support capacity justify it.
