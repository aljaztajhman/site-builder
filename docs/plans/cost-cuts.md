# Cost cuts: engine and evals

Status 2026-10-07 (branch claude/cheaper-generation): items 1 and 7 built behind config `costCuts.secondCritiqueOnlyOnFailures` and `costCuts.contentRetryAsPatch`, both off; no model call made. Item 7, measured on the recorded instalacije-rebernik answers (≈ 2.17 characters per token from their recorded usage): a whole-JSON retry sends ≈ 13.3k characters of messages (≈ 6.2k uncached tokens, recorded) and gets ≈ 3.3k output tokens back, ≈ €0.042 with the catalogue read; a patch retry sends about the same input (the first message and the answer once) and should get ≈ 100–300 output tokens, ≈ €0.016, so ≈ −€0.026 per retry. A second retry no longer resends every earlier answer: ≈ 6.2k instead of 9.6k input tokens (−€0.006). Still to run: the 3-fixture critique eval for item 1 and a full-scope eval on gostilna, kmetija and instalacije for item 7 before switching either on.

Status 2026-10-07 (branch claude/eval-tooling): steps 4, 5, 9 and 10 built, step 11 for the judge (the whole run through batches stays open); free, no model call made, so nothing below is measured on a real run yet. From the 2026-10-01 recordings, with pictures cached and the judge batched: a full `--record` ≈ €2.28 (was €2.96), `--record-missing` after an edit-prompt change ≈ €0.96, a critique change ≈ €1.31, a content change ≈ €1.89. Step 4 saves ≈ €0.0025 per job (58k cache-write tokens over the 10 recorded jobs), step 5 ≈ 4.1k characters (~1.5k tokens, ≈ €0.002–0.003) per critique round on the goldens, below the 2.4k-token estimate.

Status: plan, 2026-10-04. Analysis only; nothing here is built. Numbers come from the recorded calls of the 2026-10-01 full-scope record run (`eval/report.md`), the 2026-09-30 home run (`eval/report-home.md`) and the config prices (Sonnet 5.5 $2 in / $10 out / $2.5 cache write / $0.2 cache read, €/$ 0.86). Nothing below has been measured after a change; every item that changes model output ends with the eval that confirms it. HQ items are named per step; the development budget (`meta/budget`) decides when the paid checks run.

Earlier cost review with the same source data: docs/plans/audit-2026-10-01.md ("Cost levers, best first"). This plan supersedes its list: it adds the catalogue, the eval record-missing mode and the batch tier, and puts a number on the whole bundle.

## Where the money goes

The engine makes six Sonnet 5.5 calls per site (classify on Haiku, then brief, design, alt text, content, critique × 1–2), up to three gpt-image pictures from fal, and one Sonnet call per chat edit. Eval medians (€0.09 homepage, €0.15 full site) are warm-cache numbers because the fixtures run back to back and share the cached section catalogue. A production job that arrives alone is cold.

One cold homepage with the owner's own photos, Claude only:

| Part | € | Share |
|---|---|---|
| Section catalogue written to cache (16.6k tokens, first system block of content, critique and edit) | 0.036 | 25 % |
| Content call (≈3.6k output tokens, 2.5k uncached input) | 0.035 | 25 % |
| Critique, 1.5 rounds on average (8 screenshot slices ≈ 6–8k tokens + the spec ≈ 3k per round) | 0.035 | 25 % |
| Brief | 0.019 | 13 % |
| Design (4.2k-token directions catalogue written to cache), alt text, classify | 0.018 | 12 % |
| **Claude total** | **0.14** | |
| Each generated picture (sites with too few photos) | 0.068 | |

So a paid photo-less homepage is about €0.28 and pictures are half of it. A chat edit is €0.016 warm and €0.053 cold, because a cold edit writes the same catalogue again. Thinking tokens were measured in the October audit and are negligible on every stage, so effort levels and model swaps are not where the money is.

## Engine: do now

Config or small code, low risk, each checked by a 3-fixture home eval or by unit tests on recordings.

