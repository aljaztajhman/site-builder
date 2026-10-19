# Variety: how alike the generated homepages look

Mode **record-missing**, scope **home**, 2026-10-19T13:17:35.991Z, 10 sites, 45 pairs. Look distance 0 = the same site, 1 = nothing in common: the spec (direction, font pair, palette ΔE, hero, header, section sequence) and the first screens at 360 and 1280 px (layout gradients, colour histogram), weighted equally. Free, no model call (tools/eval/src/look-distance.ts).

Variety switches on: **families, skeleton, concept** (run m6-on).

## Targets

| Target | Value | Needed | Met |
|---|---|---|---|
| Look distance within a trade ≥ across trades | 0.52 | ≥ 0.47 (today's lowest across-trade distance) | ✓ |
| No two sites of one trade share palette, font pair and hero | 0 | 0 | ✓ |
| Judge distinctiveness ≥ 3 on every site (lower of phone and desktop) | min 2; below 3: servis-aparatov-rebec | ≥ 3 | ✗ |
| Judge median (mean of phone and desktop) | 3.38 | ≥ 3.2 | ✓ |
| Judge median on the template trades | 3.38 | ≥ 3.7 | ✗ |

## Summary

- Across trades (pairs of different business types): **0.58**
- Within a trade (pairs of the same business type): **0.52**
- Pairs a visitor would take for one template (same palette family, font pair and hero): **0**
- Brand fit (a logo colour reaches primary, band or accent within ΔE 20): 2 of 3 sites with a coloured logo
- Motif fit: 0 fit, 3 misfit, 7 without a motif

## Within each trade

| Trade | Pairs | Mean | Closest pair |
|---|---|---|---|
| builder | 3 | 0.42 | 0.27 |
| shop | 6 | 0.57 | 0.36 |

## Per site

| Site | Trade | Direction | Font pair | Hero | Brand fit | Motif |
|---|---|---|---|---|---|---|
| dimnikarstvo-vidmar | builder | bold-local | archivo-archivo | hero-split:image-right | ✗ #e6b5ad → accent (ΔE 44) | —  |
| kamp-soska | tourist-farm | alpine-nature | bitter-nunito-sans | hero-image:overlay-bottom | no logo | —  |
| klavirji-urbanc | shop | warm-craft | fraunces-source-sans | hero-split:image-left | no logo | —  |
| knjigoveznica-kras | shop | etiketa | lora-karla | hero-signature:label | no logo | label ✗ |
| pedikura-nogica | hairdresser | soft-studio | lora-dm-sans | hero-split:image-left | no logo | —  |
| pralnica-cisto | shop | clean-swiss | inter-tight-inter | hero-split:image-right | no logo | —  |
| servis-aparatov-rebec | builder | bold-local | archivo-archivo | hero-split:image-right | no logo | —  |
| slascicarna-pri-zofki | bakery | skorja | bitter-karla | hero-signature:arch | ✓ #9c3d54 → primary (ΔE 0) | crust ✗ |
| tapetnistvo-lesjak | builder | warm-craft | fraunces-source-sans | hero-split:image-left | no logo | —  |
| zeliscarna-pri-lipi | shop | etiketa | newsreader-libre-franklin | hero-signature:label | ✓ #577a38 → primary (ΔE 0) | label ✗ |

## Druga podoba and Ustvari znova

- Druga podoba (no model call): 3 of 10 sites got another look, mean distance from the generated look **0.24** (closest 0.19); with check failures or invalid: none; none offered: dimnikarstvo-vidmar (no_family), kamp-soska (no_family), klavirji-urbanc (no_family), pedikura-nogica (no_family), pralnica-cisto (no_family), servis-aparatov-rebec (no_family), tapetnistvo-lesjak (no_family)

## Closest pairs

| Pair | Same trade | Spec | Screens | Look distance |
|---|---|---|---|---|
| klavirji-urbanc / tapetnistvo-lesjak | no | 0.22 | 0.23 | 0.23 |
| dimnikarstvo-vidmar / servis-aparatov-rebec | yes | 0.23 | 0.30 | 0.27 |
| klavirji-urbanc / pedikura-nogica | no | 0.58 | 0.11 | 0.35 |
| knjigoveznica-kras / zeliscarna-pri-lipi | yes | 0.48 | 0.24 | 0.36 |
| pedikura-nogica / tapetnistvo-lesjak | no | 0.64 | 0.23 | 0.43 |
| dimnikarstvo-vidmar / pralnica-cisto | no | 0.67 | 0.23 | 0.45 |
| pralnica-cisto / servis-aparatov-rebec | no | 0.62 | 0.29 | 0.46 |
| pedikura-nogica / pralnica-cisto | no | 0.66 | 0.33 | 0.49 |
| dimnikarstvo-vidmar / tapetnistvo-lesjak | yes | 0.67 | 0.34 | 0.50 |
| servis-aparatov-rebec / tapetnistvo-lesjak | yes | 0.66 | 0.34 | 0.50 |
| dimnikarstvo-vidmar / klavirji-urbanc | no | 0.67 | 0.35 | 0.51 |
| pralnica-cisto / tapetnistvo-lesjak | no | 0.75 | 0.31 | 0.53 |

## Copy: how alike the homepages read

Word overlap (Jaccard of word stems) of each homepage's hero headline, eyebrows and section titles, the business's own name and town left out: 0 = no word in common, 1 = the same words. Free, from the spec.

- Across trades: **0.07**
- Within a trade: **0.09**
- Headings used word for word on more than one homepage: „kdaj nas lahko obiscete" ×2, „kje delam" ×2

| Pair | Same trade | Copy overlap |
|---|---|---|
| dimnikarstvo-vidmar / klavirji-urbanc | no | 0.35 |
| knjigoveznica-kras / zeliscarna-pri-lipi | yes | 0.29 |
| slascicarna-pri-zofki / zeliscarna-pri-lipi | no | 0.20 |
| klavirji-urbanc / pralnica-cisto | yes | 0.16 |
| dimnikarstvo-vidmar / pralnica-cisto | no | 0.15 |
| knjigoveznica-kras / servis-aparatov-rebec | no | 0.14 |
| pralnica-cisto / tapetnistvo-lesjak | no | 0.13 |
| kamp-soska / pedikura-nogica | no | 0.11 |
