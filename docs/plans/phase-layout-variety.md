# Phase: layout variety (2026-10-15)

Architect: Opus xhigh. Inputs:
- docs/plans/design-direction-2026-10.md (Fable)
- .claude/plans/layout-map-2026-10-15.md
- eval/outside-review/shootout.md
- docs/plans/review50-systemic-fixes.md

## Goal

Ten homepages should read as ten designs, whichever path made them. Today they read as one split hero in ten outfits. Per-page quality must not drop. Every path that makes or edits a page obeys one set of page rules.

## Non-goals

- Below the fold (direction §6: the second moment, the scale system). It is measured here but built in the next phase.
- Copy prompts, the town in the hero, new trades.
- Retuning the studio prompts. The library has to express the structures first (direction §5, "Order").

## Found while planning (free, checked in the specs)

- **Studio pages have no skeleton.** All 20 studio homepages (eval/runs/studio-poc-{mockup,direct}) lack `design.skeleton`, so they render the default header and the call bar. That is the "one chrome" on the studio sets.
- **Today's 10:** 5 split, 4 signature (two of them the same etiketa label hero), 1 image. The chrome already varies.
- **Existing hero presets are mostly split.** They put the headline in columns 1–6 and the art in columns 7–12.
- **Fresh-10 has no client photos.** It is 10/10 photo-less, so "client photos lead" can't be measured on it.
- **The 25 % cap needs photo-less structures.** If photo-less pages get only poster, colour field and ledger, the cap allows at most 6 photo-less pages in ten.
- **The look distance can't see composed structures.** Its composition part treats every composed section as one token, `composed/<width>`. The 0.70 target can't be read until this is fixed.
- **Three headers × three phone actions = 9 chromes.** "No two of ten identical" therefore needs header tones or more header families. We already have 8 families, plus the new masthead.

## Owner decisions

- **D1 AI label** (legal/transparency; this is not legal advice):
  - (a) Keep the chip and fix it inside crops (status quo).
  - (b) One caption per picture in the eyebrow style, below the image or in the gutter; the alt text keeps the label.
  - (c) Option (b) plus machine-readable marking in the file (IPTC DigitalSourceType `trainedAlgorithmicMedia`).
  - Recommendation: (c), after the owner's own Art. 50 check.
  - (a) and (b) are both built behind one renderer switch (U9), so this decision blocks nothing.
- **D2 Imagery:**
  - Recommended policy: client photos lead; AI pictures appear only as textures, materials or landscape at window or ribbon size, never as the hero's subject.
  - Alternative: photo-less sites keep AI hero pictures.
  - If AI textures are rejected too, photo-less pages get only three structures, and the cap for photo-less pages becomes ≤ 34 %.
- **D3 Designer:**
  - Options:
    - (a) Code picks for everyone: today's pipeline plus the structures, €0 extra.
    - (b) Hybrid for paid tiers: Opus xhigh or Fable writes a brief, Opus builds it.
    - (c) The picker.
  - Recommendation: (a) once G2 passes; (b) only if G3 meets its bar.
  - **D3a, now:** take the picture studio out of the trial (`studio.mode` → `picker`), per the re-score below.
- **D4 Budget:** G1 ≤ €1 and G2 ≈ €17.60 in October; G3 ≈ €28 in November; 10 % contingency.

## Targets

