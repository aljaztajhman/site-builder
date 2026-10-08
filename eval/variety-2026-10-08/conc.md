# Variety: how alike the generated homepages look

Mode **record-missing**, scope **home**, 2026-10-08T10:35:03.243Z, 3 sites, 3 pairs. Look distance 0 = the same site, 1 = nothing in common: the spec (direction, font pair, palette ΔE, hero, header, section sequence) and the first screens at 360 and 1280 px (layout gradients, colour histogram), weighted equally. Free, no model call (tools/eval/src/look-distance.ts).

Variety switches on: **concept** (run conc).

## Targets

| Target | Value | Needed | Met |
|---|---|---|---|
| Look distance within a trade ≥ across trades | 0.14 | ≥ 0.47 (today's lowest across-trade distance) | ✗ |
| No two sites of one trade share palette, font pair and hero | 1 (elektro-zupan / mizarstvo-lesnik) | 0 | ✗ |
| Judge distinctiveness ≥ 3 on every site (lower of phone and desktop) | min 3 | ≥ 3 | ✓ |
| Judge median (mean of phone and desktop) | 3.67 | ≥ 3.2 | ✓ |
| Judge median on the template trades | 3.67 | ≥ 3.7 | ✗ |

## Summary

- Across trades (pairs of different business types): **0.72**
- Within a trade (pairs of the same business type): **0.14**
- Pairs a visitor would take for one template (same palette family, font pair and hero): **1**: elektro-zupan / mizarstvo-lesnik
- Brand fit (a logo colour reaches primary, band or accent within ΔE 20): 0 of 0 sites with a coloured logo
- Motif fit: 3 fit, 0 misfit, 0 without a motif

## Within each trade

| Trade | Pairs | Mean | Closest pair |
|---|---|---|---|
| builder | 1 | 0.14 | 0.14 |

## Per site

| Site | Trade | Direction | Font pair | Hero | Brand fit | Motif |
|---|---|---|---|---|---|---|
| elektro-zupan | builder | cevi | space-grotesk-public-sans | hero-signature:drawing | no logo | wire ✓ |
| mizarstvo-lesnik | builder | cevi | space-grotesk-public-sans | hero-signature:drawing | no logo | joint ✓ |
| vulkanizer-zorman | car-repair | tablica | archivo-public-sans | hero-signature:photo | no logo | plate ✓ |

## Closest pairs

| Pair | Same trade | Spec | Screens | Look distance |
|---|---|---|---|---|
| elektro-zupan / mizarstvo-lesnik | yes | 0.08 | 0.20 | 0.14 |
| mizarstvo-lesnik / vulkanizer-zorman | no | 0.78 | 0.66 | 0.72 |
| elektro-zupan / vulkanizer-zorman | no | 0.78 | 0.66 | 0.72 |

## Copy: how alike the homepages read

Word overlap (Jaccard of word stems) of each homepage's hero headline, eyebrows and section titles, the business's own name and town left out: 0 = no word in common, 1 = the same words. Free, from the spec.

- Across trades: **0.22**
- Within a trade: **0.17**
- Headings used word for word on more than one homepage: „druzinska delavnica" ×2

| Pair | Same trade | Copy overlap |
|---|---|---|
| mizarstvo-lesnik / vulkanizer-zorman | no | 0.23 |
| elektro-zupan / vulkanizer-zorman | no | 0.20 |
| elektro-zupan / mizarstvo-lesnik | yes | 0.17 |
