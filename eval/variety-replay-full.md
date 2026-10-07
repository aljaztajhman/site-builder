# Variety: how alike the generated homepages look

Mode **replay**, scope **full**, 2026-10-07T12:46:30.737Z, 10 sites, 45 pairs. Look distance 0 = the same site, 1 = nothing in common: the spec (direction, font pair, palette ΔE, hero, header, section sequence) and the first screens at 360 and 1280 px (layout gradients, colour histogram), weighted equally. Free, no model call (tools/eval/src/look-distance.ts).

## Summary

- Across trades (pairs of different business types): **0.47**
- Within a trade (pairs of the same business type): **—** (no two sites of one trade in this run: run with --twins)
- Pairs a visitor would take for one template (same palette family, font pair and hero): **0**
- Brand fit (a logo colour reaches primary, band or accent within ΔE 20): 3 of 3 sites with a coloured logo
- Motif fit: 0 fit, 0 misfit, 10 without a motif

## Per site

| Site | Trade | Direction | Font pair | Hero | Brand fit | Motif |
|---|---|---|---|---|---|---|
| avtoservis-mrak | car-repair | bold-local | archivo-archivo | hero-split:image-right | no logo | —  |
| fizioterapija-pregib | physio | clinical-calm | manrope-public-sans | hero-split:image-right | ✓ #116c64 → primary (ΔE 0) | —  |
| frizerstvo-lana | hairdresser | soft-studio | lora-dm-sans | hero-split:image-left | ✓ #7a2e3a → primary (ΔE 0) | —  |
| gostilna-zlata-zlica | restaurant | warm-craft | fraunces-source-sans | hero-split:image-left | no logo | —  |
| instalacije-rebernik | builder | bold-local | archivo-archivo | hero-split:image-right | no logo | —  |
| kmetija-grabnar | tourist-farm | alpine-nature | bitter-nunito-sans | hero-image:overlay-bottom | no logo | —  |
| pekarna-kvas | bakery | warm-craft | fraunces-source-sans | hero-split:image-left | ✓ #9a5a1f → primary (ΔE 0) | —  |
| racunovodstvo-seliskar | accountant | clean-swiss | inter-tight-inter | hero-split:image-right | no logo | —  |
| trgovina-oljka-in-sol | shop | warm-craft | fraunces-source-sans | hero-split:image-left | no logo | —  |
| zobozdravstvo-lebar | dental | clinical-calm | manrope-public-sans | hero-split:image-right | no logo | —  |

## Closest pairs

| Pair | Same trade | Spec | Screens | Look distance |
|---|---|---|---|---|
| fizioterapija-pregib / zobozdravstvo-lebar | no | 0.04 | 0.17 | 0.11 |
| gostilna-zlata-zlica / trgovina-oljka-in-sol | no | 0.15 | 0.13 | 0.14 |
| gostilna-zlata-zlica / pekarna-kvas | no | 0.15 | 0.13 | 0.14 |
| pekarna-kvas / trgovina-oljka-in-sol | no | 0.21 | 0.11 | 0.16 |
| avtoservis-mrak / instalacije-rebernik | no | 0.18 | 0.23 | 0.20 |
| frizerstvo-lana / pekarna-kvas | no | 0.59 | 0.17 | 0.38 |
| racunovodstvo-seliskar / zobozdravstvo-lebar | no | 0.50 | 0.26 | 0.38 |
| instalacije-rebernik / racunovodstvo-seliskar | no | 0.62 | 0.19 | 0.40 |
| frizerstvo-lana / gostilna-zlata-zlica | no | 0.64 | 0.18 | 0.41 |
| fizioterapija-pregib / racunovodstvo-seliskar | no | 0.53 | 0.28 | 0.41 |
| frizerstvo-lana / trgovina-oljka-in-sol | no | 0.67 | 0.19 | 0.43 |
| avtoservis-mrak / zobozdravstvo-lebar | no | 0.60 | 0.27 | 0.44 |
