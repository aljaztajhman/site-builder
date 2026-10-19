# Roadmap to v1.0

**Goal:** Stranko v1.0 is launch-ready. A Slovenian small business can make a site it is proud of, pay for it, and put it on its own domain. The site is legal, it runs reliably, and we would show it to a stranger.

This file is the plan. Every session starts here: a hook prints "Now". Work that is not on this page goes to the **parking lot** first. Claude warns before starting anything off this page, whoever asked for it.

Written on 2026-10-16 from an inventory of TASKS.md (263 done, 158 open), HQ, docs/PRODUCT.md, docs/phases/ and config. TASKS.md stays the detailed checklist; this file decides what matters and in which order.

---

## Now

- **Current milestone:** none started (owner, 2026-10-19: "Close M6, but don't start anything new yet"). M6 closed 2026-10-19 (production, backups with a restore drill, alerts, clean switches, promote; first release v0.1.0). Waiting on the owner: M5 (2 of 4) needs a payment method on Cloudflare for customers' own domains; M2 (2 of 6) needs the rest of the phone run (docs/owner-phone-run.md, starts at app.postavi.si). Next in the order: M4 payments, built in test mode, when the owner says go.
- **Editor (owner, 2026-10-19, after seeing a POC):** five editor UX changes join M2 as criterion 7 (PR #269, a draft until the architecture note and a review are in). Eleven more editor ideas are parked as "Editor 2.0" below; nothing else from that list is 1.0 work.
- **Order (owner, 2026-10-18):** company registration comes last; next after M2 are M5 (domains, with the Postavi rename) and M6 (operations), then M4 in test mode and M7a, a free beta.
- **Owner, in parallel (long lead times):** register the company (M3), find a lawyer for the legal pages (M3). New name Postavi; postavi.si bought 2026-10-17 (M5).
- **Side work (owner switched to it, 2026-10-18):** the postavi.si coming-soon page: phone intro, the description → build → review → publish → edit demo, the search story, the time band, "live site with an editor" copy (#231, #233, #238, this PR).
- **Last updated:** 2026-10-19.

---

## Milestones

Claude's track runs in order (owner, 2026-10-18: the company is registered last, so everything that doesn't need it comes first): M1 → M2 → M5 → M6 → M4 built in test mode → M7a free beta → (company registered, M3) → M7b paid launch. M3's company and lawyer are the last switch before charging money; M3's drafts (terms, privacy) are written before that with the company details as marked placeholders.

Each milestone has exit criteria. A milestone is done only when every criterion is met and checked. No "80 %" milestones: half-done work stays open on this page, and is not quietly left behind for something new.

### M1 · Design good enough (Claude) — done 2026-10-18 (4 of 4 by the owner's decision; the final check scored 6 of 10 against a bar of 8)

Sites pass the three outside reviewers and the owner's eye. Set variety is not a v1.0 goal (owner, 2026-10-17).

Decision 2026-10-17 (owner): lock today's design (Design 3 + the Review 50 fixes; it beat both AI studios: 28 of 50 pages pass all three reviewers, 7 of 10 new businesses). Two cheap variety proofs failed to move set variety (Wave P layouts, PR #220; type and details, PR #221), so variety work goes to the parking lot. The six earlier criteria (Wave P, Design 5 waves U1–U9, the blocker list, the owner's critiques, G2 on 20 businesses, the town in the hero) are replaced by these three.