1. **One critique round, or a second only when the re-check still reports failures.** 3 of 4 second rounds returned no patches; each costs ≈ €0.023 and a full check with Lighthouse (40–60 s). Saves ≈ €0.012 per job on average and ≈ 50 s. The blunt version is config `limits.critiqueIterations` 2 → 1. Risk: on gostilna, round 2 caught a round-1 fix that didn't take, so prefer gating on the re-check. HQ `it-second-critique`. Check: `pnpm eval --scope home --only frizerstvo-lana,gostilna-zlata-zlica,zobozdravstvo-lebar --judge` (~€0.5).
2. **Pictures at medium quality** (`imageGen.models.gpt-image-2.5.params.quality` + its price). ≈ −€0.027 per picture: −€0.027 per free preview, −€0.054 per paid homepage, −€0.08 per full site. Risk: high quality was chosen because it looked like an owner's phone photo. HQ `it-medium-quality-pics`. Check: `pnpm fixtures:ai-photos compare` with a medium variant (~€0.09), look at the sheet, then one photo-less fixture with judge.
3. **Reuse brief, design, alt text and pictures on "Ustvari znova", retry and homepage → full site.** Each rebuild today redoes them (€0.07–0.18) and a failed job's pictures are paid again. Offer "new pictures" as an explicit choice. HQ `it-reuse-on-regenerate`, `it-reuse-pictures-regenerate`. Check: pipeline test that a second `generateSite` only fills missing picture slots and skips the reused stages; no eval needed.
4. **Drop the cache breakpoints nobody reads** (brief, design, alt). A breakpoint costs 1.25× on the write and these blocks are read only if the same stage runs again within 5 minutes, which a lone job never does. ≈ €0.003 per job, free, no risk. Part of HQ `it-cache-ttl`. Check: `client.test.ts` on the request shape.
5. **Critique gets only the homepage's spec, chrome and business.** It only sees homepage screenshots. ≈ −2.4k uncached tokens, −€0.004 per round. Patch paths must still address the full spec (page index 0 stays 0). HQ `it-eval-cost-cuts` / `it-critique-prompt`. Check: recorded critique patches still apply; one 3-fixture home run.

## Engine: after an eval

6. **Shrink the section catalogue.** `sectionCatalogue()` prints a JSON Schema per section (type/properties/required/maxLength keys), ≈ 16.6k tokens. A compact notation (TypeScript-like props with limits inline, shorter descriptions) should halve it; the directions catalogue (4.2k) the same way. Saves ≈ €0.024 per cold job (15 %), ≈ €0.018 per cold edit, and ≈ €0.0015 per warm call. Structured output is already off for content (`structuredOutputForContent: false`), so nothing depends on the JSON Schema form; validation stays in zod. Risk: content quality depends on how well the model follows the props, so this is the one item that can lose quality. HQ `it-compact-catalogue`. Check: `pnpm eval --scope home --judge` on all 10 fixtures (~€1.5), compare checkpoint passes, retries and judge medians against `eval/report-home.md`.
7. **Content retries as RFC 6902 patches instead of the whole JSON again.** Only matters when validation fails (2–3 content calls on some full sites, €0.03–0.05 each): ≈ 300 output tokens instead of 3–5k and no resend of the previous answer as uncached input. Mechanical repairs in code come first (done for several cases). HQ `it-retry-patches`. Check: full-scope eval on the fixtures that retried (gostilna, kmetija).
8. **1-hour cache TTL on the catalogue block.** Write €0.057 instead of €0.036, read €0.003 either way. A read refreshes the timer, so requests under 5 minutes apart never need it; it pays when gaps of 5–60 minutes are common (an owner editing with pauses: €0.016 instead of €0.053 per cold edit). The 1-hour block must come before the 5-minute blocks, which the current order (catalogue first) satisfies. Decide from data: `model_calls` has the cache columns; a query of the gap distribution between an account's calls is free. HQ `it-cache-ttl`, `it-edit-cache-rate`.

Not worth doing: Haiku for alt text (−€0.003 per site, Slovene quality risk), lowering effort (thinking is negligible), Railway (≈ $15/month, memory-bound, PR environments already off).

## What it adds up to

