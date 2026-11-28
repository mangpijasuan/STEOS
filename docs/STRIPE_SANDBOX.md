# Stripe sandbox guide

How to run Siamsil against a real Stripe **test** account for the first time, and how to prove each payment scenario works. This is section 6 of [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) written as steps. Everything so far was tested with the built-in fake provider, which proves Siamsil's own logic but not Stripe's behavior.

**Test mode only.** Use keys that start with `sk_test_` and `pk_test_`. Never put a live key in staging, in the repository, in chat or in a pull request. Moving to live keys needs the founder's approval and is not part of this guide.

## How Siamsil uses Stripe

- **Direct charges on the restaurant's own connected account.** The payment lives on the restaurant's Stripe account and Siamsil takes an application fee. The restaurant's account pays Stripe's card fees.
- **Authorize first, capture on accept.** The card is authorized (a hold) when the customer pays. The kitchen has five minutes to accept; accepting captures the money. Declining or letting the five minutes pass releases the hold.
- **Refunds** are full refunds started by the owner (cancel after accept). The refund is "pending" until Stripe confirms it with a `refund.*` event.
- **Card details never reach Siamsil.** They go from the customer's browser to Stripe.
- **Pay-later orders at a table and cash at the till never touch Stripe.** They are not part of this test.

## What you need

| Need | Who |
| --- | --- |
| A Stripe account (test mode is enough) with Connect enabled | Founder |
| One **test connected account** for the demo restaurant, with card payments enabled | Founder |
| The staging site (or a local copy) with HTTPS and a public address Stripe can call | Founder, Claude |
| The order worker running (or a scheduler calling the expiry endpoint every minute) | Founder, Claude |

You can run it locally instead of on staging by forwarding webhooks with the Stripe CLI (step 4, local option). Staging is better evidence because it exercises the real webhook address.

## Setup

### 1. Create the connected account

1. In the Stripe Dashboard, switch to **test mode**.
2. Open **Connect** and create a test connected account for the demo restaurant (not Zogam Cafe's real details). Complete its test onboarding so that card payments are enabled. Stripe's dashboard shows what is still missing.
3. Copy the account id. It starts with `acct_`.

### 2. Link the account to the restaurant

The restaurant's account id is stored in `restaurants.stripe_account_id`. There is no screen for it yet, so set it with the owner database connection on the **staging** database (use the restaurant's real slug):

```sql
update restaurants set stripe_account_id = 'acct_XXXXXXXX' where slug = 'your-demo-restaurant';
```

Until this is set, a card checkout returns "This restaurant cannot take card payments yet".

### 3. Set the keys

In the staging environment (Coolify variables, or `.env` locally), set:

