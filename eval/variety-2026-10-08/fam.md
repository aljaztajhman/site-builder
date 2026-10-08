# Variety: how alike the generated homepages look

Mode **record-missing**, scope **home**, 2026-10-08T09:44:24.761Z, 3 sites, 3 pairs. Look distance 0 = the same site, 1 = nothing in common: the spec (direction, font pair, palette ΔE, hero, header, section sequence) and the first screens at 360 and 1280 px (layout gradients, colour histogram), weighted equally. Free, no model call (tools/eval/src/look-distance.ts).

Variety switches on: **families** (run fam).

## Targets

| Target | Value | Needed | Met |
|---|---|---|---|
| Look distance within a trade ≥ across trades | 0.57 | ≥ 0.47 (today's lowest across-trade distance) | ✓ |
| No two sites of one trade share palette, font pair and hero | 0 | 0 | ✓ |
| Judge distinctiveness ≥ 3 on every site (lower of phone and desktop) | min 2; below 3: mizarstvo-lesnik | ≥ 3 | ✗ |
| Judge median (mean of phone and desktop) | 3.08 | ≥ 3.2 | ✗ |
| Judge median on the template trades | 3.08 | ≥ 3.7 | ✗ |

## Summary

- Across trades (pairs of different business types): **0.53**
- Within a trade (pairs of the same business type): **0.57**
- Pairs a visitor would take for one template (same palette family, font pair and hero): **0**
- Brand fit (a logo colour reaches primary, band or accent within ΔE 20): 0 of 0 sites with a coloured logo
- Motif fit: 1 fit, 1 misfit, 1 without a motif

## Within each trade

| Trade | Pairs | Mean | Closest pair |
|---|---|---|---|
| builder | 1 | 0.57 | 0.57 |

## Per site

| Site | Trade | Direction | Font pair | Hero | Brand fit | Motif |
|---|---|---|---|---|---|---|
| elektro-zupan | builder | cevi | space-grotesk-public-sans | hero-type:large | no logo | pipes ✗ |
| mizarstvo-lesnik | builder | warm-craft | fraunces-source-sans | hero-split:image-left | no logo | —  |
| vulkanizer-zorman | car-repair | tablica | archivo-archivo | hero-type:large | no logo | plate ✓ |

## Druga podoba and Ustvari znova

- Druga podoba (no model call): 2 of 3 sites got another look, mean distance from the generated look **0.23** (closest 0.17); with check failures or invalid: none; none offered: mizarstvo-lesnik (no_family)

## Closest pairs

| Pair | Same trade | Spec | Screens | Look distance |
|---|---|---|---|---|
| elektro-zupan / vulkanizer-zorman | no | 0.62 | 0.24 | 0.43 |
| elektro-zupan / mizarstvo-lesnik | yes | 0.83 | 0.32 | 0.57 |
| mizarstvo-lesnik / vulkanizer-zorman | no | 0.92 | 0.35 | 0.64 |

## Copy: how alike the homepages read

Word overlap (Jaccard of word stems) of each homepage's hero headline, eyebrows and section titles, the business's own name and town left out: 0 = no word in common, 1 = the same words. Free, from the spec.

- Across trades: **0.10**
- Within a trade: **0.08**
- Headings used word for word on more than one homepage: none

| Pair | Same trade | Copy overlap |
|---|---|---|
| elektro-zupan / vulkanizer-zorman | no | 0.14 |
| elektro-zupan / mizarstvo-lesnik | yes | 0.08 |
| mizarstvo-lesnik / vulkanizer-zorman | no | 0.07 |