| Metric | Direction | This plan | Why |
|---|---|---|---|
| Per-page mean, both widths | ≥ 3.8 | Ship gate: same-run baseline −0.05 at worst; 3.8 reported | This phase changes the first screen and chrome; most per-page lift is §6. Same-run today = 3.47 |
| Set variety | ≥ 4 from 2 of 3 | Keep | |
| Pairwise variety (new) | – | Wins ≥ 5 of 6 reviewer × order calls against the same businesses' baseline | Absolute set scores barely move (every set got 2–3) |
| Mean look distance | ≥ 0.70 | Keep once the composition token uses `structureOf`; picture-hash part reported separately | Today's metric can't see composed structures |
| Structure share | ≤ 25 % | Keep (photo-less pages ≤ 34 % if D2 drops AI textures) | Capacity arithmetic above |
| Identical chrome | none | Keep; chrome = header family + tone + phone action | 9 combinations < 10 pages |
| AI chips over photos | none | Per D1 | Legal decision |
| Build defects | < 5 per 10 | Keep, counted as blockers named by 2 of 3 reviewers | One reviewer alone over-reports |
| 360 first screen | headline + action + fact, no bar | A browser check, 100 % of pages | Deterministic, free |
| Page rules (new) | – | 0 violations on every path (CI) and on every eval page | Owner's item 2 |
| Regeneration (new) | – | 100 % change structure | Direction §3 |
| Trade/town (new) | – | 0 shared (structure, header, voice) combinations | Direction §3 |

## Architecture decisions

**A1. The structures are composition presets** in packages/inventory/src/compositions/hero/: not section-hero variants, not a new hero type.

- **One renderer, same guards.** Composed sections already render through @sb/components for preview, publish and export. They get the existing guards: contrast over photos, no text on text, one h1.
- **No spec bump.** Vocabulary growth after v20 needs none (migrate.ts, step 19→20). New variants or a new hero type would bump the spec and add a bespoke component per structure. They would also change the content catalogue, so every content recording would need re-recording, which is paid.
- **Lesson from the 16 section variants.** Geometry baked into components produced one template.
- **Applied in code after the content step.** `fillPreset` fills the slots from the written hero's copy. The content recordings replay unchanged, so G1 is free.
- **The structure is derived, never stored.** `structureOf(spec)` (pure, in @sb/spec) classifies the first section by its geometry, and section heroes are classified by a table. Nothing can drift, and old sites and free compositions are classified too.
- **Each preset carries a structure tag**, and a test holds `structureOf(filled) = tag`.
- **Cost:** today's path gets a composed hero, and the critique can't patch it. The critique still patches the rest of the page.

**A2. Chrome variants map onto the existing skeleton frames.**

- Hairline header: the existing `bar` and `word` families.
- Tinted band: the existing `chrome.header.tone` band, available on any family.
- New: a `masthead` family, tall with a facts row (town · hours · phone).
- Phone actions: today's bar, float and header are exactly the direction's three.
- The studio paths must keep the site's skeleton (U6).

**Spec v22**, one bump with an identity migration and its test:
- `masthead` added to the header families;
- an optional `assets.images[].grade`.

**A3. The registry is the production neighbour path, not `look_fingerprints`.**

- **What it reads.** `repo.neighbourLooks` already reads the neighbours' current specs. Structure, header plus tone, phone action and type voice (`voiceOf(fontPair)`, a table in the spec) are all derived from those specs.
- **Extensions:**
  - same town in any trade;
  - the whole first section;
  - `recentLooks(9)` site-wide, for the 25 % window.
- **Sampling** reuses deal.ts's weighted draw, now exported. Hard exclusions:
  - the same combination as a neighbour in the same trade or town;
  - a structure above 25 % in the window, unless nothing else is eligible;
  - the previous generation's structure.
- **Why not `look_fingerprints` and `uniqueEnough`:**
  - nothing in production writes to it;
  - it would be a second store that can drift from the specs;
  - its picture hash needs a render before the choice is made.
- **Metric:** `lookDistance` stays the eval metric.
- **Eval:** `--set` mode seeds the earlier pages of a run as neighbours. Without it the registry would be empty in every eval run.

**A4. One page-rules gate.**

**The rules**, in @sb/spec:
- R1: one h1.
- R2: each image once.
- R3: each sentence once.
- R4: contact and visit details once.
- R5: the hours note once.
- R6: no empty section.
- R7: an AI picture is never the hero's main subject.
- R8: a bleed or split photo needs a grade that allows bleed.

**The gate** is one function, `gatePage(before, after, origin)`, in engine/src/page-gate.ts. It lives in the engine because R3 counts the rendered text.

