# Eval report

Mode: **offline**, scope: **full**, started 2026-09-30T22:10:03.182Z, wall time 347.2 s, total model spend €0.000.

Offline mode renders hand-authored golden specs with no model calls: it measures the components, directions and checks, not generation quality, cost or time.

## Summary

- Checkpoints passing every automated check: **10/10**
- Scripted edits: 0 pass, 0 fail, 0 manual
- Homepages repeating the contact facts (2+ contact blocks): 7/10
- Homepage skeleton similarity across sites: 0.36 (0 = nothing shared, 1 = same section order)
- First screen meets the composition targets: phone 9/10, desktop 8/10 (report-only; table below)

## First screen

Measured on the rendered homepage before scrolling: photo share · first photo at (screens) · buttons · headline lines · largest empty band (px). Targets: phone photo ≥ 25 % (with photos), ≤ 3 buttons, ≤ 4 lines, band ≤ 96 px; desktop photo ≥ 30 %, ≤ 3 buttons, ≤ 3 lines, band ≤ 160 px.

| Site | Photos | Phone 360×800 | Misses | Desktop 1280×800 | Misses |
|---|---|---|---|---|---|
| avtoservis-mrak | 3 | 0 % · 1.25 · 1 · 2 · 58 | photo 0 % < 25 % | 3 % · 0.87 · 2 · 2 · 85 | photo 3 % < 30 % |
| fizioterapija-pregib | 1 | 29 % · 0.11 · 3 · 3 · 53 | ✓ | 30 % · 0.15 · 2 · 3 · 113 | ✓ |
| frizerstvo-lana | 5 | 29 % · 0.12 · 3 · 2 · 81 | ✓ | 30 % · 0.16 · 2 · 2 · 137 | ✓ |
| gostilna-zlata-zlica | 8 | 26 % · 0.13 · 3 · 3 · 81 | ✓ | 71 % · 0.21 · 2 · 3 · 145 | ✓ |
| instalacije-rebernik | 0 | 0 % · — · 1 · 3 · 58 | ✓ | 0 % · — · 2 · 3 · 84 | ✓ |
| kmetija-grabnar | 8 | 35 % · 0.11 · 3 · 2 · 81 | ✓ | 66 % · 0.15 · 1 · 2 · 128 | ✓ |
| pekarna-kvas | 3 | 28 % · 0.11 · 3 · 2 · 52 | ✓ | 29 % · 0.15 · 2 · 2 · 100 | photo 29 % < 30 % |
| racunovodstvo-seliskar | 0 | 0 % · — · 3 · 4 · 89 | ✓ | 0 % · — · 2 · 3 · 112 | ✓ |
| trgovina-oljka-in-sol | 5 | 29 % · 0.11 · 3 · 3 · 48 | ✓ | 30 % · 0.15 · 2 · 3 · 88 | ✓ |
| zobozdravstvo-lebar | 3 | 29 % · 0.12 · 3 · 3 · 81 | ✓ | 30 % · 0.16 · 2 · 2 · 145 | ✓ |

## Sites

Lighthouse thresholds: performance ≥ 90, accessibility 100, best practices ≥ 95, SEO ≥ 95.

| Site | Type | Direction | LH P/A/BP/SEO | axe | 360 px width | Facts | Placeholders | Export offline | Gen cost | Gen time | First preview | Pass |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| avtoservis-mrak | car-repair | bold-local | 100/100/100/100 | 0 | 360 | 0 | 4 | ✓ 2.0 MB | — | — | — | ✓ |
| fizioterapija-pregib | physio | clean-swiss | 99/100/100/100 | 0 | 360 | 0 | 0 | ✓ 1.0 MB | — | — | — | ✓ |
| frizerstvo-lana | hairdresser | soft-studio | 98/100/100/100 | 0 | 360 | 0 | 5 | ✓ 2.3 MB | — | — | — | ✓ |
| gostilna-zlata-zlica | restaurant | dark-elegant | 93/100/100/100 | 0 | 360 | 0 | 2 | ✓ 4.8 MB | — | — | — | ✓ |
| instalacije-rebernik | builder | industrial | 100/100/100/100 | 0 | 360 | 0 | 1 | ✓ 0.7 MB | — | — | — | ✓ |
| kmetija-grabnar | tourist-farm | alpine-nature | 91/100/100/100 | 0 | 360 | 0 | 3 | ✓ 5.4 MB | — | — | — | ✓ |
| pekarna-kvas | bakery | warm-craft | 97/100/100/100 | 0 | 360 | 0 | 5 | ✓ 2.3 MB | — | — | — | ✓ |
| racunovodstvo-seliskar | accountant | editorial | 100/100/100/100 | 0 | 360 | 0 | 1 | ✓ 0.7 MB | — | — | — | ✓ |
| trgovina-oljka-in-sol | shop | playful-modern | 97/100/100/100 | 0 | 360 | 0 | 0 | ✓ 3.3 MB | — | — | — | ✓ |
| zobozdravstvo-lebar | dental | clinical-calm | 100/100/100/100 | 0 | 360 | 0 | 0 | ✓ 1.5 MB | — | — | — | ✓ |

### avtoservis-mrak

Homepage: hero-type:with-facts › services-cards:compact › steps:horizontal › about:text-only › contact:split-map (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |

### fizioterapija-pregib

Homepage: hero-split:image-right › contact-strip:bar › services-list:rows › highlights:columns › about:text-only › booking:with-hours › contact:split-map (3 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |

### frizerstvo-lana

Homepage: hero-split:image-left › contact-strip:cards › services-list:rows › about:image-side › gallery:grid › booking:simple (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 98/100/100/100 | 0 | ✓ |  | — |

### gostilna-zlata-zlica

Homepage: hero-image:overlay-left › booking:with-hours › image-text:image-right › image-text:image-left › about:image-side › gallery:grid › contact:stacked (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 93/100/100/100 | 0 | ✓ |  | — |

### instalacije-rebernik

Homepage: hero-type:with-facts › services-list:two-column › steps:horizontal › text:two-column › service-area:list › about:text-only › cta:split (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |

### kmetija-grabnar

Homepage: hero-image:overlay-bottom › contact-strip:bar › highlights:columns › image-text:image-left › about:text-only › gallery:mosaic › contact:split-map (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 91/100/100/100 | 0 | ✓ |  | — |

### pekarna-kvas

Homepage: hero-split:image-left › contact-strip:bar › products:grid › about:image-side › steps:horizontal › opening-hours:compact › contact:split-map (3 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### racunovodstvo-seliskar

Homepage: hero-type:large › contact-strip:bar › services-list:rows › text:two-column › about:text-only › contact-form:split › cta:split (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |

### trgovina-oljka-in-sol

Homepage: hero-split:image-right › contact-strip:bar › products:grid › announcement:card › steps:horizontal › image-text:image-left › contact:split-map (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### zobozdravstvo-lebar

Homepage: hero-split:image-right › booking:with-hours › services-list:two-column › steps:vertical › team:list › contact:split-map (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |
