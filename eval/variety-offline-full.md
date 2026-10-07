# Variety: how alike the generated homepages look

Mode **offline**, scope **full**, 2026-10-07T12:35:55.087Z, 10 sites, 45 pairs. Look distance 0 = the same site, 1 = nothing in common: the spec (direction, font pair, palette ΔE, hero, header, section sequence) and the first screens at 360 and 1280 px (layout gradients, colour histogram), weighted equally. Free, no model call (tools/eval/src/look-distance.ts).

## Summary

- Across trades (pairs of different business types): **0.61**
- Within a trade (pairs of the same business type): **—** (no two sites of one trade in this run: run with --twins)
- Pairs a visitor would take for one template (same palette family, font pair and hero): **0**
- Brand fit (a logo colour reaches primary, band or accent within ΔE 20): 2 of 3 sites with a coloured logo
- Motif fit: 7 fit, 0 misfit, 3 without a motif

## Per site

| Site | Trade | Direction | Font pair | Hero | Brand fit | Motif |
|---|---|---|---|---|---|---|
| avtoservis-mrak | car-repair | bold-local | archivo-archivo | hero-type:with-facts | no logo | —  |
| fizioterapija-pregib | physio | pregib | bricolage-public-sans | hero-signature:bend | ✓ #116c64 → primary (ΔE 0) | bend ✓ |
| frizerstvo-lana | hairdresser | ogledalo | inter-tight-dm-sans | hero-signature:mirrors | ✓ #7a2e3a → primary (ΔE 0) | mirror ✓ |
| gostilna-zlata-zlica | restaurant | jedilnik | garamond-figtree | hero-signature:card | no logo | spoon ✓ |
| instalacije-rebernik | builder | industrial | space-grotesk-plex | hero-type:with-facts | no logo | —  |
| kmetija-grabnar | tourist-farm | markacija | fraunces-nunito-sans | hero-signature:view | no logo | trail ✓ |
| pekarna-kvas | bakery | warm-craft | fraunces-source-sans | hero-split:image-left | ✗ #9a5a1f → accent (ΔE 20) | —  |
| racunovodstvo-seliskar | accountant | racun | ibm-plex-sans | hero-signature:receipt | no logo | ledger ✓ |
| trgovina-oljka-in-sol | shop | etiketa | lora-karla | hero-signature:label | no logo | label ✓ |
| zobozdravstvo-lebar | dental | nasmeh | figtree-figtree | hero-signature:disc | no logo | smile ✓ |

## Closest pairs

| Pair | Same trade | Spec | Screens | Look distance |
|---|---|---|---|---|
| fizioterapija-pregib / zobozdravstvo-lebar | no | 0.57 | 0.29 | 0.43 |
| racunovodstvo-seliskar / zobozdravstvo-lebar | no | 0.62 | 0.28 | 0.45 |
| avtoservis-mrak / pekarna-kvas | no | 0.66 | 0.33 | 0.50 |
| fizioterapija-pregib / racunovodstvo-seliskar | no | 0.62 | 0.37 | 0.50 |
| frizerstvo-lana / zobozdravstvo-lebar | no | 0.69 | 0.30 | 0.50 |
| fizioterapija-pregib / frizerstvo-lana | no | 0.69 | 0.31 | 0.50 |
| fizioterapija-pregib / gostilna-zlata-zlica | no | 0.67 | 0.40 | 0.53 |
| frizerstvo-lana / racunovodstvo-seliskar | no | 0.69 | 0.39 | 0.54 |
| gostilna-zlata-zlica / racunovodstvo-seliskar | no | 0.63 | 0.45 | 0.54 |
| gostilna-zlata-zlica / trgovina-oljka-in-sol | no | 0.75 | 0.35 | 0.55 |
| gostilna-zlata-zlica / kmetija-grabnar | no | 0.67 | 0.43 | 0.55 |
| gostilna-zlata-zlica / zobozdravstvo-lebar | no | 0.64 | 0.46 | 0.55 |
