# Switching payments on (the day the company exists)

Payments are built and tested in Stripe test mode (M4, 2026-10-19). Production keeps `plans.billingEnabled: false` until every step below is done, in this order. Owner steps are marked **(owner)**; the rest is Claude's, from a session, with the owner's go for each money step. Technical detail: docs/dev/billing.md.

## 1. Before: decisions and paperwork
1. **(owner)** The company is registered (s.p. or d.o.o., the accountant's choice): name, address, tax number (davčna številka), registration number (matična številka), a business bank account (IBAN), whether it is a VAT payer.
2. **(owner)** The accountant answers in writing: do Stripe card payments need fiscal verification with FURS (davčno potrjevanje)? The 2016 FURS answer (FAQ 220) says payments through a licensed payment-service provider are not cash; Stripe is licensed in the EU. If the answer is yes, the FURS piece is built first (config `billing.fiscal.mode` has a slot; no FURS client exists yet) and the company gets its FURS certificate.
3. **(owner)** The lawyer has checked /pogoji (the payment section: Stripe as processor, renewal, cancel at period end, prorated plan changes, invoices by email, the grace period, "we never see card data") and /zasebnost (Stripe as a processor of payment data).

## 2. Stripe live account
4. **(owner)** In the Stripe account: activate live mode with the company's details and bank account (Stripe asks for the company, a representative and the IBAN). Payouts in EUR.
5. **(owner)** Developers → API keys → reveal the **live** secret key; put it on Railway → production → web and worker as `STRIPE_SECRET_KEY` (never in chat). Keep the test key on staging (preview).
6. Claude: `pnpm billing:sync-prices` against live (creates the Osnovni/Plus monthly and yearly prices, the founding renewal price, the setup service, the founding coupon, by lookup key; safe to repeat). Check the printed list against config.
7. Claude: create the live webhook endpoint `https://app.postavi.si/api/billing/stripe` for the events in docs/dev/billing.md; **(owner)** copies its signing secret to Railway production web as `STRIPE_WEBHOOK_SECRET`.
8. **(owner)** Stripe → Settings → Customer portal: allow cancel at period end, card update, plan switching between the four prices; set the business name, links to /pogoji and /zasebnost.

## 3. Company details in config
9. Claude: fill `billing.company` in config/app.config.json (name, address, tax id, registration no., IBAN, email) and `billing.vat.mode` (`included` for a VAT payer, `exempt` with the ZDDV-1 sentence otherwise). The config check refuses `billingEnabled: true` while any `[[…]]` placeholder is left. PR, owner reviews.
10. Claude: invoice numbering starts at `<year>-00001` on the first paid invoice; confirm with the accountant that a new series per calendar year is fine.

## 4. Switch on
11. Claude: set `plans.billingEnabled: true` (PR, owner approves), promote to production.
12. **(owner)** One real payment: buy Osnovni monthly with your own card on app.postavi.si. Check: the site publishes; the invoice email arrives with the PDF; the invoice shows the company details and the right VAT lines; the payment shows in Stripe; /narocnina shows the plan. Then cancel in the portal (at period end) and refund yourself in Stripe if you want.
13. Claude: HQ and the roadmap: M4 and M7b criteria ticked; the founding offer counter shows 100 places.

## Known limits (decided 2026-10-19)
- Founding places count when a subscription becomes active, so two checkouts at the very end can take place 101.
- One setup-service price for both plans (€149 today).
- Sites already published stay up when a renewal fails; after the grace days only new publishes are refused. Taking a site offline is a later owner decision.
- The AI top-up (€5) is parked.
