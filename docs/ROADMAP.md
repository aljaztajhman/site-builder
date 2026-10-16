# Roadmap to v1.0

**Goal:** Stranko v1.0 is launch-ready. A Slovenian small business can make a site it is proud of, pay for it, and put it on its own domain. The site is legal, it runs reliably, and we would show it to a stranger.

This file is the plan. Every session starts here: a hook prints "Now". Work that is not on this page goes to the **parking lot** first. Claude warns before starting anything off this page, whoever asked for it.

Written on 2026-10-16 from an inventory of TASKS.md (263 done, 158 open), HQ, docs/PRODUCT.md, docs/phases/ and config. TASKS.md stays the detailed checklist; this file decides what matters and in which order.

---

## Now

- **Current milestone:** M1 Design good enough. Two cheap proofs failed the variety bar on 2026-10-16: Wave P (layouts) and type and details (docs/plans/m1-type-details.md; overall recovered to 3, variety still 2–3). Next: the owner decides option B (pictures lead, no text-only first screens) and the phone bar overlap.
- **Owner, in parallel (long lead times):** register the company (M3), buy the platform domain (M5), find a lawyer for the legal pages (M3).
- **Last updated:** 2026-10-16.

---

## Milestones

Claude's track runs in order: M1 → M2 → M4 → M5 → M6 → M7. M3 is mostly the owner's and runs alongside from today, because company registration and the lawyer take weeks.

Each milestone has exit criteria. A milestone is done only when every criterion is met and checked. No "80 %" milestones: half-done work stays open on this page, and is not quietly left behind for something new.

### M1 · Design good enough (Claude) — 0 of 6 criteria met

Sites pass the three outside reviewers and the owner's eye, with a set of ten that reads as ten designs.

Exit criteria:
- [ ] Design 5 Wave P passes: set variety ≥ 3.5 from 2 of 3 reviewers on both proof sets, and the owner agrees on the contact sheets. If it fails, the plan switches to §6 of the direction (scale, type, second moment). M1 continues either way.
  - 2026-10-16: **failed** (€0.21). fresh 10 variety 3/3/2, Review 50 2/2/2, Review 50 overall 3 → 2 for Gemini and GPT. eval/outside-review/wave-p-sets/README.md. The switch to §6 and what happens to the next criterion (U1–U9) is the owner's call.
- [ ] Design 5 waves needed for launch are built and on. U1 is v22, the gate and the structures; U2 is the page gate on every path; U3–U5 bring presets, photo grade and the variety rule; U8 is chrome and the single-page nav; U9 is the AI caption. U6/U7 (studio wiring, hybrid designer) are parking lot, not M1.
- [ ] Every open reviewer blocker is fixed in code, with a test:
  - AI label clipped by arched crops;
  - arched photo cut at the phone edge;
  - caron touching the line above in the footer wordmark;
  - phone bar over a hero link;
  - week chart without hour labels;
  - logo viewBox clipped;
  - call action shown three times on phones;
  - lone "Domov" in the nav;
  - Review 50 items 9–13 (compact hours, two-column desktop variants, headline and wordmark caps, phone hero button).
- [ ] The owner's critiques are closed: heroes and drawings too basic (9 of 20 presets rejected), the yellow background, direction summaries that promise B&W photos.
- [ ] G2 measured on 20 new businesses. Per page ≥ 3.6 (today 3.47), all three reviewers pass ≥ 8 of 10, set variety ≥ 4 from 2 of 3, and fewer than 5 agreed blockers per 10 pages.
- [ ] Owner decides on the town in the hero (Review 50 item 15).

### M2 · Launch gate: accounts, editor, email (Claude + an owner check) — 0 of 6 met (much of the work under them is built)

A new visitor can try it, sign up, edit and publish on the live app without help.

Exit criteria:
- [ ] Free-preview limits are live and the Railway smoke test passes with sign-in and limits (TASKS:49, :104; about €0.42, ask).
- [ ] Sign-in and form emails go through Resend from Stranko's own sending domain, and a real send is verified (TASKS:87, :102).
- [ ] "Real business" junk check as its own field (TASKS:55).
- [ ] Editor decision: keep today's editor for 1.0 or adopt Puck (TASKS:94). Recommendation: keep today's and park Puck.
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
- [ ] Platform domain bought (owner; stranko.eu looked free on 3 Oct) and set as `PLATFORM_DOMAIN` on web and worker (TASKS:384, :393–395).
- [ ] Registrar (Openprovider) and Cloudflare for SaaS adapters wired, and the edge Worker deployed (TASKS:388, :390).
- [ ] End-to-end on live: buy or connect a test domain → TLS → the site serves. `domains.enabled` true, and `seo.indexSiteHosts` decided (TASKS:398).
- [ ] Who pays for a domain before billing is answered (TASKS:392). The d.o.o. contact person is set (TASKS:391).

### M6 · Operations (Claude) — 0 of 6 met

It keeps running, and we know when it doesn't.

Exit criteria:
- [ ] Production environment separate from staging, with a promote workflow (TASKS:351).
- [ ] Repository protection on main (TASKS:352).
- [ ] Backups with a restore drill done once (TASKS:353).
- [ ] Monitoring and alerts on errors and spend (TASKS:358). Daily spend cap set on Railway.
- [ ] Analytics events on (TASKS:360, `analytics.events`).
- [ ] **Switches cleaned up.** Every feature flag that is off (config: promptFixes ×13, costCuts, compactCatalogue, homepageFirst, structuredOutputForContent, genome, useFullBuildModel, designer studio) is either turned on after an eval or deleted with its code. No dead switches at launch.

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

- Studio 1.0 (S0–S7 tournament), the hybrid designer (Design 5 U6/U7, G3), the Fable studio, the picture studio.
- Okus round 3 ratings. Rate them if an M1 decision needs the owner's taste.
- Puck editor (unless M2's decision picks it). Section AI actions (TASKS:136), the Slovene copy judge (TASKS:137), editor keyboard paths (TASKS:564).
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
5. **Changing the plan:** only the owner moves milestones, exit criteria or parking-lot items. Claude proposes; the owner decides in chat. The decision is noted here with its date.
