# Phase plan: layout variety

Status: plan, 2026-10-15. Architect: Opus xhigh.

Inputs:
- docs/plans/design-direction-2026-10.md (Fable)
- .claude/plans/layout-map-2026-10-15.md (scout map)
- eval/outside-review/shootout.md
- docs/plans/review50-systemic-fixes.md

## Goal

A set of ten homepages that reviewers call varied (variety ≥ 4), with no loss per page. That means:
- 8 first-screen structures;
- chrome that differs per site;
- a variety rule across trade, town and the last ten sites;
- one page gate on every path that saves a spec;
- client photos leading.

## Non-goals

- Below the fold (direction §6: second moment, scale system). It is measured here and built in the next phase.
- New section types, the town in the hero (review50 #15), repeats said in different words.
- Wiring `look_fingerprints`, `uniqueEnough` or the picture-hash gate.
- Changing the live default. Everything sits behind `variety.structures` (off) until G2 passes and the owner turns it on.

## Re-score result (2026-10-15)

The studio pages got the Review 50 checks and were re-rendered free from the recordings, then re-scored.

| | Per-page mean | Blockers | Notes |
|---|---|---|---|
| Today | 3.47 | 9 | |
| Picture studio | 2.86 → 3.09 | 65 → 37 | imagery 2.40 |
| Fable studio | 2.98 → 3.22 | 57 → 25 | distinctiveness 3.52, imagery 2.91 |

Set variety didn't move: picture 2/3/2, Fable 1/3/2 (Gemini/GPT/Fable).

What this changes:
- **Library first is confirmed.** No paid designer is built before the structures pass G2.
- **The picture studio is retired** (D3) and is not a G3 arm.
- **Fable-direct stays only as a conditional G3 arm**, to test the direction's own "what would change this".
- **Free previews use the code chooser** (U5): no model call is added.

## Owner decisions

**Answered by the owner on 2026-10-15:**
- **D1:** caption plus hidden file mark (B + C).
- **D2:** an AI picture may be the hero when the business has no client photo that passes the grade.
- **D3:** trial accounts get today's pipeline (`designer.agent` "off").
- **D4:** €18.80 in October; November is decided later.

D2 changes R7: "an AI picture is never the hero's subject *when a client photo graded window or better exists*". With none, an AI picture may lead, labelled with the caption (D1).

The options as they were put to the owner:

**D1 AI label** (legal and transparency):
- Options:
  - A: a chip over the picture (today), kept inside crops.
  - B: a caption under the picture or in the gutter, in eyebrow style; the alt text keeps the label.
  - C: a machine-readable mark in the file (IPTC DigitalSourceType), added to A or B.
- Recommendation: B + C, after your own legal check (this is not legal advice).
- U9 builds A and B behind one renderer switch. A stays until you decide.

**D2 Imagery policy:**
- Options:
  - Adopt the policy: client photos are the only hero subject; AI pictures only as textures, materials or landscape at window or ribbon size; no drawings of the trade's object; thin line icons retired.
  - Keep AI hero pictures for businesses without photos.
- Recommendation: adopt. Existing sites change only when they are regenerated (the gate rule is "no new violations").

**D3 Designer:**
- Now: move trial accounts off the picture studio, either to today's pipeline or to Fable-direct (€0.66 a page).
- At G3: the code chooser vs a hybrid (Opus xhigh brief + Opus build).
- Recommendation:
  - Now: today's pipeline, which scores best.
  - Later: the hybrid only for paid tiers, and only if it beats the chooser side by side on variety and gains ≥ 0.2 per page, at ≤ €0.45 a page.

**D4 Budget:** see the eval plan.
- Recommendation: €18.80 in October (€56.81 of €86 spent, €29.19 left) for G1 + G2.
- November: €24.60 for G3, plus €9.10 conditional.

## Targets

| Direction §7 | This plan | Why |
|---|---|---|
| Per page: reviewer mean ≥ 3.8 | Report against 3.8. The gate to ship: no lower than today's same-run mean minus 0.05. | This phase changes the first screen and chrome only; most per-page gain is in §6. Today's same-run mean is 3.47. |
| Variety ≥ 4 from 2 of 3 reviewers | Keep. Add a side-by-side test: beats today on the same businesses in ≥ 5 of 6 reviewer × order comparisons. | Absolute scores stayed at 2–3 for every set. |
| Look distance ≥ 0.70 | Keep, after fixing the metric. | Every composed hero is recorded as `composed/<width>`, so two different structures look equal. U5 adds the structure. |
| No structure on more than 25 % of pages | Keep, counted free from the specs. | |
| No two pages with identical chrome | Keep. Chrome = header family + header tone + phone action. | 3 headers × 3 phone actions is only 9 combinations for 10 pages, so header tones or today's 8 header families are needed. |
| No AI chips over photos | Only if D1 is B. | |
| Fewer than 5 defects per 10 pages | Keep: blockers named by 2 of 3 reviewers. | |
| 360 first screen: headline, one action and one fact, without the bar | Keep, as a browser check on 100 % of pages. | |
| (new) | 0 page-gate issues on every eval page and CI path. Every regeneration changes structure. No shared (structure, header, type voice) within a trade or a town. | |

## Architecture decisions

**1. Structures live as composition presets, and the structure is computed, not stored.**

Each structure gets 2–3 presets under `composition/hero/<structure>-<n>`.

Why presets:
- Composed sections already render through the one component library (preview = publish = export).
- They already have the guards (full-bleed photo with a scrim; text over a photo only from a higher layer; contrast), CI checks and contact sheets.
- The grid can express all eight structures: display headings across 8 or more columns, bleeding images, field bands, photo strips, a price "sheet", and a 2-column phone layout.
- New vocabulary after v20 needs no spec bump, and every designer can read presets.

The alternatives are worse:
- Section-hero variants would need a bump and one component each, and they would never reach the studio.
- A new hero type would duplicate the composition language.

`structureOf(spec)` (packages/spec, pure) classifies the first section:
- section heroes through a table: split → split, image → band, type:large → poster, with-facts → ledger, plus each signature variant;
- composed sections by their geometry.

A test asserts `structureOf(fillPreset(p)) === p.structure`, so the label and the layout cannot drift apart. The same function checks the hybrid designer's build and counts the 25 % share in the eval. Most of the 27 existing hero presets are probably splits in different styles; G0 counts them.

Spec v22 is the only bump, and it is additive:
- the `masthead` header family;
- an optional `assets.images[].grade`.

It comes with an identity migration and its test, and every stored site renders byte-identical.

**2. Chrome reuses the skeleton.**
- Hairline header: `bar` or `word`.
- Masthead: a new family whose facts row comes only from business facts.
- Tinted band: an existing family with `chrome.header.tone: "band"`.
- Phone actions (bar, float, header) already exist.

Found: all 20 studio specs (eval/runs/studio-poc-{mockup,direct}) have no `design.skeleton`. Every studio page therefore renders the default chrome and the Klic + Navodila bar, which is part of the "one chrome" finding. U6 fixes it.

**3. The registry is the production neighbour lookup, not `look_fingerprints`.**

Structure, header and type voice can all be worked out from the neighbours' specs, which production already loads (`repo.neighbourLooks` → variety.ts, skeleton.ts). There is no second store to drift or backfill, it covers every path that saves a spec, and a picture hash would need a render before the choice.

Changes:
- `neighbourLooks` matches the same trade OR the same town, and returns the first section in full.
- A new `recentLooks(10)` feeds the 25 % rule.
- On regeneration, the previous structure is excluded.
- The weighted sampling moves from deal.ts to a shared helper.
- Type voice comes from a table over FONT_PAIRS.

Eval consequence: today each fixture gets a fresh PGlite database, so the registry is empty and no rule fires. Set mode seeds the earlier fixtures as neighbours (`runner.ts` already supports `opts.neighbours`).

**4. One page gate, enforced by the type system.**

It lives in `engine/src/page-gate.ts`, because the sentence rule counts rendered text; the rules themselves stay in spec.

Rules:
- R1: one h1.
- R2: each image once.
- R3: each sentence once.
- R4: the contact and visit block once.
- R5: the hours note once.
- R6: no empty section.
- R7: an AI picture is never the hero's subject when a client photo graded window or better exists (owner D2: with none, an AI picture may lead).
- R8: a full-bleed or split photo needs grade "bleed".

Modes:
- Generate, regenerate, studio: repair, then the page must be clean.
- Critique and chat edits: repair, and new violations go back to the model as issues for a retry.
- Direct edits and revert: check only. New violations are reported, and the owner's text is never rewritten.

`Repo.saveSpec` accepts only `GatedSpec`, a branded type that only `gatePage` can produce, so a path that saves without the gate doesn't compile.

Call sites: pipeline generate, regenerate merge, critique and overflow repair, chat edit, direct edit, Druga podoba, photo swap, revert.

**5. Photo grade: local, free, deterministic.**

Inputs:
- pixel checks with sharp on a 512 px greyscale copy: sharpness, exposure and clipping, minimum side;
- the existing `heroSuitable` flag and focal point from the alt-text call;
- an optional `subject` (people / premises / work / product / tabletop) in the same alt-text answer, behind `promptFixes.photoGrade`; no new call.

Result: bleed / window / thumb, stored in the spec so the guards apply on every path. Generated pictures get window at most.

**6. Designers read one chooser.**

`chooseFirstScreen` (engine, code only) takes:
- the photo grades;
- the kind of offer: place, product, person or list (from the brief and the trade);
- the tone (from the direction);
- the logo shape;
- the registry.

It filters out what breaks a rule, then samples with a penalty for what neighbours already use. It fills the chosen preset from the hero copy the content model already wrote, so there is no model cost and the recordings still replay. It picks the chrome together with the structure.

- The studio's shortlist is the chooser's ranked list.
- The hybrid's brief must name an allowed structure, and `structureOf` checks the build.
- The critique keeps running; the composed hero is outside its catalogue.

## Units

Size: S under half a day, M about a day, L 2–3 days. Builds cost €0 (plan usage).

| Unit | Owns | Role · model · effort | Done = these failing tests pass | Size | € | Wave |
|---|---|---|---|---|---|---|
| U0 Map | read-only | scout · Haiku · medium | – | S | 0 | 0 |
| U1 Interfaces + spec v22 | spec site.ts, migrate.ts, skeleton.ts, composition/structure.ts, voices.ts, gated.ts; platform repo.ts `saveSpec`; config file + schema (every new key, off); engine stubs page-gate.ts, first-screen.ts, photo-grade.ts; altTexts moved to alt-text.ts; every `saveSpec` call site through the stub gate | builder · Opus · high; reviewer · Opus · high | v21→v22 migration, goldens byte-identical; `structureOf` table over all hero variants and 27 presets; typecheck rejects an ungated save | M | 0 | 1 |
| U2 Page gate | page-gate.ts, studio/page-rules.ts (folded in), stages.ts, editor.ts, spec once-rule files, ai-hero.ts | Opus writes tests · high; implementer Sonnet · medium; reviewer · Opus · high | rule × entry-point matrix; `as GatedSpec` appears only in page-gate.ts | L | 0 | 2 |
| U3a Renderer gaps | components groups/composed/*, styles/structures.css, styles.ts | builder · Opus · medium | at 360 and 1280: crop on thirds, overlap ≥ 48 px, 80/55 vh heights, phone ribbon scroller without page scroll, edge-to-edge mosaic | M | 0 | 2 |
| U8 Chrome | components chrome/*, chrome.css, skeleton.css, engine check/page-checks.ts | builder · Opus · medium | masthead facts only from business facts; band-tone contrast; single-page nav = section anchors or none (no lone "Domov"); 360 first-screen check | M | 0 | 2 |
| U3b Structure presets (~20) | inventory compositions/hero/* (new), compositions index | asset-maker · Opus · high | `structureOf(fill)` = tag; guards pass at both widths for a photo-rich, a one-photo and a no-photo business; owner approves in the gallery | L | 0 | 3 |
| U4 Photo grade | photo-grade.ts, alt-text.ts, prompt-fixes.ts, photos.ts | Opus writes tests; implementer Sonnet · medium | degraded copies of one photo get the expected grade; generated pictures window at most; switch off → byte-identical requests | M | 0.40 (alt-text re-record, at G1) | 3 |
| U10 Eval harness | tools/eval/src runner, studio-poc, studio-fixtures, cli, set-variety, look-distance, set-review, outside-review-cli | implementer · Sonnet · medium | `--set` with a shared registry, `--no-base`, `--concurrency 2`; variety report (structure share, chrome keys, trade/town clashes, regeneration change, gate issues); spec dump before the structure; side-by-side set round in both orders | M | 0 | 3 |
| U5 Chooser + registry | first-screen.ts, variety.ts, skeleton.ts, another-look.ts, studio/look.ts, weighted.ts (from deal.ts), repo.ts neighbour queries | builder · Opus · high; reviewer · Opus · high | no shared triple and no share over 25 % in any 10; regeneration changes structure; no graded photo → no band/split/mosaic; AI picture never the subject; chrome differs from neighbours; Druga podoba cycles structure; strict replay still passes | L | 0 | 4 |
| U9 AI label A/B + file mark | components primitives/index.tsx, imagery.css, label.css, composed.css, engine image-gen.ts | builder · Opus · medium | A: today's HTML byte-identical; B: caption with no overlay, alt keeps the label, round and arched crops at both widths; file carries XMP DigitalSourceType | S–M | 0 | 4 |
| U10c Fresh sets A/B | tools/eval/fresh-a/**, fresh-b/** | asset-maker · Opus · medium | 20 businesses each: 12 with photos (weak ones degraded in code), two clusters of 3 in one trade, one town with 4 trades | S | photos in G2/G3 | 4 |
| U6 Studio wiring | studio director.ts, art-director.ts, rebuild.ts, run.ts; inventory composer.ts, shortlist.ts | builder · Opus · medium | studio keeps `design.skeleton`; client photo before AI pictures in the hero; shortlist limited to allowed structures | M | re-record in G3 | 5, alongside G2 |
| U7 Hybrid designer | studio/brief.ts, compose-brief.ts, model config | builder · Opus · high; reviewer · Opus · high | brief schema; a build that doesn't match its structure falls back to the chooser; per-run € cap; replay | M–L | in G3 | 6, after D3 |
| Phase review | – | architect · Opus · xhigh | – | – | 0 | end |

At most 3 units run at once, and no two units in the same wave share a file.

## Eval plan

Budget mode is "ask". Per-unit costs come from the shoot-out; stand-in photos cost about €0.068 each.

| Gate | When | What | € |
|---|---|---|---|
| G0 | now | `structureOf` over the existing sets and the 27 presets (today's ten heroes: 5 split, 4 signature, 1 image) | 0 |
| G1 | after U1–U5, U8, U10 | Replay the 25 Review 50 businesses plus regenerations, and the fresh 10, in set mode: free metrics, contact sheets, `pnpm eval --offline --strict`. Must pass: share ≤ 25 %, no clashes, no identical chrome, distance ≥ 0.70, 0 gate issues, 360 check 100 %. | 0; ≤ €0.70 if design requests no longer replay; +€0.40 (U4) |
| G2 | October | Smoke test on 2 live businesses: €0.50. Set A: photos €3.26; generation 20 × €0.25 = €5.00; 6 regenerations €1.50; today's version of the same set replayed with structures off, €0; per-page review 40 × €0.17 = €6.80; set rounds €0.18, side by side €0.36. | 17.60 |
| G3 | November | Set B: photos €3.26; chooser €5.00; hybrid 20 × about €0.45 = €9.00; reviews €6.80; sets €0.54. Conditional: Fable-direct on 10 pages, €9.10. | 24.60 (+9.10) |

- **Test what ships.** The eval renders scope "home", like the free preview, and U8 fixes the lone "Domov" link in the product, not only in the eval.
- **Same code for the baselines.** They are re-rendered with the same chrome code.
- **New businesses every gate.** Every gate uses businesses never seen before.

Total: €43.40, of which €18.80 in October, plus €9.10 conditional.

## Risks and stop rules

- **G1 still shows splits over 25 % or clashes after one fix round.** The library is too thin. Add presets before spending.
- **G2 per page is more than 0.15 below today, or 2 of 3 reviewers agree on 5 or more blockers per 10 pages.** Keep `variety.structures` off, drop the worst structures by their own means, and re-run the free gate.
- **G2 look distance reaches 0.70 but variety stays at 3 or below.** The metric misses what reviewers see. The next lever is §6 (scale, type voice), not a designer, so skip the hybrid.
- **The G3 hybrid fails the D3 rule.** Ship the chooser. If Fable-direct still scores ≤ 3 on variety with the new library, no director gets built (the direction's own condition).
- **A photo-realistic mockup reaches imagery ≥ 3.5 for under €0.10 a page.** Revisit the picture studio.
- **Replay breaks** because design requests now depend on neighbours. Record only what's missing (≤ €0.70).
- **Stand-in photos are AI-made.** Grade thresholds are tuned on photos degraded in code, not on how the stand-ins look.
- **Page speed on 80 vh photos.** The Lighthouse check stays.
- **D1 is not decided.** A ships, and the chip target is dropped.
- **The owner's PC.** At most 3 units at once; eval concurrency 2.