| Variable | Value |
| --- | --- |
| `PAYMENTS_PROVIDER` | `stripe` |
| `STRIPE_SECRET_KEY` | the test secret key (`sk_test_...`) |
| `STRIPE_PUBLISHABLE_KEY` | the test publishable key (`pk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | from step 4 |

Redeploy after changing them. Do not paste the keys anywhere else.

### 4. Add the webhook

1. In Stripe (test mode), add a webhook endpoint that listens to **events on connected accounts** (a Connect webhook).
2. URL: `https://<staging domain>/api/webhooks/stripe`.
3. Events to send:
   - `payment_intent.amount_capturable_updated`
   - `payment_intent.succeeded`
   - `payment_intent.canceled`
   - `payment_intent.payment_failed`
   - `refund.created`
   - `refund.updated`
   - `refund.failed`
4. Copy the endpoint's signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET` and redeploy.

Local option: run `stripe listen --forward-connect-to localhost:3000/api/webhooks/stripe`. It prints a `whsec_...` secret for that session; use it as `STRIPE_WEBHOOK_SECRET`.

### 5. Run the worker

The worker expires unaccepted orders and reconciles pending refunds. Either run `npm run worker:orders` under a supervisor or have a scheduler call `POST /api/internal/expire-orders` every minute with `Authorization: Bearer $CRON_SECRET`. Check that `/api/health` reports a recent worker heartbeat.

### 6. Sanity check

Open the restaurant's storefront, add a dish and go to checkout. You should see Stripe's card form (not the fake test panel). If you see an error instead, read it against the table at the end of this guide.

## Test cards

Use these in test mode, any future expiry date, any 3-digit CVC and any postal code.

| Card number | What it does |
| --- | --- |
| `4242 4242 4242 4242` | Payment succeeds |
| `4000 0000 0000 0002` | Card is declined |
| `4000 0000 0000 9995` | Declined for insufficient funds |
| `4000 0025 0000 3155` | Asks for 3D Secure authentication |

Stripe's own testing page is the authority for card numbers and may add more, including one for a refund that fails. Check it before the failed-refund scenario.

## Scenarios

For each one, write down what you did, what you saw in Siamsil and what you saw in the Stripe Dashboard (Payments and, on the connected account, the payment's timeline). A scenario passes only if both sides agree. Tick it off in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).

### A. Successful order

1. As a customer, order a dish for pickup and pay with `4242 4242 4242 4242`.
2. **Stripe:** the payment shows as **Uncaptured** (authorized), with an application fee.
3. **Siamsil kitchen:** the order appears with a five-minute countdown. Accept it with a prep time.
4. **Stripe:** the payment becomes **Succeeded** (captured).
5. **Siamsil:** the customer's order page shows paid; the order receipt and `/reports` include it.
6. Check the application fee in Stripe against the fee Siamsil saved on the order (Pricing page plan).

### B. Declined card, then retry

1. Pay with `4000 0000 0000 0002`. The customer sees a clear failure message and the order is not sent to the kitchen.
2. On the same checkout, retry with `4242 4242 4242 4242`.
3. **Pass:** exactly one successful payment in Stripe, and one order in the kitchen.

### C. Decline by the kitchen

1. Place and authorize an order (as in A, steps 1 to 3), then **Decline** it in the kitchen.
2. **Stripe:** the authorization is **Canceled**; nothing is charged.
3. **Siamsil:** the customer is told nothing was charged.

### D. Order expiry

1. Place and authorize an order and leave it alone for more than five minutes with the worker running.
2. **Pass:** the order is released automatically, Stripe shows the authorization as canceled, and the customer's page says the restaurant didn't respond in time and that they weren't charged.
3. If it is not released, check the worker heartbeat first.

### E. Delayed or repeated webhook

1. In the Stripe Dashboard, open the webhook endpoint's event list and **resend** an event that was already delivered (for example the authorization event of order A).
2. **Pass:** Siamsil answers successfully but nothing changes twice: no second kitchen order, no duplicate payment record.
3. To test lateness, temporarily disable the endpoint, place an order, re-enable it, and let Stripe's retry deliver the event. The order must then appear exactly once.

### F. Cancel after accept (owner refund)

1. Take an order as far as accepted and paid (scenario A).
2. As the owner, cancel the order in the kitchen. A full refund starts.
3. **Siamsil:** the order shows the refund as pending, then confirmed after the `refund.*` event arrives, and the customer's page shows it.
4. **Stripe:** one full refund; the application fee is refunded too (Siamsil asks Stripe for that).
5. Run it once more and confirm that repeating the cancel (double-click, or reload and retry) never creates a second refund.

### G. Failed refund

1. Make a refund fail using the method in Stripe's testing documentation (see the note under Test cards).
2. **Pass:** Siamsil shows the order as needing attention and sends an operational alert; it does not claim the money was refunded.

### H. Promo code on a card order

1. Create a promo code in `/promos`, then pay for an order that uses it with `4242 4242 4242 4242`.
2. **Pass:** the discount, tax and fee on the receipt match the amount Stripe charged.
3. Pay another order that uses the code with `4000 0000 0000 0002`. **Pass:** the code's use is returned after the failed order.

### I. Reports match Stripe

At the end of the session, compare `/reports` for the test period with the Stripe Dashboard: sales, refunds and fees must agree. Stripe has the exact card fees; Siamsil shows an estimate (2.9% + 30 cents), so card fees will differ slightly and that is expected. Sales and refunds must match exactly.

### Also try (not in the checklist's list, but cheap now)

- **3D Secure:** pay with `4000 0025 0000 3155` and complete the challenge. The order must still arrive once.
- **Closing the tab mid-payment:** start paying, close the tab after authorizing, and reopen the order link. The order should still be there and in the right state.
- **Partial or dashboard refunds:** refund an order directly in the Stripe Dashboard. Siamsil does not reconcile refunds made outside the app yet; note what the app shows. This is a known gap in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).
- **Disputes:** Siamsil has no dispute handling yet. Note it, do not test it.

## If something goes wrong

| What you see | Likely cause |
| --- | --- |
| "This restaurant cannot take card payments yet" | `stripe_account_id` is not set for that restaurant (step 2), or `STRIPE_PUBLISHABLE_KEY` is missing |
| Fake test panel instead of the Stripe card form | `PAYMENTS_PROVIDER` is not `stripe`, or the app was not redeployed |
| Payment succeeds in Stripe but the order never reaches the kitchen | The webhook is not arriving: wrong URL, endpoint is not a Connect webhook, or the events are not selected |
| Webhook shows 400 in Stripe | Wrong `STRIPE_WEBHOOK_SECRET` (each endpoint and each `stripe listen` session has its own) |
| Webhook shows 503 | `STRIPE_WEBHOOK_SECRET` is not set in the running app |
| Orders never expire | The worker is not running; check `/api/health` |
| Stripe rejects payments from the account | The test connected account's card payments capability is not active yet |

Siamsil also sends an operational alert when a Stripe webhook is rejected, so check the alert channel as well.

## When you are done

- Record the result of every scenario in the launch checklist, with dates, and keep Stripe's payment ids for the failures.
- Do not enable live keys. Live setup needs the founder's approval, a verified legal entity, live Connect onboarding and the other items in sections 8 to 10 of the launch checklist.
- Delete or ignore the test data. Test payments in test mode move no real money.
