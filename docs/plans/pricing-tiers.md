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
- **Per-plan site limits** (it-plan-limits, built 2026-10-04 on claude/upsells): pages (Osnovni 8, Plus 20; home and standard pages, a collection's list page included), languages (1 / 2), collections (Plus only: `plans.*.site.collections`) and generated pictures per allowance month (3 / 10). The API refuses every direct edit past a limit (`limitBreach`, whatever the edit's path) and the worker every chat edit, in Slovene, naming the plan that has more; only growth is refused, so a site already over can be edited and trimmed. Pictures are counted from the per-call log and held again at each picture's reservation, so two jobs can't both take the last one; past the month's count a generation still runs, with fewer pictures, and says so. A free preview fills up to `imageGen.pipeline.fillUpToFree` (1) generated pictures instead of 2. Spec v13 holds 24 pages (was 12), so Plus's 20 fit.

## Upsells

**Free → Osnovni**
- The refusals name the plan: "Z naročnino Osnovni (15 € na mesec) dobite celotno stran, objavo na svoji domeni in pomočnika vsak mesec." Built; publishing and export refusals name it too.
- Publish says where the site will live: for a free preview the editor asks the publish step's own domain check once, and Objavi reads "Objavi na pekarnakvas.si" (on a phone the panel names the domain); a tap says it is part of Osnovni, with its price. Built; shows only while `domains.enabled`.
- The rest of the site is listed but locked: the brief's other pages by menu name (no model call), each with "Osnovni", and Osnovni's monthly and yearly price, in the guest panel and where a free account's page list would be. Built.
- Day 5 of the 7-day anonymous preview: the visitor may leave an address on the preview ("Opomnik pred izbrisom", optional); one email goes to it `tiers.anonymous.reminder.daysBefore` (2) days before deletion, from the web process, once, with an idempotency key. Its link keeps the preview once the visitor signs in with that address, on any device; the address is used for nothing else and goes with the preview. Built (migration 19); `/zasebnost` says so.
- The founding €99 offer, with its count left: the landing page shows "še N prostih mest", N = `foundingOffer.customers` minus the allow-list entries the admin marked "Ustanovna cena" (`allow_list.founding_at`); the line goes when none are left. Built. Before billing, the admin's mark is the only source; with billing, a paid founding year will be.

**Osnovni → Plus**
- Reaching the AI allowance offers Plus (built in the refusal text) and, once billing exists, the AI paket (not built: needs billing).
- Adding a 9th page, a second language or a blog shows "Plus" at that button, and the API refuses it naming Plus. Built for pages and collections; there is no language editor yet, so Strani shows a "Jeziki" line with Plus instead, and the API and chat edits refuse a second language on Osnovni.
- The monthly stats email names what Plus adds where it fits: near Osnovni's page limit (7 or 8 pages), or a one-language tourist farm or restaurant (we count no visitor countries, so the trade stands in for "visitors from abroad"). Built.
- At renewal, Plus with the unused months credited: the rule is in config (`plans.upgrade.credit` = unused-whole-months) and `upgradeQuote` (@sb/config, tested); nothing charges it until billing exists.

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
- Free previews now make 1 generated picture instead of 2 (`imageGen.pipeline.fillUpToFree`, it-plan-limits). Not measured yet (budget €0): the saving is ~€0.07 per photo-less preview; whether the homepage still looks photo-led with one picture needs `pnpm eval --only <fixture> --scope home --photos 0`.
- VAT: prices include VAT whether or not we're registered; below €60,000 a year we keep the VAT share.