**What happens per path:**
- Generation, regeneration, studio and critique: repair, then refuse what is left as issues.
- Chat edit: new violations go back to the model for a retry.
- Direct edit: never rewrites the owner's text; new violations become publish-checklist warnings.
- Revert: check only.

**Enforcement:** `Repo.saveSpec` accepts only a branded `GatedSpec`, which only `gatePage` creates. The type check rejects any path that skips the gate.

**A5. Photo grade, local and free.**

- **Measured with sharp on the original:** sharpness (Laplacian variance), exposure (mean and clipped share), shortest side and aspect ratio.
- **Combined with the existing alt-text call:** its `heroSuitable` and focal point.
- **Subject tag:** behind `promptFixes.photoGrade`, that same call also returns a subject tag (people, premises, work, product, tabletop, other). No new call.
- **Stored in the spec:** the grade `{allow: bleed|window|thumb, score, subject?}`, so R8 also holds after edits.
- **Thresholds** live in config. A stored site without a grade is not checked against R8.

**A6. All designers use one vocabulary.**

- `eligibleStructures(ctx)` returns the structures ranked after the hard rules and the registry penalties.
- **Today's path:** code takes the first and fills a preset.
- **Picker:** its shortlist is limited to that structure.
- **Hybrid:** the director gets the top three plus the exclusions and returns a brief (structure, scales, crops, voice, second moment). Opus builds it, and `structureOf` checks that the build matches.
- Every path ends in `gatePage`.

## Units

Waves run in order, at most 3 units at once. Within a wave, units own disjoint files. pipeline.ts belongs to U1, then U5.

