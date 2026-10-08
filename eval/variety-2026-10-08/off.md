# Variety: how alike the generated homepages look

Mode **record-missing**, scope **home**, 2026-10-08T06:12:43.375Z, 22 sites, 231 pairs. Look distance 0 = the same site, 1 = nothing in common: the spec (direction, font pair, palette ΔE, hero, header, section sequence) and the first screens at 360 and 1280 px (layout gradients, colour histogram), weighted equally. Free, no model call (tools/eval/src/look-distance.ts).

Variety switches on: **none** (run off).

## Targets

| Target | Value | Needed | Met |
|---|---|---|---|
| Look distance within a trade ≥ across trades | 0.38 | ≥ 0.47 (today's lowest across-trade distance) | ✗ |
| No two sites of one trade share palette, font pair and hero | 11 (avtoservis-mrak / avto-kovac, avtoservis-mrak / karoserija-hribar, avtoservis-mrak / vulkanizer-zorman, frizerstvo-lana / frizerski-salon-mia, gostilna-zlata-zlica / gostilna-pri-mostu, gostilna-zlata-zlica / gostisce-na-gricu, instalacije-rebernik / elektro-zupan, avto-kovac / karoserija-hribar, avto-kovac / vulkanizer-zorman, gostilna-pri-mostu / gostisce-na-gricu, karoserija-hribar / vulkanizer-zorman) | 0 | ✗ |
| Judge distinctiveness ≥ 3 on every site (lower of phone and desktop) | min 2; below 3: brivnica-kos, mizarstvo-lesnik | ≥ 3 | ✗ |
| Judge median (mean of phone and desktop) | 3.42 | ≥ 3.2 | ✓ |
| Judge median on the template trades | 3.42 | ≥ 3.7 | ✗ |

## Summary

- Across trades (pairs of different business types): **0.61**
- Within a trade (pairs of the same business type): **0.38**
- Pairs a visitor would take for one template (same palette family, font pair and hero): **13**: avtoservis-mrak / avto-kovac, avtoservis-mrak / karoserija-hribar, avtoservis-mrak / vulkanizer-zorman, frizerstvo-lana / frizerski-salon-mia, gostilna-zlata-zlica / gostilna-pri-mostu, gostilna-zlata-zlica / gostisce-na-gricu, instalacije-rebernik / elektro-zupan, avto-kovac / karoserija-hribar, avto-kovac / vulkanizer-zorman, cvetlicarna-marjetica / mizarstvo-lesnik, cvetlicarna-marjetica / pizzeria-oljka, gostilna-pri-mostu / gostisce-na-gricu, karoserija-hribar / vulkanizer-zorman
- Brand fit (a logo colour reaches primary, band or accent within ΔE 20): 3 of 4 sites with a coloured logo
- Motif fit: 16 fit, 1 misfit, 5 without a motif

## Within each trade

| Trade | Pairs | Mean | Closest pair |
|---|---|---|---|
| builder | 3 | 0.42 | 0.10 |
| car-repair | 6 | 0.16 | 0.10 |
| hairdresser | 6 | 0.54 | 0.05 |
| restaurant | 6 | 0.38 | 0.04 |
| shop | 1 | 0.62 | 0.62 |

## Per site

| Site | Trade | Direction | Font pair | Hero | Brand fit | Motif |
|---|---|---|---|---|---|---|
| avtoservis-mrak | car-repair | tablica | archivo-public-sans | hero-signature:photo | no logo | plate ✓ |
| fizioterapija-pregib | physio | pregib | bricolage-public-sans | hero-signature:bend | ✓ #116c64 → primary (ΔE 0) | bend ✓ |
| frizerstvo-lana | hairdresser | ogledalo | inter-tight-dm-sans | hero-signature:mirrors | ✓ #7a2e3a → primary (ΔE 0) | mirror ✓ |
| gostilna-zlata-zlica | restaurant | jedilnik | garamond-figtree | hero-signature:card | no logo | spoon ✓ |
| instalacije-rebernik | builder | cevi | space-grotesk-public-sans | hero-signature:drawing | no logo | pipes ✓ |
| kmetija-grabnar | tourist-farm | markacija | fraunces-nunito-sans | hero-signature:view | no logo | trail ✓ |
| pekarna-kvas | bakery | skorja | bitter-karla | hero-signature:arch | ✓ #9a5a1f → accent (ΔE 5) | crust ✓ |
| racunovodstvo-seliskar | accountant | racun | ibm-plex-sans | hero-signature:receipt | no logo | ledger ✓ |
| trgovina-oljka-in-sol | shop | etiketa | lora-karla | hero-signature:label | no logo | label ✓ |
| zobozdravstvo-lebar | dental | nasmeh | figtree-figtree | hero-signature:disc | no logo | smile ✓ |
| avto-kovac | car-repair | tablica | archivo-public-sans | hero-signature:photo | ✗ #3c65a8 → primary (ΔE 51) | plate ✓ |
| brivnica-kos | hairdresser | dark-elegant | garamond-karla | hero-image:overlay-left | no logo | —  |
| cvetlicarna-marjetica | shop | warm-craft | fraunces-source-sans | hero-split:image-left | no logo | —  |
| elektro-zupan | builder | cevi | space-grotesk-public-sans | hero-signature:drawing | no logo | pipes ✗ |
| frizerski-salon-mia | hairdresser | ogledalo | inter-tight-dm-sans | hero-signature:mirrors | no logo | mirror ✓ |
| gostilna-pri-mostu | restaurant | jedilnik | garamond-figtree | hero-signature:card | no logo | spoon ✓ |
| gostisce-na-gricu | restaurant | jedilnik | garamond-figtree | hero-signature:card | no logo | spoon ✓ |
| karoserija-hribar | car-repair | tablica | archivo-public-sans | hero-signature:photo | no logo | plate ✓ |
| mizarstvo-lesnik | builder | warm-craft | fraunces-source-sans | hero-split:image-left | no logo | —  |
| pizzeria-oljka | restaurant | warm-craft | fraunces-source-sans | hero-split:image-left | no logo | —  |
| salon-tina | hairdresser | soft-studio | lora-dm-sans | hero-split:image-left | no logo | —  |
| vulkanizer-zorman | car-repair | tablica | archivo-public-sans | hero-signature:photo | no logo | plate ✓ |

## Closest pairs

| Pair | Same trade | Spec | Screens | Look distance |
|---|---|---|---|---|
| gostilna-zlata-zlica / gostisce-na-gricu | yes | 0.00 | 0.08 | 0.04 |
| frizerstvo-lana / frizerski-salon-mia | yes | 0.00 | 0.10 | 0.05 |
| instalacije-rebernik / elektro-zupan | yes | 0.03 | 0.17 | 0.10 |
| avtoservis-mrak / karoserija-hribar | yes | 0.00 | 0.20 | 0.10 |
| karoserija-hribar / vulkanizer-zorman | yes | 0.03 | 0.19 | 0.11 |
| cvetlicarna-marjetica / pizzeria-oljka | no | 0.05 | 0.21 | 0.13 |
| avtoservis-mrak / vulkanizer-zorman | yes | 0.03 | 0.25 | 0.14 |
| gostilna-pri-mostu / gostisce-na-gricu | yes | 0.03 | 0.29 | 0.16 |
| mizarstvo-lesnik / pizzeria-oljka | no | 0.15 | 0.18 | 0.16 |
| gostilna-zlata-zlica / gostilna-pri-mostu | yes | 0.03 | 0.30 | 0.16 |
| cvetlicarna-marjetica / mizarstvo-lesnik | no | 0.14 | 0.19 | 0.16 |
| avto-kovac / karoserija-hribar | yes | 0.12 | 0.25 | 0.18 |

## Copy: how alike the homepages read

Word overlap (Jaccard of word stems) of each homepage's hero headline, eyebrows and section titles, the business's own name and town left out: 0 = no word in common, 1 = the same words. Free, from the spec.

- Across trades: **0.05**
- Within a trade: **0.13**
- Headings used word for word on more than one homepage: „cenik" ×3, „kaj delamo" ×3, „poklicite za rezervacijo mize" ×3, „kaj vse popravimo in uredimo" ×2, „kje delamo" ×2, „malica in nedeljsko kosilo" ×2, „obiscite nas" ×2, „poklicite nas za brezplacen ogled" ×2, „storitve" ×2

| Pair | Same trade | Copy overlap |
|---|---|---|
| instalacije-rebernik / elektro-zupan | yes | 0.39 |
| gostilna-zlata-zlica / gostilna-pri-mostu | yes | 0.38 |
| avtoservis-mrak / karoserija-hribar | yes | 0.36 |
| frizerstvo-lana / frizerski-salon-mia | yes | 0.29 |
| avtoservis-mrak / avto-kovac | yes | 0.25 |
| avtoservis-mrak / elektro-zupan | no | 0.22 |
| elektro-zupan / vulkanizer-zorman | no | 0.22 |
| instalacije-rebernik / vulkanizer-zorman | no | 0.21 |
