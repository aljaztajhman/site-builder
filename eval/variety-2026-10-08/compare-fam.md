# Variety: before and after

Before: **none** (record-missing, home, 2026-10-08T06:12:43.375Z, run off, 22 sites, paid €3.46).
After: **families** (record-missing, home, 2026-10-08T09:44:24.761Z, run fam, 3 sites, paid €0.29).

## Targets after (look distance against the before run's across-trade distance)

| Target | Value | Needed | Met |
|---|---|---|---|
| Look distance within a trade ≥ across trades | 0.57 | ≥ 0.61 (the baseline's across-trade distance) | ✗ |
| No two sites of one trade share palette, font pair and hero | 0 | 0 | ✓ |
| Judge distinctiveness ≥ 3 on every site (lower of phone and desktop) | min 2; below 3: mizarstvo-lesnik | ≥ 3 | ✗ |
| Judge median (mean of phone and desktop) | 3.08 | ≥ 3.2 | ✗ |
| Judge median on the template trades | 3.08 | ≥ 3.7 | ✗ |

## Targets before

| Target | Value | Needed | Met |
|---|---|---|---|
| Look distance within a trade ≥ across trades | 0.38 | ≥ 0.47 (today's lowest across-trade distance) | ✗ |
| No two sites of one trade share palette, font pair and hero | 11 (avtoservis-mrak / avto-kovac, avtoservis-mrak / karoserija-hribar, avtoservis-mrak / vulkanizer-zorman, frizerstvo-lana / frizerski-salon-mia, gostilna-zlata-zlica / gostilna-pri-mostu, gostilna-zlata-zlica / gostisce-na-gricu, instalacije-rebernik / elektro-zupan, avto-kovac / karoserija-hribar, avto-kovac / vulkanizer-zorman, gostilna-pri-mostu / gostisce-na-gricu, karoserija-hribar / vulkanizer-zorman) | 0 | ✗ |
| Judge distinctiveness ≥ 3 on every site (lower of phone and desktop) | min 2; below 3: brivnica-kos, mizarstvo-lesnik | ≥ 3 | ✗ |
| Judge median (mean of phone and desktop) | 3.42 | ≥ 3.2 | ✓ |
| Judge median on the template trades | 3.42 | ≥ 3.7 | ✗ |

## Numbers

| | Before | After |
|---|---|---|
| Look distance across trades | 0.61 | 0.53 |
| Look distance within a trade | 0.38 | 0.57 |
| … builder (mean, closest pair) | 0.42, 0.10 | 0.57, 0.57 |
| … car-repair (mean, closest pair) | 0.16, 0.10 | —, — |
| … hairdresser (mean, closest pair) | 0.54, 0.05 | —, — |
| … restaurant (mean, closest pair) | 0.38, 0.04 | —, — |
| … shop (mean, closest pair) | 0.62, 0.62 | —, — |
| Same-trade pairs with one palette, font pair and hero | 11 | 0 |
| Judge median (phone / desktop) | 3.42 (3.33 / 3.67) | 3.08 (3.00 / 3.00) |
| Judge median, template trades | 3.42 | 3.08 |
| Lowest distinctiveness | 2 | 2 |
| Same 3 sites: judge median, template trades, lowest distinctiveness | 3.17, 3.17, 2 | 3.08, 3.08, 2 |
| Median generation cost per homepage | €0.123 | €0.233 |
| Druga podoba: sites with another look, mean distance | — | 2/3, 0.23 |
| Ustvari znova: regenerated, mean distance, same look again | — | — |

Only sites in both runs are compared below; the before run's numbers above cover all of its sites.

## Per site

| Site | Trade | Before: direction, font pair, hero | After: direction, font pair, hero | Judge before → after | Distinctiveness before → after | Generation € before → after | Check failures before → after |
|---|---|---|---|---|---|---|---|
| elektro-zupan | builder | cevi, space-grotesk-public-sans, hero-signature:drawing | cevi, space-grotesk-public-sans, hero-type:large | 3.17 → 3.00 | 3 → 3 | €0.099 → €0.140 | 0 → 0 |
| mizarstvo-lesnik | builder | warm-craft, fraunces-source-sans, hero-split:image-left | warm-craft, fraunces-source-sans, hero-split:image-left | 3.17 → 3.08 | 2 → 2 | €0.236 → €0.233 | 0 → 1 |
| vulkanizer-zorman | car-repair | tablica, archivo-public-sans, hero-signature:photo | tablica, archivo-archivo, hero-type:large | 3.33 → 3.08 | 4 → 4 | €0.235 → €0.235 | 0 → 0 |