| # | Unit | Owns | Role · model · effort | Done = these tests (failing first) | Size | € | Wave |
|---|---|---|---|---|---|---|---|
| U0 | Scout map | read-only | scout · Haiku · medium | Map: slot sources for hero copy; renderer gaps per structure; every spec-saving path (look endpoint, revert, photos); how replay request hashes react to neighbours; the critique skip | S | 0 | 0 |
| U1 | Interfaces + spec v22 | spec: site.ts, migrate.ts, skeleton.ts, new structures.ts (`structureOf`, `voiceOf`), new page-rules.ts (`GatedSpec`); platform repo.ts `saveSpec`; gate stubs at every save (pipeline.ts, photos.ts, apps/web app.ts); stubs page-gate.ts, first-screen.ts, photo-grade.ts; altTexts moved to alt-text.ts | builder · Opus · high; reviewer · Opus · high | v21→v22 identity migration; `structureOf` golden table for the 16 hero variants and 30 hero presets; saving an ungated spec fails the type check | M | 0 | 1 |
| U2 | Page-rules gate | page-gate.ts, studio/page-rules.ts (folded in), stages.ts, editor.ts, spec once-rule files, new hero-image-rules.ts | Opus writes the tests · high; Sonnet implements · medium; reviewer · Opus · high | R1–R8 × 7 paths (generate, regenerate, studio, critique, chat edit, direct edit, Druga podoba/photo swap) are repaired, returned or warned; only page-gate.ts creates `GatedSpec` | L | 0 | 2 |
| U3a | Structure renderer | components groups/composed/*, new styles/structures.css, styles.ts, spec composition/guards*.ts | builder · Opus · medium | At 360 and 1280: focal point on a third line ±5 %; headline overlaps the image ≥ 48 px; 80/55 vh bands; photo strip scrolls inside itself, never the page; mosaic cells edge to edge | M–L | 0 | 2 |
| U8 | Chrome, single-page nav, 360 check | components chrome/*, chrome.css, skeleton.css, engine check/page-checks.ts | builder · Opus · medium | Masthead shows only business facts; band tone works on every family; a one-page site gets anchors or no nav, never a lone "Domov"; the 360 check fails on a fixture | M | 0 | 2 |
| U3b | Structure presets | inventory compositions/hero/* (new), compositions/index.ts, inventory tests | asset maker · Opus · high; mechanic · Haiku · medium (contact sheets); owner approves in the gallery | ≥ 2 presets per structure, 5 structures photo-optional; each fills for 6 sample businesses and passes the guards; `structureOf` = tag | L | 0 | 3 |
| U4 | Photo grade | photo-grade.ts, alt-text.ts, prompt-fixes.ts, photos.ts, config | Opus writes the tests; Sonnet · medium | Code-degraded copies (blur, dark, 480 px) drop from bleed to window or thumb; scores are deterministic; with the switch off, alt-text requests are byte-identical | M | 0 | 3 |
| U10a | Eval harness | tools/eval runner.ts, studio-poc.ts, studio-fixtures.ts, cli.ts, set-variety.ts, new fresh-set.ts | implementer · Sonnet · medium | `--set` seeds neighbours in a fixed order; `--no-base`; `--concurrency n`; variety reports structure share, chrome tuples, trade/town collisions, regeneration change; long `--only` lists don't overflow the file name | M | 0 | 3 |
| U5 | First-screen chooser + registry | first-screen.ts, variety.ts, engine skeleton.ts, another-look.ts, studio/look.ts, studio/deal.ts (export the sampler), platform repo.ts (`neighbourLooks`, `recentLooks`), pipeline.ts, config `variety.structures` | builder · Opus · high; reviewer · Opus · high | No graded photo → no photo-led structure; R7 holds; ten sites in one registry → ≤ 25 % share and no trade/town combination twice; regeneration changes the structure; same seed and neighbours → same pick; Druga podoba cycles structures | L | 0 | 4 |
| U9 | AI label, both styles | components primitives/index.tsx, i18n.ts, imagery.css, vocab/masks/label.css, composed.css (label lines), engine image-gen.ts | builder · Opus · medium | Both styles render; the caption never overlaps the image (360 and 1280); alt text keeps the label; generated files carry the XMP field | S–M | 0 | 4 |
| U10b | Pairwise set round | tools/eval set-review.ts, outside-review-cli.ts | implementer · Sonnet · medium | Each reviewer compares A and B in both orders; win counts and a position-bias report; the absolute round is kept; dry-run gives a cost estimate | S | 0 | 4 |
| U6 | Studio wiring | engine studio/{director, art-director, rebuild, run, mockup}.ts; inventory composer.ts, shortlist.ts | builder · Opus · high | Studio output keeps the site's skeleton; client photos come before AI pictures; the shortlist holds only the chosen structure; a free composition outside the allowed structures falls back | M–L | 0 | 5 |
| U11 | Fresh set A content | tools/eval/fresh-a/** | asset maker · Opus · medium | 20 briefs and photo prompts; the `brief.json` schema test passes | S | 0 | 5 |
| U7 | Hybrid designer (only if the re-score or D3 says so) | new studio/brief.ts, compose-from-brief.ts; run.ts mode `hybrid`; config models | builder · Opus · high | Brief schema (structure in the top three); the build matches by `structureOf`; per-run € cap holds | M–L | ≈ 1 | 6 |

Phase review: the architect (Opus xhigh) reviews the whole diff before merge.

## Eval plan

**G0, now, free.** Run `structureOf` and `pnpm variety` on the shoot-out specs, the Review 50 specs and the 30 presets. This gives the baseline structure share; the split class is expected at 50 % or more.

**G1, after wave 4, free.**
- Replay recordings-review50 (25 businesses, with photos) and recordings-fresh10 in `--set` mode with the structures on.
- Render at 360 and 1280. Run variety, the gate statistics, the 360 check and `pnpm eval --offline --strict`.
- Make contact sheets for the director, then for the owner.
- Exit when every free target is met.
- If neighbour-dependent design requests break strict replay, record that stage only (about €0.02 a site, at most €1, ask first).

**G2, after G1 and the owner's look: ask, about €17.60.**
- Set A: 20 new businesses. 8 have good photos, 4 weak ones (degraded in code), 8 none. Two trades appear three times each; one town has four trades.
- Costs:
  - stand-in photos 48 × €0.068 = €3.26
  - live smoke test on 2 sites: €0.50
  - generation 20 × €0.25 = €5.00
  - regenerate 6: €1.50
  - baseline arm (the same recordings replayed with the structures off): €0
  - per-page review 2 arms × 20 × €0.17 = €6.80
  - set rounds: absolute €0.18, pairwise €0.36

**G3, November: ask, about €28.**
- Set B: 20 new businesses (photos €3.26).
- Costs:
  - today plus structures: €5.00
  - hybrid: 20 × about €0.57 = €11.40
  - per-page reviews: €6.80
  - set rounds: €0.54
  - U7 recording: €1
- Adding the picker as a third arm costs +€9.20 for generation and +€3.40 for review.
- The hybrid's bar: it must win at least 5 of 6 pairwise variety calls and add at least 0.2 per page, at €0.60 a page or less. Otherwise code picks for everyone.

**Total ask: about €51** (G1 + G2 + G3 = €46.60, plus 10 %). October takes about €19, out of the €29 left this month.

**Re-score result (2026-10-15, filled in by the director).** Both studios' pages got the Review 50 checks (zero repeat, empty or image-twice defects left) and were re-scored by the same three reviewers. Per-page means:

| | Before fixes | After fixes | Blockers | Distinctiveness | Imagery |
|---|---|---|---|---|---|
| Today's pipeline | 3.47 | – | 9 | 3.45 | 3.50 |
| Picture studio | 2.86 | 3.09 | 65 → 37 | 3.37 | 2.40 |
| Fable direct | 2.98 | 3.22 | 57 → 25 | 3.52 | 2.91 |

Fable's own score for the Fable set covers 9 of 10 pages. Whole-set scores (overall / variety) did not improve:

| | Gemini | GPT | Fable |
|---|---|---|---|
| Picture studio | 3/2 | 3/3 | 3/2 |
| Fable direct | 2/1 | 3/3 | 3/2 |

**What this means for the plan:**
- **The picture studio is still more than 0.3 below today**, so D3a applies: take it out of the trial now. U6 stays in wave 5. G3 compares today plus structures against the hybrid.
- **Fable direct is 0.25 below today.** That is not within 0.15, so U7 stays in wave 6 and the hybrid is not a G2 arm.
- **Neither studio reaches variety ≥ 3.5**, which confirms the layout layer as the bottleneck.

The original branches:
- Studios still ≥ 0.3 below today per page: D3a takes the picture studio out of the trial now, U6 stays in wave 5, and G3 compares today plus structures against the hybrid.
- Fable direct within 0.15 of today: start U7 right after U5 and add the hybrid as a third G2 arm (+€11.40 generation, +€3.40 review).
- Any studio at variety ≥ 3.5 on today's library: the diagnosis is wrong for that path, so add it as a G2 arm before building U7.

## Risks and stop rules

- **G1 misses a free target after one round of fixes:** no paid run. Widen the library with more photo-optional presets instead of loosening the target.
- **G2 per-page mean is more than 0.10 below the baseline, or 2 of 3 reviewers agree on 5 or more blockers per ten pages:** stop the rollout. Compare per-structure means, drop or fix the worst structure, and go back to G1.
- **Pairwise win, but absolute variety stays below 4:** the next lever is §6 (scale, second moment), not a designer. G3 waits.
- **Look distance reaches 0.70 while reviewers' variety stays at 3 or below:** the metric misses what reviewers see. Weight the picture-hash part and recalibrate before using it as a gate.
- **Direction §5 triggers:**
  - Fable-direct scores variety ≤ 3 with the new library: drop the director.
  - A mockup studio reaches imagery ≥ 3.5 for under €0.10 a page: revisit it.
- **Product side effects:**
  - Full-bleed photos may slow the largest paint at 360 px, so Lighthouse runs in G1.
  - Composed heroes need Druga podoba to cycle structures (U5).
  - The critique can't patch a composed hero.
- **D1 unanswered:** ship the chip fixed inside crops. The "no chips over photos" target is reported, not gated.
- **Owner's PC lags:** at most 3 builders at once, and eval runs with `--concurrency 2`.
