# Eval report

Mode: **offline**, scope: **full**, started 2026-10-07T11:29:45.279Z, wall time 345.0 s, paid this run €0.000 (replayed answers and cached pictures are free; the € columns below price every call like production).

Offline mode renders hand-authored golden specs with no model calls: it measures the components, directions and checks, not generation quality, cost or time.

## Summary

- Checkpoints passing every automated check: **10/10**
- Scripted edits: 0 pass, 0 fail, 0 manual
- Homepages repeating the contact facts (2+ contact blocks): 5/10
- Homepage skeleton similarity across sites: 0.36 (0 = nothing shared, 1 = same section order)
- First screen meets the composition targets: phone 7/10, desktop 4/10 (report-only; table below)

## First screen

Measured on the rendered homepage before scrolling: photo share · first photo at (screens) · buttons · headline lines · largest empty band (px). Targets: phone photo ≥ 25 % (with photos), ≤ 3 buttons, ≤ 4 lines, band ≤ 96 px; desktop photo ≥ 30 %, ≤ 3 buttons, ≤ 3 lines, band ≤ 160 px.

| Site | Photos | Phone 360×800 | Misses | Desktop 1280×800 | Misses |
|---|---|---|---|---|---|
| avtoservis-mrak | 3 | 0 % · 1.25 · 1 · 2 · 58 | photo 0 % < 25 % | 3 % · 0.87 · 2 · 2 · 85 | photo 3 % < 30 % |
| fizioterapija-pregib | 1 | 25 % · 0.53 · 3 · 3 · 62 | ✓ | 26 % · 0.24 · 2 · 3 · 112 | photo 26 % < 30 % |
| frizerstvo-lana | 5 | 21 % · 0.57 · 2 · 2 · 53 | photo 21 % < 25 % | 21 % · 0.18 · 2 · 3 · 88 | photo 21 % < 30 % |
| gostilna-zlata-zlica | 8 | 83 % · 0.09 · 2 · 3 · 44 | ✓ | 91 % · 0.09 · 1 · 3 · 140 | ✓ |
| instalacije-rebernik | 0 | 0 % · — · 1 · 3 · 58 | ✓ | 0 % · — · 2 · 3 · 84 | ✓ |
| kmetija-grabnar | 8 | 92 % · 0.08 · 2 · 3 · 62 | ✓ | 91 % · 0.09 · 1 · 3 · 112 | ✓ |
| pekarna-kvas | 3 | 28 % · 0.11 · 2 · 2 · 60 | ✓ | 29 % · 0.15 · 2 · 2 · 100 | photo 29 % < 30 % |
| racunovodstvo-seliskar | 0 | 0 % · — · 2 · 3 · 91 | ✓ | 0 % · — · 1 · 3 · 126 | ✓ |
| trgovina-oljka-in-sol | 5 | 10 % · 0.87 · 3 · 3 · 88 | photo 10 % < 25 % | 25 % · 0.34 · 2 · 3 · 146 | photo 25 % < 30 % |
| zobozdravstvo-lebar | 3 | 26 % · 0.65 · 2 · 4 · 80 | ✓ | 24 % · 0.16 · 1 · 4 · 88 | photo 24 % < 30 %; headline 4 lines > 3 |

## Sites

Lighthouse thresholds: performance ≥ 90, accessibility 100, best practices ≥ 95, SEO ≥ 95.

| Site | Type | Direction | LH P/A/BP/SEO | axe | 360 px width | Facts | Placeholders | Export offline | Gen cost | Gen time | First preview | Pass |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| avtoservis-mrak | car-repair | bold-local | 99/100/100/100 | 0 | 360 | 0 | 4 | ✓ 2.1 MB | — | — | — | ✓ |
| fizioterapija-pregib | physio | pregib | 98/100/100/100 | 0 | 360 | 0 | 0 | ✓ 1.2 MB | — | — | — | ✓ |
| frizerstvo-lana | hairdresser | ogledalo | 97/100/100/100 | 0 | 360 | 0 | 7 | ✓ 2.5 MB | — | — | — | ✓ |
| gostilna-zlata-zlica | restaurant | jedilnik | 95/100/100/100 | 0 | 360 | 0 | 4 | ✓ 4.9 MB | — | — | — | ✓ |
| instalacije-rebernik | builder | industrial | 99/100/100/100 | 0 | 360 | 0 | 1 | ✓ 0.9 MB | — | — | — | ✓ |
| kmetija-grabnar | tourist-farm | markacija | 94/100/100/100 | 0 | 360 | 0 | 3 | ✓ 5.6 MB | — | — | — | ✓ |
| pekarna-kvas | bakery | warm-craft | 96/100/100/100 | 0 | 360 | 0 | 5 | ✓ 2.4 MB | — | — | — | ✓ |
| racunovodstvo-seliskar | accountant | racun | 100/100/100/100 | 0 | 360 | 0 | 0 | ✓ 0.9 MB | — | — | — | ✓ |
| trgovina-oljka-in-sol | shop | etiketa | 97/100/100/100 | 0 | 360 | 0 | 0 | ✓ 3.5 MB | — | — | — | ✓ |
| zobozdravstvo-lebar | dental | nasmeh | 99/100/100/100 | 0 | 360 | 0 | 0 | ✓ 1.7 MB | — | — | — | ✓ |

### avtoservis-mrak

Homepage: hero-type:with-facts › services-cards:compact › steps:horizontal › about:text-only › contact:split-map (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |

### fizioterapija-pregib

Homepage: hero-signature:bend › highlights:figures › services-list:aside › text:narrow › price-list:tags › cta:band › contact-strip:cards (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 98/100/100/100 | 0 | ✓ |  | — |

### frizerstvo-lana

Homepage: hero-signature:mirrors › cta:band › price-list:grouped › team:photo › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### gostilna-zlata-zlica

Homepage: hero-signature:card › price-list:offers › products:plates › image-text:pair › team:photo › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 95/100/100/100 | 0 | ✓ |  | — |

### instalacije-rebernik

Homepage: hero-type:with-facts › services-list:two-column › steps:horizontal › text:two-column › service-area:list › about:text-only › cta:split (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |

### kmetija-grabnar

Homepage: hero-signature:view › price-list:rates › gallery:wall › image-text:image-right › opening-hours:poster › services-list:aside › team:list › contact:call-out (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 94/100/100/100 | 0 | ✓ |  | — |

### pekarna-kvas

Homepage: hero-split:image-left › contact-strip:bar › products:grid › about:image-side › steps:horizontal › opening-hours:compact › contact:split-map (3 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 96/100/100/100 | 0 | ✓ |  | — |

### racunovodstvo-seliskar

Homepage: hero-signature:receipt › highlights:figures › services-list:rows › about:figure › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |

### trgovina-oljka-in-sol

Homepage: hero-signature:label › price-list:tags › text:narrow › image-text:round › opening-hours:photo › contact:call-out (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### zobozdravstvo-lebar

Homepage: hero-signature:disc › opening-hours:week › services-list:aside › team:photo › contact:call-out (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |
