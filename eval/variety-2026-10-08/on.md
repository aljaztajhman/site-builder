# Variety: how alike the generated homepages look

Mode **record-missing**, scope **home**, 2026-10-08T07:45:16.328Z, 17 sites, 136 pairs. Look distance 0 = the same site, 1 = nothing in common: the spec (direction, font pair, palette ΔE, hero, header, section sequence) and the first screens at 360 and 1280 px (layout gradients, colour histogram), weighted equally. Free, no model call (tools/eval/src/look-distance.ts).

Variety switches on: **families, skeleton, concept** (run on).

## Targets

| Target | Value | Needed | Met |
|---|---|---|---|
| Look distance within a trade ≥ across trades | 0.49 | ≥ 0.47 (today's lowest across-trade distance) | ✓ |
| No two sites of one trade share palette, font pair and hero | 0 | 0 | ✓ |
| Judge distinctiveness ≥ 3 on every site (lower of phone and desktop) | min 3 | ≥ 3 | ✓ |
| Judge median (mean of phone and desktop) | 3.17 | ≥ 3.2 | ✗ |
| Judge median on the template trades | 3.17 | ≥ 3.7 | ✗ |

## Summary

- Across trades (pairs of different business types): **0.62**
- Within a trade (pairs of the same business type): **0.49**
- Pairs a visitor would take for one template (same palette family, font pair and hero): **1**: brivnica-kos / mizarstvo-lesnik
- Brand fit (a logo colour reaches primary, band or accent within ΔE 20): 2 of 2 sites with a coloured logo
- Motif fit: 13 fit, 0 misfit, 4 without a motif

## Within each trade

| Trade | Pairs | Mean | Closest pair |
|---|---|---|---|
| builder | 3 | 0.53 | 0.39 |
| car-repair | 6 | 0.46 | 0.30 |
| hairdresser | 6 | 0.47 | 0.40 |
| restaurant | 6 | 0.51 | 0.33 |
| shop | 1 | 0.52 | 0.52 |

## Per site

| Site | Trade | Direction | Font pair | Hero | Brand fit | Motif |
|---|---|---|---|---|---|---|
| avtoservis-mrak | car-repair | tablica | archivo-public-sans | hero-signature:photo | no logo | plate ✓ |
| frizerstvo-lana | hairdresser | ogledalo | lora-dm-sans | hero-signature:mirrors | ✓ #7a2e3a → primary (ΔE 0) | mirror ✓ |
| gostilna-zlata-zlica | restaurant | jedilnik | fraunces-source-sans | hero-signature:card | no logo | spoon ✓ |
| instalacije-rebernik | builder | cevi | manrope-public-sans | hero-signature:drawing | no logo | pipes ✓ |
| trgovina-oljka-in-sol | shop | etiketa | garamond-karla | hero-image:overlay-left | no logo | label ✓ |
| avto-kovac | car-repair | tablica | archivo-archivo | hero-signature:photo | ✓ #1f4e9c → primary (ΔE 0) | plate ✓ |
| brivnica-kos | hairdresser | warm-craft | fraunces-source-sans | hero-split:image-left | no logo | —  |
| cvetlicarna-marjetica | shop | etiketa | newsreader-libre-franklin | hero-signature:label | no logo | stem ✓ |
| elektro-zupan | builder | cevi | space-grotesk-plex | hero-type:large | no logo | wire ✓ |
| frizerski-salon-mia | hairdresser | ogledalo | bricolage-figtree | hero-split:image-right | no logo | mirror ✓ |
| gostilna-pri-mostu | restaurant | jedilnik | garamond-figtree | hero-split:image-right | no logo | spoon ✓ |
| gostisce-na-gricu | restaurant | jedilnik | garamond-figtree | hero-image:overlay-bottom | no logo | spoon ✓ |
| karoserija-hribar | car-repair | tablica | space-grotesk-public-sans | hero-signature:photo | no logo | plate ✓ |
| mizarstvo-lesnik | builder | warm-craft | fraunces-source-sans | hero-split:image-left | no logo | —  |
| pizzeria-oljka | restaurant | warm-craft | fraunces-source-sans | hero-signature:arch | no logo | —  |
| salon-tina | hairdresser | soft-studio | lora-dm-sans | hero-split:image-left | no logo | —  |
| vulkanizer-zorman | car-repair | tablica | space-grotesk-public-sans | hero-type:large | no logo | plate ✓ |

## Druga podoba and Ustvari znova

- Druga podoba (no model call): 13 of 17 sites got another look, mean distance from the generated look **0.27** (closest 0.17); with check failures or invalid: avtoservis-mrak, karoserija-hribar; none offered: brivnica-kos (no_family), mizarstvo-lesnik (no_family), pizzeria-oljka (no_family), salon-tina (no_family)
- Ustvari znova (paid, €2.164): 12 regenerated, mean distance from the first look **0.59** (closest 0.41); the same look again: none; with check failures: none

## Closest pairs

| Pair | Same trade | Spec | Screens | Look distance |
|---|---|---|---|---|
| brivnica-kos / mizarstvo-lesnik | no | 0.13 | 0.24 | 0.18 |
| avtoservis-mrak / karoserija-hribar | yes | 0.28 | 0.33 | 0.30 |
| gostilna-pri-mostu / gostisce-na-gricu | yes | 0.22 | 0.44 | 0.33 |
| avtoservis-mrak / avto-kovac | yes | 0.44 | 0.32 | 0.38 |
| avto-kovac / karoserija-hribar | yes | 0.47 | 0.30 | 0.38 |
| instalacije-rebernik / elektro-zupan | yes | 0.50 | 0.28 | 0.39 |
| brivnica-kos / salon-tina | yes | 0.56 | 0.23 | 0.40 |
| mizarstvo-lesnik / salon-tina | no | 0.58 | 0.23 | 0.40 |
| gostilna-zlata-zlica / gostisce-na-gricu | yes | 0.48 | 0.32 | 0.40 |
| brivnica-kos / pizzeria-oljka | no | 0.33 | 0.47 | 0.40 |
| frizerski-salon-mia / gostilna-pri-mostu | no | 0.56 | 0.25 | 0.41 |
| frizerstvo-lana / salon-tina | yes | 0.53 | 0.28 | 0.41 |

## Copy: how alike the homepages read

Word overlap (Jaccard of word stems) of each homepage's hero headline, eyebrows and section titles, the business's own name and town left out: 0 = no word in common, 1 = the same words. Free, from the spec.

- Across trades: **0.06**
- Within a trade: **0.17**
- Headings used word for word on more than one homepage: „cenik" ×3, „poklicite za rezervacijo mize" ×3, „kaj vse naredimo" ×2, „kdaj nas lahko obiscete" ×2, „kdaj smo odprti" ×2, „narocite se s klicem" ×2, „nasa zgodba" ×2

| Pair | Same trade | Copy overlap |
|---|---|---|
| avtoservis-mrak / karoserija-hribar | yes | 0.40 |
| gostilna-zlata-zlica / gostilna-pri-mostu | yes | 0.38 |
| gostilna-zlata-zlica / gostisce-na-gricu | yes | 0.31 |
| avtoservis-mrak / avto-kovac | yes | 0.29 |
| gostilna-pri-mostu / gostisce-na-gricu | yes | 0.29 |
| instalacije-rebernik / karoserija-hribar | no | 0.24 |
| avtoservis-mrak / vulkanizer-zorman | yes | 0.22 |
| frizerstvo-lana / frizerski-salon-mia | yes | 0.21 |