Exit criteria:
- [x] Every known blocker is fixed in code, with a test that failed before (PR #222). The eight listed below, and the final check's held-page defects: the desktop hero card inside the first screen, number-plate style only for vehicle trades, filled buttons that keep their padding, the footer wordmark size and the name printed three times. One follow-up stays open for M2's first week (owner, 2026-10-18): the slaščičarna hours badge under the phone buttons at 360 px; its fix (branch `claude/m1-final-hero`) still failed its test at 360×640, so it was left out. kolesarski-servis-ovinek's hero list meets the bar at 390×844 too (todo in tools/eval/test/m1-chrome-blockers.test.ts).
  - AI label clipped in arched photo crops;
  - arched photo cut at the phone edge;
  - č/š/ž touching the line above in the footer wordmark;
  - phone bar over a hero link;
  - week chart without hour labels;
  - logo viewBox clipped;
  - call action shown three times on phones;
  - lone "Domov" in the nav on single-page sites;
  - any other open reviewer blocker in eval/outside-review (fresh10, review50-after) that is still real.
  - The arched photo at the phone edge did not reproduce: every picture stays inside 360 px on all goldens, Review 50 and fresh 10 pages; a test now guards it. What reviewers saw was the first screen and the phone bar cutting the arch.
- [x] Six prompt fixes are on (owner, 2026-10-17: turned on directly, without per-fix evals; CI's offline eval is the guard): `promptFixes.directions` (no B&W or duotone promises, editorial photo hero), `beige` and `warmSurface` (no cream or beige page backgrounds), `catalogue` (incl. the call-button rule), `oneHero` (one main heading per page), `sloveneStyle` (formal vi, Slovene typography, no English words). The final check runs with them on.
- [x] Final check on 10 brand-new businesses (never tested; new trades and towns; with and without photos): at least 8 of 10 pass all three reviewers (Gemini, GPT, Fable), scored per page.
  - 2026-10-17: **6 of 10** passed all three reviewers (bar 8; all 10 pass the two-of-three filter). Means Gemini 4.09, GPT 3.64, Fable 3.52 (the earlier fresh 10: 3.99, 3.34, 3.39). Owner's decision 2026-10-17 ("no rescore, just fix and letsgo"): fix the 4 held pages' defects with tests and **don't re-score**. The criterion is ticked by that decision, not by the number. Where the fixes stand: see criterion 1. Cost €3.89 (photos €1.02, generation €1.66, scoring €1.21). eval/outside-review/final10.
- [x] The owner looks at the pages (desktop and phone contact sheets) and approves them: 2026-10-17, "letsgo" (claude.ai artifact "Stranko M1 Final Check").

### M2 · Launch gate: accounts, editor, email (Claude + an owner check) — 2 of 7 met; the rest closes with the owner's phone run and the editor package

Plan: docs/plans/m2-launch-gate.md (owner OK 2026-10-18). Decisions 2026-10-18 (owner): keep today's editor, Puck parked; PHASE-2's "≤ 60 s" means the first preview (the whole job's speed stays an M7 target); sign-in and form emails send from `mail.postavi.si`.

A new visitor can try it, sign up, edit and publish on the live app without help.

Exit criteria:
- [ ] Free-preview limits are live and the Railway smoke test passes with sign-in and limits (TASKS:49, :104). 2026-10-18: live smoke 16/16 (sign-in, edit, publish, one owner per site, export); limits 2/4: the two anonymous steps need Cloudflare's test keys, so the owner's phone run checks them with the real bot check. €0.07.
- [ ] Sign-in and form emails go through Resend from Stranko's own sending domain (`mail.postavi.si`, owner 2026-10-18), and a real send is verified (TASKS:87, :102). 2026-10-18: mail.postavi.si verified, live app sends from it, a real sign-in email delivered; the form email is checked in the owner's phone run.
- [x] "Real business" junk check as its own field (TASKS:55). PR #241, 2026-10-18: the classifier answers `isBusiness`; 30 cases (8 written after the prompt): all 12 junk refused, 17 of 18 real accepted (a question-shaped request with no detail is refused with a hint to describe the business; doesn't use the free preview). €0.15.
- [x] Editor decision: keep today's editor for 1.0 or adopt Puck (TASKS:94). Owner, 2026-10-18: keep today's editor; Puck parked.
- [ ] Owner's own run on a phone: their photos, generate, edit, publish (TASKS:77). Checklist: docs/owner-phone-run.md (about 15 minutes; owner allow-listed).
- [ ] PHASE-2 exit criteria ticked. 2026-10-18: four of six covered by tests, CI and the live smoke; the other two close with the phone run (docs/phases/PHASE-2.md).
- [ ] Editor UX package (owner, 2026-10-19, after seeing the POC; TASKS "Editor UX package"): (1) an edit swaps only its section in the preview, no reload; (2) a quiet save status in the app bar instead of a toast per autosave; (3) an edit hint on text that can be edited in place (hover on desktop, an "Izbrano … Uredi" strip on phones); (4) section and page delete without a dialog, with "Razveljavi" in the toast, plus Redo and Ctrl+Z / Ctrl+Y; (5) "Še to potrebujemo" with progress and fields grouped by section. Built as PR #269 (draft, 2026-10-19: typecheck, lint, build and 74 browser tests green in the worktree). Met when the PR is merged with the architecture note and a review.

### M3 · Company and legal (owner, Claude prepares) — 0 of 4 met

We are allowed to sell.

Exit criteria:
- [ ] Company registered (owner). Provider fields filled: name, address, registration and tax numbers (config `legal`).
- [ ] Terms (/pogoji) and privacy (/zasebnost) complete, reviewed by a lawyer, `legal.lawyerReviewed` true (TASKS:251–252). Claude drafts, the owner's lawyer signs off.
- [ ] AI-label wording checked by the owner (D1: caption + file mark).
- [ ] The launch check (apps/web/src/legal.tsx) passes.

### M4 · Payments (Claude; built and tested in test mode before the company exists, switched on with it) — 0 of 5 met

A customer can pay and we can account for it.

Exit criteria:
- [ ] Decision on the 1.0 payment path. Recommendation: yearly plans by invoice + bank transfer (UPN QR) first, Stripe for monthly after launch (TASKS:368–370, :405).
- [ ] Plans from config charged correctly: Osnovni €19/€190, Plus €39/€390, founding €99 then 20 % off for life, setup €149 (`sb-pricing-2`). Invoices are numbered and legal. `plans.billingEnabled` true.
- [ ] Publishing a site requires an active plan. A test payment end to end on the live app (provider test mode).
- [ ] A switch-on checklist for the day the company exists: the config fields, live keys and the one live payment test, each step written down; built and tested on placeholder company data before then.
- [ ] Upsells that need billing (TASKS:374) are done or parked.

### M5 · Domains (Claude + owner purchases) — 2 of 4 met (adapters and UI built on fakes)

A customer's site can live on a Postavi subdomain or on a domain its owner already has.

Decisions 2026-10-19 (owner): postavi.si's DNS moves from Namecheap to Cloudflare, with every record copied first. In the free beta, sites live at <name>.postavi.si, and owners can connect a domain they already have. Buying domains for customers (Openprovider) waits for paid plans and moves to M7b.

**Live 2026-10-19:** postavi.si's DNS is on Cloudflare (all 9 Namecheap records copied and compared first; nameservers switched, delegated in ~54 min; email and the homepage unaffected). The edge Worker `postavi-edge` is deployed through the Cloudflare API (ORIGIN `https://web-preview-31c6.up.railway.app`, route `*.postavi.si/*`, proxied wildcard `*` AAAA 100::; the apex, www, app and the mail records stay DNS-only, so they never pass the Worker). Railway: `PLATFORM_DOMAIN=postavi.si` on web and worker, `SITE_PROXY_SECRET` on web, `EMAIL_FROM` "Postavi <prijava@mail.postavi.si>", custom domain app.postavi.si added (certificate waits for resolvers to drop a cached NXDOMAIN; then APP_URL moves). Checked: https://gostilna-pri-zlati.postavi.si/ serves over HTTPS through the Worker with no cookie and noindex; an unknown name and admin.postavi.si answer 404; the worker republished 1 site for its new address (1 blocked by the checklist).

Exit criteria:
- [x] Platform domain bought (owner: postavi.si, bought 2026-10-17) and set as `PLATFORM_DOMAIN` on web and worker (TASKS:384, :393–395). Done 2026-10-19: sites live at <name>.postavi.si through the edge Worker.
- [ ] Cloudflare for SaaS adapter wired and the edge Worker deployed (TASKS:388, :390). Openprovider moved to M7b (owner, 2026-10-19). Worker deployed 2026-10-19; SaaS needs a payment method on the Cloudflare account (owner).
- [ ] End-to-end on live: connect a test domain → TLS → the site serves. Connecting is switched on (registering stays off), and `seo.indexSiteHosts` decided (TASKS:398).
- [x] Who pays for a domain before billing: nobody; no domains are bought before paid plans (owner, 2026-10-19). The d.o.o. contact person (TASKS:391) moves to M7b with registering.

### M6 · Operations (Claude) — done 2026-10-19 (6 of 6; owner: "Close M6")

It keeps running, and we know when it doesn't.

Exit criteria:
- [x] Production environment separate from staging, with a promote workflow (TASKS:351). Production exists since 2026-10-19 (Railway env `production`, own Postgres 18 and bucket, deploys branch `release`; app.postavi.si and the edge Worker point at it; `preview` is staging at its Railway address). `release` was fast-forwarded by hand once to bootstrap. First promote 2026-10-19: v0.1.0 (main 37cf19a), migrate-check restored production's backup and ran the migrations, release fast-forwarded, production healthy on it. The bucket secrets went from Railway to GitHub by script, never displayed.
- [x] Repository protection on main (TASKS:352): 17 required checks, no force pushes, no deletions (checked 2026-10-19).
- [x] Backups with a restore drill done once (TASKS:353). 2026-10-19: Railway cron service `backup` in production (03:00 UTC, PostgreSQL 18 client, `Dockerfile.backup`, PR #256); first backup `backups/2026-10-19.sql.gz` written and checked; restore drill into a throwaway database: 36 tables, 60 of 60 rows, dropped after (`pnpm db:restore-drill`).
- [x] Monitoring and alerts on errors and spend (TASKS:358). Daily spend cap set on Railway. 2026-10-19 (PR #255): the web process emails ALERT_EMAIL on failed health checks, failed jobs, a silent worker, spend at 80 % and at the cap; GitHub `uptime` checks app.postavi.si and postavi.si every 15 min; cap €3/day on both environments.
- [x] Analytics events on (TASKS:360, `analytics.events`; PR #224, 2026-10-17).
- [x] **Switches cleaned up** (owner, 2026-10-17: must happen before launch). All remaining `promptFixes` (pictures, critique, altText, judge, brief, classifier, edit) and the cost and speed switches (`costCuts.secondCritiqueOnlyOnFailures`, `costCuts.contentRetryAsPatch`, `prompts.compactCatalogue`, `pipeline.homepageFirst`, `structuredOutputForContent`) are turned on after an eval. The experiments (`designer.agent` studio, `variety.genome`, `useFullBuildModel`) are deleted with their code. No dead switches at launch. 2026-10-19: experiments deleted (PR #257, ~13k lines); the waiting switches on after one check (PR #262, €2.11: all 10 pass the automated checks, text 24 % cheaper). `contentRetryAsPatch` turned out to be live with structured output and stays on; homepage-first deleted (owner, 2026-10-19: it never ran for customers and can't work with structured output; may come back after launch; PR #265). Junk check re-checked with its new prompt: 30 of 30 (€0.02).

### M7 · Launch (owner + Claude), in two steps (owner, 2026-10-18) — 0 of 5 met

**M7a · Free beta (no company needed):** the first real businesses use Postavi free; no money changes hands. The owner checks with an accountant or lawyer that a free beta under their own name is fine.

- [ ] First 3 real businesses onboarded (owner's network) and happy.
- [ ] Lighthouse mobile ≥ 90 performance and 100 accessibility on generated sites. Targets: homepage ≤ €0.30 and ≤ 60 s, full site ≤ €1.50 and ≤ 4 min (PRODUCT.md).

**M7b · Paid launch (after the company, M3 and M4 switched on):**

- [ ] Landing page and pricing page match config and the legal pages.
- [ ] Founding offer (first 100) works end to end.
- [ ] Go-to-market items needed on day one (TASKS:469+, the owner picks which).
- [ ] Customers can buy a domain with their plan: Openprovider wired with recorded responses, a prepaid balance, the d.o.o. contact person, one real registration end to end (moved from M5, owner 2026-10-19).

---

## Parking lot

Ideas and half-built things that are **not** on the way to 1.0. Something leaves the parking lot only when the owner moves it into a milestone.

- **Set variety for v1.0 (owner, 2026-10-17).** Set variety ≥ 4 from 2 of 3 reviewers, the rest of Design 5 (U1–U7, incl. Wave P's structure presets, off since PR #220), option B "pictures lead every first screen", new hero structures, direction §6, and the AI studios (picture studio, Fable studio). Why: two cheap proofs (layouts, PR #220; type and details, PR #221) did not move the reviewers' variety score (2–3), while today's per-page quality already beats both studios. Revisit after launch.
- Fonts and details (PR #221, closed 2026-10-17: seven type voices, header, CTA, AI caption, headline fit; switches off): nicer per the contact sheets, not needed for launch. Before any revival, fix the Opus review's findings (AI label lost on collection pages, voices undone by `enforceDesign`, headline fit collapsing in pinned columns, config switches not wired, voice fonts in every export).
- Town in the hero lead (Review 50 item 15), G2 on 20 businesses, the owner's preset critiques (heroes and drawings too basic, the yellow background, direction summaries promising B&W photos) unless the final check's approval names them.
- Studio 1.0 (S0–S7 tournament), the hybrid designer (Design 5 U6/U7, G3), the Fable studio, the picture studio.
- Okus round 3 ratings. Rate them if an M1 decision needs the owner's taste.
- Puck editor (owner, 2026-10-18: today's editor for 1.0). Section AI actions (TASKS:136), the Slovene copy judge (TASKS:137), editor keyboard paths (TASKS:564).
- **Editor 2.0 (owner, 2026-10-19).** Eleven ideas from the editor review of 2026-10-19 that stay out of 1.0 (the five that went in are M2 criterion 7). Full list with sizes in TASKS "Editor 2.0 (parked)". Quick: ↑ ↓ ⋯ in the "Na tej strani" list; the Telefon/Računalnik choice reset at narrow widths. Medium: a fixed tab strip (Vsebina · Oblika · Fotografije · Strani · Podatki, a bottom bar on phones); "Dodaj razdelek" with search, most-used first and an assistant suggestion; drag-and-drop, paste and "Slikaj" for photos, drop onto a picture to replace it; the assistant bound to the selected section (section chips, change limited to it, the changed section flashes, "Razveljavi" in the reply); job progress without polling (SSE) and a "traja dlje" notice after 30 s instead of a 3-minute wait. Larger: design as "try, then apply" (hover previews a style or palette without a version, palettes from the owner's photos, a morph transition for "Druga podoba"); a lighter section panel (text first, layout and background under "Videz", static layout thumbnails); first-visit coach marks; splitting `editor.ts` into modules before any of the larger ones.
- CMS extras: English entry pages in eval (TASKS:464), spec size on long blogs (TASKS:467).
- Analytics steps beyond "events on" (TASKS:349+).
- Agent-team tooling (TASKS:338+).
- Pictures for photo-less businesses beyond D2 (Review 50 item 14), paraphrased repeats (TASKS:525).
- Stripe monthly subscriptions (after the M4 decision).
- **"Narejeno s Postavi" footer credit (owner parked it, 2026-10-19).** Decision sb-pricing-2 (PR #261): Osnovni keeps a small link to postavi.si in every published site's footer, Plus removes it, free previews always carry it. Plan when it is picked up: a render-time input from `plans.<plan>.site.footerCredit` in config (no spec migration), one link in every footer family styled from the site's tokens, identical in preview, publish and export, tests at 360 and 1280 px, the two pricing lines on the landing page from config. Belongs with M7 (pricing) once the owner moves it.

---

## How we stay on track

1. **Session start:** the SessionStart hook prints "Now". Claude says in one line where we are and what's next.
2. **Before any work:** Claude checks the request against "Now" and the milestones. If it isn't on them, Claude says so first: "this is off the roadmap (it fits the parking lot / milestone X); park it or switch?", and waits. This applies to Claude's own ideas too.
3. **Finish before starting:** a milestone's open criteria come before new fronts. A new problem found mid-way goes into the right milestone's criteria, or into the parking lot.
4. **End of every run:**
   - Claude ticks what landed here and in TASKS.md, and updates "Now" and the milestone %.
   - The % is the share of exit criteria met, never inflated.
   - HQ phases mirror the milestones.
5. **Checking work (owner, 2026-10-17):** one paid judging check per milestone, at its end. In between, build, with CI (typecheck, lint, tests, the offline eval) as the guard.
6. **Changing the plan:** only the owner moves milestones, exit criteria or parking-lot items. Claude proposes; the owner decides in chat. The decision is noted here with its date.
