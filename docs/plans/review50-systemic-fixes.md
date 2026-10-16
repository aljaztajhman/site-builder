# Systemic fixes from the 50-page outside review (2026-10-14)

Source: `eval/outside-review/review50/` (report.md, reviews.json, summary.json). 50 fresh homepages from today's
generator (25 businesses: 10 fixtures, 12 twins, 3 photo-less hard ones; each generated, then "Ustvari znova"),
scored by Gemini 4 Argon and GPT-6.1 Sol with the judge's rubric plus the filter question (blockers). Claude Fable 5.1
was built as a third reviewer but not run (no budget approval). Spend: generation €6.51, scoring €2.53.

## What the reviewers said

- Scores (1–5, 3 = an ordinary small-business site): Gemini mean 3.81 (3.17–4.42), GPT 3.34 (2.75–3.92). Second
  generations slightly higher than first (Gemini 3.84 vs 3.79, GPT 3.42 vs 3.26).
- Reviewers against each other: 71 % pairwise, Spearman ρ 0.55 (1143 pairs).
- Filter: 8 of 50 pass, 42 held. Blockers by cause (blockers / pages): contact details repeated 53 / 31, sticky header
  over the hero 21 / 13 (a screenshot artefact, see 1), same photo twice 6 / 3, label or logo clipped 4 / 3, text
  overflow 4 / 2, diacritic collisions 4 / 4, a sentence printed twice 3 / 2, desktop hero cut at the fold 2 / 2,
  trade-foreign motif 1 / 1, off-trade picture 1 / 1, other 5.
- If the blockers of a cause went away and the reviewers found nothing new (an upper bound): fix 1 → 15 / 50 pass,
  + 2 → 34, + 3–5 → 40.
- Fixes asked for on many pages (not blockers): town missing from the hero 27 pages, desktop sections with an empty
  right half 18, oversized desktop headlines 18, oversized footer wordmark 11, tall opening-hours bar chart 10, a lone
  "Domov" link in the desktop header 9, the phone's main action a text link instead of a button 8.

