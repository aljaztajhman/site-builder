# Billing (M4 payments)

Card payments through Stripe, monthly and yearly; a site is published only with a plan; Postavi issues its own
numbered invoices. Plan: `.claude/plans/m4-payments.md`. Contract types: `packages/platform/src/billing-types.ts`.

## Where things are

- `packages/platform/src/billing-stripe.ts`: Stripe REST over `fetch` (no SDK) and `memoryStripe()` for tests.
- `packages/platform/src/billing.ts`: price lookup keys, webhook signature check, paid rights (`isEntitled`),
  event handling (idempotent by event id, one transaction), invoice numbering and the `InvoiceView` builder,
  the `FiscalVerifier` slot (mode `none` only), `billingEnabled(config, env)`.
- `packages/platform/src/billing-sync.ts` + `tools/billing/src/sync-prices.ts`: `pnpm billing:sync-prices`.
- Migration 25 `billing`: `billing_customers`, `subscriptions`, `invoices`, `invoice_counters`, `stripe_events`.
- `apps/web/src/billing.ts`: `GET /api/billing`, `POST /api/billing/checkout`, `POST /api/billing/portal`,
  `POST /api/billing/stripe` (webhook), `GET /narocnina`, `GET /racun/:id` and `/racun/:id.pdf`.
- `apps/web/src/access.ts`: paid rights = an entitled subscription or an allow-list row; `publishRefusal` gives
  `checkout` (no plan) or `portal` (renewal failed past the grace days) when billing is on.
- `packages/platform/src/billing-invoice-html.ts`: the invoice page (Unit B's design as a string template), used by
  `/racun/:id` and by the worker's PDF (without the "Prenesi PDF" bar). It lives in platform because web depends on
  the worker, so neither app can import the other's file.
- `apps/worker/src/invoices.ts`: every `billing.invoicePdf.sweepSeconds`, new invoices are rendered to an A4 PDF
  (Playwright), stored at `invoices/<year>/<number>.pdf` and emailed as "Račun <number>" with the PDF attached.

## Environment variables

| Variable | Where | What |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | web; your shell for `pnpm billing:sync-prices` | `sk_test_…` on staging, `sk_live_…` once the company exists. Without it checkout and portal answer `provider_error`. |
| `STRIPE_WEBHOOK_SECRET` | web | The webhook endpoint's signing secret (`whsec_…`) from Stripe's dashboard. Without it every webhook gets 503. |
| `BILLING_ENABLED` | web (and worker, harmless) | `true` turns billing on although `plans.billingEnabled` is false (staging, test mode). Any other value: config decides. |
| `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` | worker | The worker now sends the invoice emails, so it needs the mail settings too; `APP_URL` puts the /narocnina link in them. |

The web service names missing Stripe variables at startup while `BILLING_ENABLED=true` (`env-check.ts`).

## Stripe setup (test mode first)

1. `pnpm billing:sync-prices` with `STRIPE_SECRET_KEY` set: creates the products `postavi_standard`,
   `postavi_premium`, `postavi_setup`, the prices by lookup key (`postavi_<plan>_<month|year>_v1`,
   `postavi_standard_year_founding_v1`, `postavi_setup_v1`) and the coupon `postavi_founding_first_year_v1`. Run it
   again after any price change in config; matching prices are kept.
2. Webhook endpoint `https://<app>/api/billing/stripe` with the events `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`,
   `invoice.payment_failed`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. Customer Portal (Stripe dashboard): allow plan switching between the four prices, card updates and cancelling at
   period end.

## Guards

- **Event order:** each event takes a transaction-scoped advisory lock on its Stripe subscription id, and only then
  fetches the subscription from Stripe; events about one subscription run one after the other and the later one writes
  the later state. Rights also end when the paid period ended more than a day ago, whatever the status says.
- **Founding once per account:** no founding price or coupon for an account with any earlier founding subscription or
  any invoice. Stripe can't limit a coupon per customer (`max_redemptions` counts all customers; only promotion codes
  have `restrictions.first_time_transaction`), so our check is the limit.
- **Placeholders:** config refuses `plans.billingEnabled: true` while `billing.company` has a `[[…]]`; with
  `BILLING_ENABLED=true` and an `sk_live_` key, checkout answers `provider_error` (and logs why) while any remains.
- **Unknown customer:** an event about a Stripe customer no account is known for answers 500 (Stripe retries) and logs.
- **Invoice date:** issued on Stripe's `paid_at`, numbered in that date's year in Ljubljana.

## Known limits

- **Founding places can overrun by a few.** A place counts once its subscription is active (`accounts.foundingTaken`:
  open founding subscriptions plus the admin's founding allow-list rows), not when checkout opens. Two owners who open
  checkout while one place is left both pay the founding price, so place 101 can be taken. Left as is (director,
  2026-10-19).
- **One setup price** (`postavi_setup_v1`, from `plans.standard.setupService.eur`): both plans charge the same €149 today;
  different amounts per plan would need a price per plan.
