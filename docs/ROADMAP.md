# Roadmap to v1.0

**Goal:** Stranko v1.0 is launch-ready. A Slovenian small business can make a site it is proud of, pay for it, and put it on its own domain. The site is legal, it runs reliably, and we would show it to a stranger.

This file is the plan. Every session starts here: a hook prints "Now". Work that is not on this page goes to the **parking lot** first. Claude warns before starting anything off this page, whoever asked for it.

Written on 2026-10-16 from an inventory of TASKS.md (263 done, 158 open), HQ, docs/PRODUCT.md, docs/phases/ and config. TASKS.md stays the detailed checklist; this file decides what matters and in which order.

---

## Now

- **Current milestone:** M2 Launch gate: accounts, editor, email. M1 closed on 2026-10-18 (owner: "close M1"; final check 6 of 10 against a bar of 8, not re-scored by the owner's decision). M2 planned (docs/plans/m2-launch-gate.md, owner OK 2026-10-18); editor decided (keep today's). Next: the junk-check field, the missing PHASE-2 tests and the phone checklist, email from mail.postavi.si, then the live smoke test (€0.42, ask). One M1 follow-up for M2's first week: the slaščičarna hours badge under the phone buttons (TASKS).
- **Owner, in parallel (long lead times):** register the company (M3), find a lawyer for the legal pages (M3). New name Postavi; postavi.si bought 2026-10-17 (M5).
- **Side work (owner switched to it, 2026-10-18):** the postavi.si coming-soon page: phone intro, the description → build → review → publish → edit demo, the search story, the time band, "live site with an editor" copy (#231, #233, #238, this PR).
- **Last updated:** 2026-10-18.

---

## Milestones

Claude's track runs in order: M1 → M2 → M4 → M5 → M6 → M7. M3 is mostly the owner's and runs alongside from today, because company registration and the lawyer take weeks.

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

### M2 · Launch gate: accounts, editor, email (Claude + an owner check) — 1 of 6 met (much of the work under them is built)

Plan: docs/plans/m2-launch-gate.md (owner OK 2026-10-18). Decisions 2026-10-18 (owner): keep today's editor, Puck parked; PHASE-2's "≤ 60 s" means the first preview (the whole job's speed stays an M7 target); sign-in and form emails send from `mail.postavi.si`.

A new visitor can try it, sign up, edit and publish on the live app without help.

Exit criteria:
- [ ] Free-preview limits are live and the Railway smoke test passes with sign-in and limits (TASKS:49, :104; about €0.42, ask).
- [ ] Sign-in and form emails go through Resend from Stranko's own sending domain (`mail.postavi.si`, owner 2026-10-18), and a real send is verified (TASKS:87, :102).
- [ ] "Real business" junk check as its own field (TASKS:55).
- [x] Editor decision: keep today's editor for 1.0 or adopt Puck (TASKS:94). Owner, 2026-10-18: keep today's editor; Puck parked.
- [ ] Owner's own run on a phone: their photos, generate, edit, publish (TASKS:77).
- [ ] PHASE-2 exit criteria ticked.

### M3 · Company and legal (owner, Claude prepares) — 0 of 4 met

We are allowed to sell.

Exit criteria:
- [ ] Company registered (owner). Provider fields filled: name, address, registration and tax numbers (config `legal`).
- [ ] Terms (/pogoji) and privacy (/zasebnost) complete, reviewed by a lawyer, `legal.lawyerReviewed` true (TASKS:251–252). Claude drafts, the owner's lawyer signs off.
- [ ] AI-label wording checked by the owner (D1: caption + file mark).
- [ ] The launch check (apps/web/src/legal.tsx) passes.

### M4 · Payments (Claude, after M3's company) — 0 of 4 met

A customer can pay and we can account for it.

Exit criteria:
- [ ] Decision on the 1.0 payment path. Recommendation: yearly plans by invoice + bank transfer (UPN QR) first, Stripe for monthly after launch (TASKS:368–370, :405).
- [ ] Plans from config charged correctly: Osnovni €15/€150, Plus €29/€290, founding €99, setup €79. Invoices are numbered and legal. `plans.billingEnabled` true.
- [ ] Publishing a site requires an active plan. A test payment end to end on the live app (provider test mode).
- [ ] Upsells that need billing (TASKS:374) are done or parked.

### M5 · Domains (Claude + owner purchases) — 0 of 4 met (adapters and UI built on fakes)

A customer's site can live on their own domain, or on a Stranko subdomain.

Exit criteria:
- [ ] Platform domain bought (owner: postavi.si, bought 2026-10-17) and set as `PLATFORM_DOMAIN` on web and worker (TASKS:384, :393–395).
- [ ] Registrar (Openprovider) and Cloudflare for SaaS adapters wired, and the edge Worker deployed (TASKS:388, :390).
- [ ] End-to-end on live: buy or connect a test domain → TLS → the site serves. `domains.enabled` true, and `seo.indexSiteHosts` decided (TASKS:398).
- [ ] Who pays for a domain before billing is answered (TASKS:392). The d.o.o. contact person is set (TASKS:391).

### M6 · Operations (Claude) — 1 of 6 met

It keeps running, and we know when it doesn't.

Exit criteria:
- [ ] Production environment separate from staging, with a promote workflow (TASKS:351).
- [ ] Repository protection on main (TASKS:352).
- [ ] Backups with a restore drill done once (TASKS:353).
- [ ] Monitoring and alerts on errors and spend (TASKS:358). Daily spend cap set on Railway.
- [x] Analytics events on (TASKS:360, `analytics.events`; PR #224, 2026-10-17).
- [ ] **Switches cleaned up** (owner, 2026-10-17: must happen before launch). All remaining `promptFixes` (pictures, critique, altText, judge, brief, classifier, edit) and the cost and speed switches (`costCuts.secondCritiqueOnlyOnFailures`, `costCuts.contentRetryAsPatch`, `prompts.compactCatalogue`, `pipeline.homepageFirst`, `structuredOutputForContent`) are turned on after an eval. The experiments (`designer.agent` studio, `variety.genome`, `useFullBuildModel`) are deleted with their code. No dead switches at launch.

### M7 · Launch (owner + Claude) — 0 of 5 met

Exit criteria:
- [ ] Landing page and pricing page match config and the legal pages.
- [ ] Founding offer (first 100) works end to end.
- [ ] Lighthouse mobile ≥ 90 performance and 100 accessibility on generated sites. Targets: homepage ≤ €0.30 and ≤ 60 s, full site ≤ €1.50 and ≤ 4 min (PRODUCT.md).
- [ ] First 3 real businesses onboarded (owner's network) and happy.
- [ ] Go-to-market items needed on day one (TASKS:469+, the owner picks which).

---

## Parking lot

Ideas and half-built things that are **not** on the way to 1.0. Something leaves the parking lot only when the owner moves it into a milestone.

- **Set variety for v1.0 (owner, 2026-10-17).** Set variety ≥ 4 from 2 of 3 reviewers, the rest of Design 5 (U1–U7, incl. Wave P's structure presets, off since PR #220), option B "pictures lead every first screen", new hero structures, direction §6, and the AI studios (picture studio, Fable studio). Why: two cheap proofs (layouts, PR #220; type and details, PR #221) did not move the reviewers' variety score (2–3), while today's per-page quality already beats both studios. Revisit after launch.
- Fonts and details (PR #221, closed 2026-10-17: seven type voices, header, CTA, AI caption, headline fit; switches off): nicer per the contact sheets, not needed for launch. Before any revival, fix the Opus review's findings (AI label lost on collection pages, voices undone by `enforceDesign`, headline fit collapsing in pinned columns, config switches not wired, voice fonts in every export).
- Town in the hero lead (Review 50 item 15), G2 on 20 businesses, the owner's preset critiques (heroes and drawings too basic, the yellow background, direction summaries promising B&W photos) unless the final check's approval names them.
- Studio 1.0 (S0–S7 tournament), the hybrid designer (Design 5 U6/U7, G3), the Fable studio, the picture studio.
- Okus round 3 ratings. Rate them if an M1 decision needs the owner's taste.
- Puck editor (owner, 2026-10-18: today's editor for 1.0). Section AI actions (TASKS:136), the Slovene copy judge (TASKS:137), editor keyboard paths (TASKS:564).
- CMS extras: English entry pages in eval (TASKS:464), spec size on long blogs (TASKS:467).
- Analytics steps beyond "events on" (TASKS:349+).
- Agent-team tooling (TASKS:338+).
- Pictures for photo-less businesses beyond D2 (Review 50 item 14), paraphrased repeats (TASKS:525).
- Stripe monthly subscriptions (after the M4 decision).

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