Checked by eye (not only the reviewers' word): the header artefact (brivnica-kos, both widths), the repeated contact
block (pizzeria-oljka desktop), the phone overflow (elektro-zupan-regenerated: the full-page shot is 435 px wide at a
360 px viewport; the only one of the 50), the caron collision (vulkanizer-zorman "HITRO / POŠTENO"), the clipped logo
tagline (pekarna-kvas).

## With Claude Fable 5.1 as the third reviewer (2026-10-15)

`eval/outside-review/review50-three/` (Gemini and GPT replayed, Fable €4.34). Fable is the strictest (mean 3.10,
range 2.42–3.83; holds 42 of 50) and ranks pages most like GPT (77 % same order, ρ 0.70; Gemini–Fable 67 %, ρ 0.46).
Its blockers by cause (pages): contact details repeated 27, header capture artefact 16, overflow or clipping 7,
half-empty desktop bands and other layout gaps ≈ 8, a sentence twice 4, Slovene hyphenation breaking words (names
too: "Gre-gor Kovač", "Polnozr-nate", "la-stne", "zak-ljučene") 3. All three pass 5 pages today; with 1 → 9, + 2 → 18,
+ 3–7 → 23 (upper bounds). A two-of-three rule (a page is held when at least two reviewers name a blocker) passes 10
today. Added to the free fixes:

- **Hyphenation:** no automatic hyphenation in headings, names, prices or short lines; only long body text, with
  correct Slovene break points.
- **Content-aware sections:** a section with little content (one name, one link, one word) falls back to one narrow
  column instead of a full-width band with an empty half; cards don't stretch to a neighbour's height.

## Fixes, in order of leverage

Each is enforced in code where it can be (CLAUDE.md: banned patterns in code first) and has a test. 1–7 are render or
engine rules: free to build, and measurable for free by re-rendering the 100 saved specs (`spec-generated.json`,
`spec-regenerated.json` in eval/runs/<id>/) and re-scoring them (≈ €2.50 with two reviewers).

1. **Full-page screenshots draw the sticky header mid-hero.** `hideFixedForFullPage`
   (`packages/engine/src/check/page-checks.ts:302`) hides `position: fixed` only; the sticky header stays and lands
   in the hero after `loadLazyImages` scrolls. Neutralise sticky elements (static, in flow) for full-page captures.
   Matters beyond the eval: the product's critique pass reads the same full-page screenshots, so it can be "fixing"
   overlaps that visitors never see. Test: a page with a sticky header → the full-page shot has it at the top only.
2. **Contact details shown once per page.** The skeleton's `visit` footer (`packages/components/src/chrome/Footer.tsx:59`)
   always renders "Obiščite nas" + "Delovni čas", and a contact or info section above already shows them; some
   pages add a third copy under the hero. Rule: the footer drops its visit block when a section on the page renders
   the address or hours; the legal row (ZEPT provider address, registration) stays. The assembler places at most one
   full address-and-hours block per page. Check: a banned pattern "address or opening hours rendered in full more
   than once on a page" (visible text), so the critique pass and the eval both catch any path that slips through.
3. **The same photo twice on one page** (hero and a later section). Image assignment and repair: an image id appears
   at most once per page (the logo aside). Validation + safe repair, test with a spec that reuses the hero image.
4. **Uppercase display headings with Č Š Ž collide with the line above**, and a big year numeral swallows its eyebrow
   ("Kuhamo od leta / 1968"). Token range: display line-height floor for uppercase faces (≥ 1.05), and the
   year/stat component spaces its label from the numeral by the numeral's ascent. Test: render "HITRO / POŠTENO"
   and "Delavnica od leta / 1979" and assert the glyph boxes don't overlap.
5. **A long word overflows the phone** ("ELEKTROINŠTALACIJE" at the hero size): display size clamped by the longest
   word's measured width at 360 px, `overflow-wrap` for display text. The 360 px horizontal-scroll check exists
   (`page-checks.ts:196`) but the regenerated site shipped with it: make that failure a repair trigger, not a note.
   Unconfirmed whether the check fired on that site (the eval run's result file was lost, see Found).
6. **A sentence printed twice** (an hours note shown in the hours list and again in the section text). Assembly
   drops a note identical to text already in the section; the duplicate-text banned pattern from 2 covers sentences.
7. **Clipped logo tagline and AI-picture labels in small round crops.** Logo: fit the SVG's viewBox to its contents
   when the logo is placed. Labels: inside the crop's safe area (or outside the shape) for circular and arched crops.
8. **Trade-foreign motifs**: the licence-plate motif on a locksmith. Motifs carry the trades they fit (`trade` is in
   every brief); the plate goes to car repair only. Test from the motif registry.

Taste fixes both reviewers asked for (components and token ranges, free; scored the same way):

9. Opening hours: a compact rows variant that groups equal days (Mon–Fri on one row) instead of five identical bars.
10. Desktop sections with an empty right half (menus, hours, process steps): two-column variants for short content.
11. Caps on the desktop hero headline lines and the footer wordmark size.
12. A single-page site gets no lone "Domov" nav link: section anchors or nothing.
13. The phone hero's main action is a button, not an underlined link.

Need model calls or a decision (paid; owner's approval):

14. **Pictures for businesses without photos** show the town (Ptuj's castle and vineyards for a tyre shop, a
    Maribor street for a barber, a landscape for a carpenter). The `promptFixes.pictures` switch is off; turn it on
    and measure on the photo-less businesses. ≈ €3 generation + €1 scoring.
15. **Town in the hero** (27 of 50 pages): the skeleton rule forbids the street address as the hero's eyebrow; the
    reviewers ask for the town near the headline. Proposal: the town in the lead sentence, never the street. Needs
    the owner's call, then a content-prompt change (≈ €6.50 to regenerate 50, €2.50 to score).

## How to measure

After 1–8: re-render the 100 saved specs (a small tool: spec → check → the four screenshots, no model call), re-score
with `pnpm outside-review --run-dir … --record-missing eval/outside-review/recordings-review50` (only changed pages are
paid), compare the pass rate (8 / 50 today) and the blockers by cause. Report the real number, whatever it is.

## Decisions for the owner

- Fable as a third reviewer: built (Message Batches, waves within --max-eur); ≈ €5.80 for these 50 pages, Gemini and
  GPT replay from recordings for €0.
- The filter in the product: Gemini + GPT cost ≈ €0.05 a page. Running them on every studio candidate before the
  owner or the consultants see it is cheap but changes the outside-review decision (eval only today).
- 15 above (town in the hero vs the skeleton rule).

## After the free fixes (2026-10-15, PR #216)

Fixes 1–5, 7 and 8 built (6, a sentence twice, not yet), plus no automatic hyphenation and content-aware sections. The
100 saved specs re-rendered for free (`pnpm review50:render`) and re-scored by all three reviewers (€6.21):

- Means: Gemini 3.81 → 3.95, GPT 3.34 → 3.45, Fable 3.10 → 3.32.
- All three pass 5 → **28** pages (the simulated upper bound was 23); the two-of-three filter passes 10 → **37**; held by
  any reviewer 45 → 22.
- Gone: the header capture artefact, address or hours repeated, the trade-foreign motif. Left: the footer's phone and
  e-mail row after a contact section (8 pages), a sentence twice (5), layout-specific clipping (7) and empty bands (6),
  the same photo twice (3, because the re-render skips the generation repair).
- Before shots came from the cloud generation, after shots from a local re-render: part of the change may be the
  environment. Details: `eval/outside-review/review50-after/before-after.md`.