Per unit, cold cache, all of 1–7 done (8 is traffic-dependent and on top):

| What | Today | After | Saving |
|---|---|---|---|
| Homepage, owner's photos | €0.14 | €0.10 | −30 % |
| Free preview, no photos (1 picture) | €0.21 | €0.14 | −33 % |
| Paid homepage, no photos (2 pictures) | €0.28 | €0.18 | −35 % |
| Full site, 3 pictures | €0.38 | €0.25 | −35 % |
| Chat edit, cold | €0.053 | €0.035 | −34 % |
| Chat edit, warm | €0.016 | €0.015 | −9 % |
| "Ustvari znova" rebuild | +€0.07–0.18 redone | ≈ €0 redone | reuse |

Claude saving per job: catalogue −€0.024, one critique round −€0.012, homepage-only critique spec −€0.004, unread breakpoints −€0.003, retry patches −€0.01 on full sites only. Pictures −€0.027 each.

At launch volumes the bill barely moves (100 free previews a month save ≈ €7, 20 paid full sites ≈ €2.50). The point is the ratios fixed in config: the €0.60 free lifetime cap fits 4 previews instead of 3, a €1.50 Osnovni allowance buys 6 regenerations instead of 4, and 1,000 free previews a month would save ≈ €70. Every paid plan already makes money at today's costs (`plans.costs` margin check), so this is about the free tier's cost and the owner's allowance, not about margin.

Confidence: high on 1–5 and the eval items (arithmetic on logged costs). Medium on 6, the single largest item, because halving the catalogue is a guess until the eval runs.

## Development and evals

Spent so far on measurement: full eval runs ≈ €3 (home scope €1.4), of which fal pictures €0.54 and the vision judge €0.29; fixture photos €2.44; image model comparison €1.77; template evals €1.29 (2026-10-02, Anthropic credits ran out mid-run). CI never calls a model (`eval.yml` is manual only; unit tests use recordings).

Habits, free:

- Iterate with `pnpm eval --scope home --only <2–3 fixtures> --no-judge` (≈ €0.30 instead of €3); judge only the final run of a change.
- `--replay` for everything that doesn't touch a prompt. Caveat: replay is not strict by default, so a changed prompt silently replays stale answers (`hashMismatches` is recorded, not raised). Fine for tests, misleading if read as "did my prompt change help".
- Fix the budget and the fixture subset per experiment before running; the variety plan (docs/plans/variety-engine.md) already does this per step.

To build, free:

9. **Record only what changed.** `--record` wipes a fixture's recordings and pays every call again. Requests are already hashed (`requestHash`: model, stage, system, messages, schema). A record-missing mode replays calls whose hash still matches and calls the API only for the rest, recording them. Stages downstream of a changed one get different inputs, so they miss and re-record too; that is the correct behaviour. An edit-prompt change then costs ≈ €0.80 (the edits), a critique change ≈ €1.1, a content change ≈ €2; brief, design and alt text (≈ €0.40) are almost never re-paid. HQ `it-eval-record-missing`. Check: unit test on the transport (a matching hash replays, a changed one records; the fixture's recording files are rewritten in place, no wipe).
10. **Cache fal pictures by prompt hash** in live and record runs: −€0.54 per full run. HQ `it-eval-cost-cuts`.
11. **Batch API for evals.** 50 % off every token, cache reads and writes included, and nobody waits on an eval. Judge first (single-shot calls, simple): −€0.15 per run. The whole run later: one batch per stage wave across the fixtures, hours of wall time, halves every eval for good. HQ `it-eval-cost-cuts`.

With 9–11 a full run goes from ≈ €3 to ≈ €1.3, and a typical prompt iteration from €3 to under €1. A €5–10 variety-engine step becomes €2–4.

## Order

Free work first (3, 4, 9, 10; then 5 and 7 with their tests), because the budget is "spend nothing". Then one verification bundle of ≈ €2.5 for 1, 2 and 6 once the budget allows: the compare sheet (€0.09), the 3-fixture critique run (€0.5), the 10-fixture home run with judge for the catalogue (€1.5). 8 waits for the gap data from production; 11 after 9.
