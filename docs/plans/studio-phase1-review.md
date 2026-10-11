# Design studio Phase 1: review

Architect's review of Phase 1 (`docs/plans/studio-phase1-design.md`) as merged on `origin/main` a7db9db (spec v21), plus the two open PRs #196 (motion, 10 presets) and #197 (I3b batch 2, 30 presets), and the open branch `claude/studio-guard-gaps` (870cd9b). 2026-10-11. The Phase 2 design that builds on this is `docs/plans/studio-phase2-design.md`.

## 1. Verdict

The language and the guards hold, and the inventory exists in the shape Phase 2 needs. But **no studio site can be produced yet**: every one of the ≈ 600 new assets (counted from the source files, plus 80 stances and 50 cards) is a draft (`packages/inventory/src/decisions.json` is `{}`), so the runtime catalogue is the v19 starters, and the engine has no studio path at all (the pipeline never calls `repairComposition` or `composedFallback`). Four things block Phase 2: approvals, a CI crash, two budgets measured in the wrong unit, and guards that disagree with the browser. All four are small and free.

## 2. Built against the design

| Unit (design §) | Design target | Built | State |
|---|---|---|---|
| F1b language v2 (§1–3) | spec v20, 17 kinds, vocab, G1–G25, renderer regions | v20, 17 kinds, G1–G29, region sheets + per-family vocab sheets (§3.4.7–8) | merged |
| steps / qa | (new) | spec v21, 2 kinds, verbatim-text fact rule (#193) | merged; follow-ups open |
| I1 type | 60 families, 120 pairings | 41 + 100 drafts | merged |
| I2 colour | 200 palettes | 150 curated drafts | merged |
| I3 compositions | 120 presets, coverage table | 123 presets, coverage met; every preset fills from the 3 Phase 2 fixtures with 0 guard issues | #185, #194 merged; #197 open |
| I4 imagery | 30 masks, 16 treatments, 12 textures | 31 / 16 / 13 (incl. starters) | merged |
| I5 drawings | pilot → 150 motifs in 3 styles, 24 ornaments, 20 edges | pilot of 18 line drawings (owner: "very basic"); 3 hero styles for bakery only (#189); edges still 5 | pivoted (see §5) |
| I6 type and facts | 15 / 20 | 15 / 17 | merged |
| I7 motion | 20 | 10 (scope cut) | #196 open |
| I8 stances | 80 + 50 cards | 80 (32 Slovene-rooted) + 50 | merged |
| I9 wordmarks, icons | generator; 3 × 40 icons | 7 styles; 40 line icons (scope cut to 1 style) | merged |
| I10 references | 40 | 24 (scope cut), each with a gap note | merged |
| Renderer fixes | — | #188, #192, #195 | merged |
| Okus round 1 | ≈ 60 items | 32 rated + 30 pairs: refs 4.05, goldens 3.60, composed 3.67 | done |

## 3. What holds

- **Append-only vocabularies (D1).** Eight batches added names in parallel without a spec bump or a `SPEC_VERSION` collision; v21 shows a new kind still costs exactly one bump with an identity migration.
- **Guards in code.** G1–G29 with worst-case contrast over photos, verbatim rules for quotes, steps and FAQ, and the approved-names filter (`designerCatalogue({ approved })`, `approvedVocabs`). The designer catalogue offers only approved names (tested).
- **Designer off = byte-identical.** Core sheet frozen, v2 sheets and islands after the bundle hash, goldens unchanged across every batch.
- **The pilot gate worked.** The line-drawing pilot missed the owner's bar, the style brief was revised (§5.3 of the design), and the owner picked poster, linocut and AI painting (HQ `sb-hero-style`). That is the process doing its job.
- **Evidence for the approach.** Hand-made pages in the language already rate as well as the goldens (composed 3.67, `composed-s` a 5), and the two weakest goldens (`avtoservis-mrak` 2, `instalacije-rebernik` 2) are two of the three Phase 2 fixtures, so improvement will show.

## 4. Findings, ranked

**Blocker for Phase 2** (fix before the stage that relies on it):

| # | Finding | Evidence | Fix (Phase 2 unit) |
|---|---|---|---|
| B1 | 0 approved drafts: the runtime catalogue is the v19 starters (3 textures, 6 masks, 2 drawings …) | `decisions.json` = `{}`; `designer-catalogue.test.ts:128` | Approval round in context, ≈ 20 min of the owner's time (§6.5); dev evals may run on drafts behind an explicit flag (P4) |
| B2 | CI crashes with "Illegal instruction": a V8 fatal error in the threads pool, not a CPU problem | runs 38123245822 and 38121056258 attempt 1: `Check failed: jit_page_->allocations_.erase(addr) == 1` in `ThreadIsolation::UnregisterWasmAllocation`, then SIGILL, exit 132, Node 24.21.0, shard 1/3; `vitest.config.ts` `pool: "threads"` | `pool: "forks"` (§6.6) (P1) |
| B3 | The CSS budget measures a page nobody serves, in bytes nobody downloads | the 32 KiB check is core + every region, raw minified (`render/test/composed-v2.test.ts:136-147`, `inventory/test/assets.test.ts:97-104`); the decor height cap was dropped to fit | page budget in gzip bytes plus an LCP check (§6.1) (P2) |
| B4 | The catalogue budget (2,600 tokens at chars/4) blocks the style notes Haiku designers need, and chars/4 undercounts Haiku 5.5's tokenizer | `designer-catalogue.test.ts:147-151`: 2,598 of 2,600 | split static and per-call budgets (§6.3) (P2) |
| B5 | Guards pass contrast that axe fails; asset makers find it by eye | #197: muted price note on a light field in an inverse section; `phone: "band"` photo layer with light text | the fix on `claude/studio-guard-gaps` covers these two; a committed guards-vs-axe agreement test catches the next ones (§6.2) (P3a) |

**Fix during Phase 2:**

| # | Finding | Fix |
|---|---|---|
| D1 | The engine Brief produces no `steps`, `faq` or `amenities`, so designers can't use those kinds honestly | verbatim extraction in the studio's Brief, behind the switch (S2) |
| D2 | `composedFallback` doesn't cover steps/qa, and nothing wires repair → validate → fallback | S2 assembly |
| D3 | The editor has no copy form for composed sections (steps, qa, any composed slot) | S7 editor slots |
| D4 | Language gaps left: list `marker: "drawing"` renders as a small dash and vanishes on inverse; steps have no horizontal layout; price plates don't scale with `size`; `list.size` 2 barely differs from 1; `contact` spreads its items over all its rows unless `alignY: "start"`; tall single-column sections leave empty ground; `booking/band-split` showed only the phone for avtoservis-mrak (cause not confirmed) | P3b; steps `row` in spec v22 (SV) |
| D5 | Hero art (poster, linocut) exists only for bakery | P5: car repair and plumbing first, then the exit-run trades |
| D6 | Okus ratings are compressed: 22 of 32 items got a 4, no notes. A 1–5 judge can't be calibrated on that; the 30 pairs carry the signal. The 24 I10 references are unrated | Okus round 2 inside the approval round, pair-heavy (P4) |
| D7 | Cost per homepage in plan §6.3 (€0.5–0.8) is optimistic: the director's moodboards and the tournament's screenshots are mostly image tokens | Phase 2 design §8 budgets ≈ €0.9–1.2 per full run and caps it at €1.50; measured, not optimised (owner) |

**Later:**

| # | Finding | Where |
|---|---|---|
| L1 | A composed-only page still links the whole site sheet (15.3 KiB gzip), most of it hero/content/business rules it never uses; a slim sheet would save ≈ 10 KiB gzip per studio page | Phase 3 lever, once studio pages exist to measure |
| L2 | I10 gap notes: decor svg is capped at 400 × 400 and 24 paths (no heavy solid drawings outside hero art), field layers bind to rows not elements, phone adaptations are only "hide" or "off" | sketch lab, Phase 4 (§7.3 scoped CSS) |
| L3 | Config `modelTraits.claude-haiku-5-5.refusalRetryModel` is Opus 5.5; plan §6.4 and TASKS say Sonnet | doc fix; Opus is the better choice (server-side fallback) |
| L4 | TASKS.md still shows every Phase 0/1 box unticked | tidy at the next director session (HQ is the truth) |
| L5 | FAQ and steps appear only when the client wrote them (verbatim rule); most clients won't | an intake question ("Kaj vas stranke najpogosteje vprašajo?"), after Phase 3 |

## 5. Scope cut and the drawings pivot

The 2026-10-11 cut (deferred, not dropped, until after the 17 Oct usage reset) changes what Phase 2 can lean on:

- **Drawings.** Line drawings are out as hero material. The hero picture is one of: poster or linocut drawing per trade (inventory, drafted offline by the `hero-art` generators), an AI painting (generated per site through the existing image path), bold shapes (fallback), or the client's photo when the analyst grades it hero. The 20 line drawings stay as small decor and list markers. Phase 2 needs poster and linocut for the fixtures' trades only (P5); ≈ 12 per style is the post-reset target.
- **Icons** one style (line) is enough for practical facts. **References** 24 are enough for the director (it is shown 3 per run). **Motion** 10 covers every motion level.

## 6. The open problems, each with a decision

### 6.1 Composed CSS page budget (HQ `it-studio-css-budget`)

**Decision: raise it, measured in what a phone downloads, and keep the per-sheet caps.**

Measured on main (scratch script mirroring `minifyCss` and `compactValues`, Node zlib default gzip; Railway's edge serves CSS gzip-encoded, checked on the live `home.css`):

| Sheet | Raw minified | gzip |
|---|---:|---:|
| core | 12,653 | 3,417 |
| section / kinds / extensions | 8,064 / 5,729 / 6,311 | 2,000 / 1,935 / 1,932 |
| core + every region (today's 32 KiB check) | 32,757 | 9,284 (files gzipped separately) |
| all 7 vocab families with partials | 24,962 | 6,832 |
| **every composed sheet a page could link** | 57,719 | **16,116 (15.7 KiB)** |
| site sheet without motifs (every page links it) | 85,933 | 15,636 (15.3 KiB) |

The rule (P2):

1. **Per real page, gzip:** composed sheets ≤ **20 KiB**, all render-blocking CSS (site sheet + composed sheets + vocab families) ≤ **36 KiB**. Measured on the kitchen-sink pages, m/s/j, the 24 references and every page the Phase 2 runs produce (`tools/eval/test/composed-css-weight.test.ts` already walks pages; it switches from raw 40 KiB to these). Even the union of every sheet (31.0 KiB) passes.
2. **LCP:** the offline eval's Lighthouse run (mobile) adds the kitchen-sink home and the heaviest reference: LCP ≤ 2.5 s, as the mobile checklist.
3. **Per sheet, raw** (growth discipline, unchanged): core ≤ 16 KiB, each region ≤ 12 KiB, each vocab family ≤ 6 KiB. The "core + every region ≤ 32 KiB raw" assertions are removed from `composed-v2.test.ts` and `assets.test.ts`.
4. The decor height cap from #195 (40vh phones, 60vh desktop) goes back in.

On Lighthouse's mobile profile (≈ 1.6 Mbps) 4 KiB gzip is ≈ 20 ms, so the LCP check, not a byte count, is the real guard. Rejected: (a) **split kinds per kind** like the vocab families: the kinds region is 1.9 KiB gzip, so a page saves at most ≈ 1.5 KiB for more render-blocking requests; (b) **raise the raw cap to 40 KiB**: raw bytes over-penalise repetitive CSS and repeat today's squeeze at the next batch; (c) **trim more**: it already cost a renderer fix.

### 6.2 Guard gaps (HQ `it-studio-guard-gaps-i3b`)

- The two cases are fixed on `claude/studio-guard-gaps` (G9 checks a prices note against its field or fill; G3 checks photo-coloured text against the section ground when the photo is a phone band, repair `phone: "cover"`). Merge it after CI.
- **Root cause of the class:** the guards model one ink per element (`onRole(ground)` or `color`), while the sheets paint secondary inks (muted notes, labels, captions, answers) from the tone. Fix: one table of secondary inks per kind in `roles.ts`, read by the guards and asserted against the stylesheet, as `ON_ROLE` already is.
- **The net:** a committed test (P3a) fills every composition preset from the 3 fixtures, in tones default, alt, inverse and band, with 2 palettes (light and dark ground), renders at 360 and 1280 and runs axe's colour-contrast rule. Every fill the guards pass with 0 issues must be axe-clean; a mismatch fails the test with the element and both verdicts. #197 already ran this matrix by hand (67 fills × 2 tones × 2 widths); it becomes CI, sharded.
- Drawing list marker and steps layout are language gaps, in §6.4.

### 6.3 Steps and FAQ wiring (HQ `it-studio-steps-faq-followups`)

- **Brief:** with `designer.agent` on, the Brief extracts `steps[]` and `faq[]` as verbatim spans of the client's text (and `amenities` from the closed list), never writes them; the existing verbatim fact rule checks them. Off: requests unchanged. In S2.
- **Editor:** the composed-section slot editor (S7) includes step and question/answer forms; owner text counts as client input.
- **Fallback:** `composedFallback` learns steps (→ a list section) and qa (→ the existing FAQ section) in S2.
- **Catalogue budget** (decision): the 2,600-token cap is replaced by three budgets, estimated at **3 characters per token** (Haiku 5.5 counts ≈ 30 % more tokens than the old rule assumed), checked by tests, and calibrated once in S0 with the free token-counting endpoint:
  - static designer catalogue (types, props, one line per kind and per style): ≤ **4,500 tokens** (13,500 characters; today ≈ 10,400). It is a cached system block, so its price is negligible; the cap protects attention, not money.
  - per designer call, the moodboard (shortlisted ids with one line each): ≤ **3,000 tokens**; filled preset examples: ≤ **6,000 tokens** (at most 3 moments).
  - per designer request, all text without images: ≤ **16,000 tokens**.
  Notes about one asset travel with that asset in the shortlist, never in the static catalogue.

### 6.4 Language gaps (HQ `it-studio-lang-gaps-i3b`, I10c)

#192 and #195 closed the I10c renderer issues and five of the i3b gaps. Left, in P3b: list marker drawing (render at ≥ 1 em, ink from the ground's role, so it survives inverse); price plates scale with `size`; `list.size` steps that read as display type; `contact` aligns to the start by default; tall single-column sections shrink to their content; the band-split e-mail case (find the cause first). Steps `style: "row"` (horizontal from 64 rem, vertical on phones) is a schema value, so it goes into the one Phase 2 spec bump (v22, unit SV). The I10 gap notes (signatures drawn by hand, heavy solid drawings, field binding) are lab material (L2).

### 6.5 The approval gallery

**Decision: approve in context, not asset by asset.** The owner looks at pages and taps what he doesn't like; approvals propagate to the assets on them. Plain questions, shown on real pages (simple-decisions rule):

1. **Code gate (free):** only drafts that pass CI's per-asset checks are shown. The director pre-culls clear failures from the contact sheets with a reason (he never approves).
2. **Pages (≈ 12 min), Okus round 2:** the 24 I10 references plus 9 code-composed homepages (3 fixtures × 3 stances, built from drafts by the preset composer, no model call), each at 360 and 1280 side by side. One question per page, "Bi to stran pokazali stranki?" (Da / Ne), and an optional tap on any part: "Ta del mi ni všeč". Plus 15 pairs "Katera je boljša?" (calibration signal the 1–5 scale lacks).
3. **Grids (≈ 6 min):** for families the pages show too little of (palettes, pairings, icons, hero art, wordmarks): 12–24 per screen, "Tapnite tiste, ki jih ne bi nikoli uporabili. Ostale so v redu." with one button.
4. **Propagation, in code:** an asset is approved when it is on a "Da" page or in a submitted grid and was never tapped; rejected when tapped anywhere; otherwise it stays a draft. Fonts follow their approved pairings. Stances and cards need no approval (they never reach a page directly; their output does). The export goes through `pnpm inventory:decide`.

**Minimal approval set before Phase 2 can produce a real site** (≈ 350 assets, ≈ 20 minutes): the compositions of the homepage intents (≈ 110), palettes and pairings tagged for the 6 Phase 2 trades (≈ 40 + 30), the vocab families (≈ 85), hero art for the first 3 trades (≈ 9 incl. shapes), the 40 line icons, the 7 wordmark styles, and the references rated ≥ 4 with "pokazal bi" (they become the director's references). Engineering doesn't wait for it: dev evals may run with `--catalogue drafts` (reported in every run); the Phase 2 exit run and anything a customer sees use approved assets only.

### 6.6 CI "Illegal instruction" (HQ `it-ci-illegal-instruction`)

**Root cause:** V8 aborts on an internal check while freeing WebAssembly code (`ThreadIsolation::UnregisterWasmAllocation`, "Check failed: jit_page_->allocations_.erase(addr) == 1"); `V8_Fatal` ends in a trap instruction, hence SIGILL and exit 132. Both crashes are on Node 24.21.0, in shard 1/3, after the inventory tests, under vitest's `threads` pool. The JIT page registry is per process and shared by every worker thread's isolate, so concurrent wasm teardown in several isolates (Node's built-in fetch compiles llhttp to wasm, among others) is the likely race; which wasm module is unconfirmed.

**Fix (P1):** `pool: "forks"` in `vitest.config.ts` (one process per worker; no shared registry). Check: the next 10 CI runs without exit 132, and shard wall-clock before and after reported in the PR. If forks costs more than ≈ 20 % wall-clock, keep threads locally and set forks for CI only. Rejected: re-running red jobs (hides it, and breaks the "read, never re-run blindly" rule); pinning another Node patch (no known fixed version; unverified); retry-on-crash wrappers. Confidence: high on the mechanism, ≈ 70 % that forks removes it.

## 7. Deferred Phase 1 work, and where it goes

| Deferred | Where |
|---|---|
| Hero art poster + linocut, ≈ 12 per style | P5 in Phase 2 for the 6 Phase 2 trades; the rest before the Phase 3 40-fixture run, aimed at its trades (others fall back to painting or shapes, measured) |
| ≈ 170 line, solid and cut-paper motifs | not as hero material; revisit only if the tournament's losing reasons ask for spot drawings (Phase 4) |
| Ornaments 6 → 24, edges 5 → 20 | Phase 4 wave 2, earlier if tournament reasons point at section boundaries |
| Icons solid and cut (80) | Phase 4 or never |
| References 24 → 40 | Phase 3 prep, aimed at the stances and trades that lose in Phase 2 |
| Motion 10 → 20 | Phase 4 |
| Fact objects 17 → 20 | Phase 4 |

## 8. Recommended next step

P1 (forks pool) and P2 (budgets) today, P4 (preset composer and approval round) this week so the owner can approve before the 17 October reset; everything else waits for the reset. Details and the full unit list: `docs/plans/studio-phase2-design.md`.
