# Review 50: before and after the free fixes (2026-10-15)

Same 50 homepages (25 businesses, generated and regenerated), same specs, same three reviewers and rubric. Before:
`../review50-three/` (shots from the 14 Oct cloud generation). After: the saved specs re-rendered with PR #216's code by
`pnpm review50:render` (no model call) and scored by `pnpm outside-review` (€6.21, all 150 answers).

| | Before | After |
|---|---|---|
| Mean, Gemini 4 Argon | 3.81 | 3.95 |
| Mean, GPT-6.1 Sol | 3.34 | 3.45 |
| Mean, Claude Fable 5.1 | 3.10 | 3.32 |
| Pages passing all three (no reviewer names a blocker) | 5 | **28** |
| Pages passing the filter (held only when ≥ 2 of 3 name a blocker) | 10 | **37** |
| Pages held by any reviewer | 45 | 22 |

The simulated upper bound before the work was 23 pages passing all three; the real result is 28. 37 pages scored higher on
the three reviewers' average, 12 lower (the largest drop is −0.22: instrukcije-pia-regenerated, zobozdravstvo-lebar). One
page that passed before is held now (fizioterapija-pregib-regenerated: Fable names ~150 px of empty space at the top of
the desktop call-to-action band).

## Blockers by cause

Counts are blockers per reviewer (Gemini / GPT / Fable) and, in brackets, pages. Sorted by keyword from the reviewers'
sentences with one rule for both runs, so the split is approximate; the totals above are exact. ¹ After: four repeated
sentences the keywords missed were moved from "other" by hand (read all 55 after-blockers).

| Cause | Before | After |
|---|---|---|
| Header drawn over the hero (screenshot capture) | 0 / 20 / 18 (20) | 0 / 0 / 0 (0) |
| Address or opening hours repeated | 9 / 6 / 2 (14) | 0 / 0 / 0 (0) |
| Footer repeats phone and e-mail (or the name) after a contact section | 6 / 16 / 13 (25) | 1 / 6 / 4 (8) |
| A sentence or note printed twice | 6 / 9 / 8 (17) | 3 / 3 / 4 (5)¹ |
| "Navodila za pot" link repeated | 3 / 0 / 15 (16) | 0 / 0 / 4 (4) |
| Text overflow or clipping | 9 / 4 / 12 (15) | 0 / 0 / 7 (7) |
| Half-empty layout, orphan word | 2 / 0 / 12 (12) | 0 / 0 / 6 (6) |
| Same photo twice | 3 / 3 / 1 (3) | 3 / 3 / 3 (3) |
| Hyphenation or a word broken mid-word | 0 / 0 / 3 (3) | 1 / 1 / 1 (1) |
| Trade-foreign motif | 1 / 0 / 0 (1) | 0 (0) |
| Other | 5 / 2 / 5 (10) | 0 / 0 / 0 (0)¹ |

## Read with care

- **Different capture machine.** The before shots come from the cloud session; the after shots from a local re-render. Our
  own re-render of the unfixed code did not match the recorded requests byte for byte, so part of the change may be the
  environment, not the fixes. A re-score of the unfixed re-render would isolate that (≈ €7, not run).
- **Same photo twice is unchanged** because the image repair runs during generation, and the re-render renders the saved
  specs as they were. The three pages (cvetlicarna-marjetica, salon-tina, trgovina-oljka-in-sol-regenerated) were the
  test cases: the repair drops the repeat on two of them and leaves cvetlicarna (its section needs an image and none is
  free). New sites get the repair; the check reports what is left.
- **"Polnozrnate" broke mid-word** at 360 px (pekarna-kvas, all three reviewers): without automatic hyphens, a price
  name beside a wide placeholder price split the word. Fixed after scoring (price wraps under the name; test in
  `review50-type.test.ts`); not in these numbers.

## What is left (after)

- Footer contact row (phone, e-mail, name) right after a contact section: 8 pages. The fix covered the address and
  hours; the legal row keeps phone and e-mail by design (ZEPT). Decide: a shorter legal row when a contact section shows
  them.
- A sentence printed twice (an hours note shown in the list and in the text): 5 pages. Plan item 6, not in this round.
- Clipping and empty bands that are layout-specific: arched photos cut at the phone's edge (frizerstvo-lana,
  zobozdravstvo-lebar), the footer wordmark (instrukcije-pia), "Kje delamo" labels (instalacije-rebernik).
- The repeated "Navodila za pot" link (header, hero, info band): 4 pages, Fable only.
