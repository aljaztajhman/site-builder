# Pricing tiers: a tight free preview, Osnovni and Plus

Status: proposal, 2026-10-03, HQ decision `sb-tiers` (supersedes the single plan of `sb-pricing` and the free numbers of `sb-free-tiers` once decided). The numbers live in config `plans` and `tiers.free`; merging the PR that adds them applies them. Billing stays off (`plans.billingEnabled: false`) until the legal entity exists.

## The rule

We make money on every paying customer, even one who uses everything their plan allows. Free costs at most a few tens of cents per person. The config schema enforces both: `planMargins` takes VAT, card fees, the domain, hosting and the whole AI allowance off each plan's monthly, yearly and founding price, and a config where any of them is not positive doesn't load. `tiers.free.lifetimeEur` can't exceed €1.

## Measured costs (evals 2026-09-29 to 10-01, research 2026-10-03)

| What | Cost |
|---|---|
| Homepage preview | €0.09–0.26 (top end with 2 generated pictures) |
| Full site | €0.15–0.43 |
| Assistant edit | ~€0.012 |
| Generated picture | €0.068 |
| Photo description | ~€0.002 per photo |
| .si domain | ~€10–13/year (registry fee €10) |
| Hosting, edge, email per site | ~€6/year (assumption until billing runs) |
| Card payment | 1.5 % + €0.25 |

## The plans

| | Free preview | Osnovni | Plus |
|---|---|---|---|
| Price (VAT incl.) | €0 | €15/month or €150/year | €29/month or €290/year |
| Domain | – | included on yearly | included on yearly |
| Site | homepage, not publishable | up to 8 pages, publishing, export | up to 20 pages, 2 languages, collections (when built) |
| AI | 1 homepage without an account; with an account 1 more and 5 edits; never more than €0.60 per person | €1.50/month (+€3 first month) | €3.50/month (+€3 first month) |
| Generated pictures | as the preview needs | 3/month | 10/month |
| Support | – | email | same day; setup service included on yearly |
| Worst-case margin | –€0.60 | ≥ €82/year (yearly), ≥ €6.80 first month (monthly) | ≥ €173/year, ≥ €16 first month |

Founding offer (first 100 Osnovni customers): €99 for the first year, margin ≥ €41.

Plus is made of things that cost us almost nothing per customer (pages, a language, collections, faster answers), so its margin is the biggest in euros and in percent.

## No overspending

- **AI allowance per plan**, a hard monthly € limit counted from real costs (the per-call log), with the estimate held while a job runs. At 100 % the assistant pauses until the next allowance month; direct editing is never limited. Built.
- **Free lifetime cap**: everything a free account's jobs cost, its claimed anonymous preview included, never passes `tiers.free.lifetimeEur`, whatever the counts allow. Built.
- **Daily pools and the global cap** stay as they are.
- **AI paket** (later, needs billing): €5 for €2.50 more allowance this month, at most 2 a month; the schema refuses a top-up that doesn't earn more than it adds.
- **Per-plan site limits** (pages, languages, generated pictures per month) are in config now and enforced as each feature is built (item `it-plan-limits`).

## Upsells

**Free → Osnovni**
- The refusals name the plan: "Z naročnino Osnovni (15 € na mesec) dobite celotno stran, objavo na svoji domeni in pomočnika vsak mesec." Built.
- Publish says where the site will live: the domain is checked while the preview generates, so the button reads "Objavi na pekarnakvas.si" (custom-domains plan).
- The rest of the site is listed but locked: the brief already names the pages, so the preview shows them greyed out at no extra cost.
- Day 5 of the 7-day anonymous preview: an email "your preview is deleted in 2 days; keep it and publish it".
- The founding €99 offer, with its count left.

**Osnovni → Plus**
- Reaching the AI allowance offers Plus (built in the refusal text) and, once billing exists, the AI paket.
- Adding a 9th page, a second language or a blog shows "Plus" at that button.
- The monthly stats email names what Plus adds where it fits (visitors from abroad → a second language).
- At renewal, Plus with the unused months credited.

## Tracking accounts and plans (how you manage them)

Now (built in this branch), in `/admin`:
- **Summary**: accounts per plan (Brezplačno, Osnovni, Plus), monthly revenue at the planned prices, and what the assistant cost this month across all accounts.
- **Each account**: plan and since when, sites and how many are published, AI cost this month against its allowance (free: in total against the lifetime cap), shown in red when over, and a "Zamenjaj paket" control. Changing the plan keeps the date paid rights started (the allowance month doesn't reset).
- **Giving a plan**: the allow-list form takes the plan. Before billing, the allow-list *is* the subscription list.
- HQ shows the same numbers on the Overview once the app reports them (a later item).

With billing (phase 3):
- A `subscriptions` table replaces the allow-list as the source of a plan: account, plan, period (monthly/yearly), status (trial, active, past due, cancelled), paid until, the domain it includes, invoice and payment ids. The allow-list stays for design partners and support.
- Plan changes: up at once (the price difference credited for the rest of the period), down at the period's end; cancelled: the site stays published until the paid period ends, then it is unpublished (never deleted for 90 days; export always works).
- The admin page grows a per-account timeline (plan changes, invoices, payments, domain renewals) and a monthly report: revenue, AI cost, domain cost, margin per plan, accounts near or over their allowance, free accounts that hit the cap (warm leads).

## Open

- Hosting share per site is an assumption; replace with the measured Railway bill per published site once there are 20+.
- Whether free previews should use fewer generated pictures (1 instead of 2) to bring the typical free cost down further: needs a per-tier picture count in the pipeline.
- VAT: prices include VAT whether or not we're registered; below €60,000 a year we keep the VAT share.
