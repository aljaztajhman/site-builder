# Free generation limits (plan, mandatory before public launch)

Status: built (2026-10-01, PRs claude/accounts and claude/generation-limits); the deployed smoke test waits on the merge and Turnstile keys. Owner's direction (2026-10-01): one free homepage without an account, more with an account, and more again by how much someone pays. Nobody can keep generating for free. Decisions: `sb-free-tiers` = 1-2-10, `sb-bot-check` = Turnstile, `sb-ai-allowance` = first-month (10 % of the monthly price + €3 in the first month), `sb-preview-gate`, `sb-full-access`, `sb-signin`.

## Why

Every generation is a real model and image bill, and today nothing stops a visitor from repeating it:

| Action | Measured cost | Source |
|---|---|---|
| Homepage preview, no pictures | €0.09 | eval/report-home.md, 10 fixtures, 2026-09-29 |
| Homepage preview, 2 generated pictures | €0.26 | `pnpm eval --only frizerstvo-lana --scope home --photos 0`, 2026-10-01 |
| Full site, no pictures | €0.23 median | eval/report.md, 10 fixtures |
| Full site, 3 generated pictures | ~€0.43 (€0.23 + 3 × €0.068) | estimate from config prices |
| Chat edit | ~€0.012 | eval edit stage, 5 edits €0.06 |

The only guard today is `limits.dailyModelSpendCapEur` (€10/day for everyone together). A single script could use the whole day's budget in ~40 homepage previews, and then real customers can't generate either.

## Tiers

Limits are counted in euros from the per-stage cost log that every model and image call already writes. Counting euros instead of "generations" makes a raised quality budget (more pictures, a stronger model) cost more allowance automatically. The owner-facing wording still counts homepages and edits, since owners understand those.

| Tier | Who | Gets | Can't |
|---|---|---|---|
| 0 Anonymous | No account; a signed cookie (device) plus a keyed IP hash | 1 homepage preview. Kept 7 days, then deleted | Edit, regenerate, publish, see more pages. Saving or changing it needs an account |
| 1 Free account | Email confirmed by magic link | The anonymous preview carries over, plus 2 more homepage generations and 10 chat edits in total (not per month) | Full site, publish, custom domain |
| 2 Paid | Billing (phase 4); before that, the allow-list (`sb-full-access`) | Full site, publish, export. A monthly AI allowance in € (`sb-ai-allowance`), shown as "about N regenerations or M edits" | Unlimited regenerations; past the allowance, edits wait until next month or a top-up |
| 3+ Higher plans | Later | Larger allowance and quality options (e.g. the Opus full-build pass already behind `useFullBuildModel`) | |

Direct editor changes (typing in the preview, forms, photo swaps) cost nothing and are never limited.

## Abuse guards

1. **Server-side checks at every job start.** The web API checks the allowance before every `queue.send("generate" | "edit")` (apps/web/src/app.ts: intake, "Ustvari znova", chat edit). It checks the job's estimated cost (from config) against what is left, and adds the real cost from the log after the job. The browser decides nothing.
2. **Spending pools.** The global daily cap stays as the hard ceiling and gets sub-pools: anonymous €/day, free-account €/day, paid separately. A flood of anonymous previews then never blocks paying customers. When the anonymous pool is empty, the intake says "today's free previews are used up; sign up to continue" instead of failing.
3. **Rate limits** per device cookie, per keyed IP hash (the contact form's approach: the IP is never stored, hashes cleared after a day) and per email.
   - Per-IP limits stay loose, e.g. 5/day: Slovenian mobile networks put many phones behind one IP.
   - The device cookie and the account do the precise counting.
4. **Email hygiene.**
   - Normalise addresses (lower case; Gmail dots and `+tags`).
   - Block disposable-email domains (a maintained list in the repo).
   - One free tier per normalised email.
5. **Bot check on the anonymous intake** (`sb-bot-check`): Cloudflare Turnstile, or limits and honeypot only. It sits on our own product's form, not on client sites. The privacy policy has to name it.
6. **Junk filter before spending.** The classifier (Haiku, €0.0006) already runs first. An intake it can't place, or with fewer than ~40 characters of description, is refused before any Sonnet or image call. The text stays in the form.
7. **Monitoring.**
   - A daily line in the worker log with spend per tier and pool.
   - A warning at 80 % of a pool.
   - The model-call log keeps site and tier, so a runaway account shows up in one query.

## Quality budget per tier

With free use capped, generation quality can rise where it converts. The settings per tier live in config (`plans.*`): model and effort, number of generated pictures, critique rounds, Lighthouse in the preview. Raising the anonymous preview's quality then raises only that tier's bill.

The €0.30 homepage target (PRODUCT.md) is the anonymous-tier budget today. Raising it is the owner's call.

## Data

- Anonymous previews, their uploads and their generated pictures are deleted after 7 days unless an account claims them.
- Hashed IPs follow the contact-form rule: cleared after a day.
- The privacy policy lists all of this.

## Done means (launch blockers)

- [x] Tiers, allowances, pool sizes and job cost estimates in config, none in code (`tiers` in config/app.config.json, validated: pool shares add up to at most 1)
- [x] Allowance check before every generate and edit job; real cost deducted after; tested without real calls (`reserveJob` before every `queue.send("generate" | "edit")`; the estimate is held in `ai_jobs` until the job's logged calls replace it; `apps/web/test/limits.test.ts`, `packages/platform/test/usage.test.ts`; a stand-in classifier and logged costs, no recordings needed)
- [x] Anonymous: 1 homepage per device, loose per-IP limit, 7-day expiry, a claim on sign-up; tested (endpoint tests incl. 10 simultaneous requests → 1 preview; worker housekeeping test deletes the expired preview and its files; Chromium end to end `apps/web/test/limits-browser.test.ts`)
- [x] Free account: magic link (`sb-signin`: magic link), email normalisation and disposable-domain block, allowance counter shown in Slovene ("Še 2 brezplačni ustvarjanji domače strani in 10 sprememb s pomočnikom."; landing page, sites list, `GET /api/sites/:id` → `access.allowance.text`). The editor (being rebuilt) doesn't show it yet
- [x] Paid / allow-list: monthly € allowance with a reset, refusal message and no silent failure (10 % of `plans.paid.monthlyEur` + €3 in the first month, months from the allow-list date; tested incl. the reset)
- [x] Spending pools per tier under the global cap; an exhausted free pool never blocks paid jobs; tested (endpoint test and Chromium)
- [x] Bot check per `sb-bot-check`, named in the privacy policy (`/zasebnost`): Turnstile, tested with Cloudflare's test keys against a siteverify stand-in and in Chromium with a stand-in script. Not live: no Cloudflare account or keys yet
- [x] Junk-intake refusal before the first Sonnet call (under 40 characters at once; the classifier at the intake, and again first thing in the pipeline, before the brief and the photos' alt text; tested). The confidence threshold (0.5) is not calibrated on real junk: all 10 fixtures classify at 0.95–0.99
- [x] Daily spend-per-tier log line and 80 % pool warning (worker; tested, and seen in a local server's log)
- [ ] Deployed smoke test (`remote-smoke.ts --limits`): a second anonymous generation from the same device is refused, a free account stops after its allowance, and a paid job still runs with the free pools empty. Written; run only against a local server with replayed model answers (2026-10-01): every limits step passed except the two that need a generated preview (replayed full-site recordings don't make a homepage), so the 10-edit stop wasn't reached there (the endpoint tests cover it). Not run against Railway: needs this merged, deployed, and Turnstile test keys on `preview`
- [x] Landing page claims match the limits: no account needed for the first homepage, what a free account adds, no card, kept 7 days, a FAQ entry; "vodnim žigom" (no watermark exists) and "Potrebujete le e-poštni naslov" removed
