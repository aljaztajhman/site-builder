# Eval report

Mode: **record-missing**, scope: **home**, started 2026-10-15T11:35:23.366Z, wall time 1463.0 s, paid this run €2.500 (replayed answers and cached pictures are free; the € columns below price every call like production).

0 model calls replayed from the recordings, 64 paid and recorded; 0 generated pictures from the cache, 20 made.

## Summary

- Checkpoints passing every automated check: **10/10**
- Scripted edits: 0 pass, 0 fail, 0 manual
- Median generation cost €0.241 (target ≤ €0.300) ✓
- Median generation time 109.0 s (target ≤ 60 s) ✗
- Median time to first preview 53.7 s (first saved version; checks and critique continue after it)
- Median edit cost €0.000 per edit
- Homepages repeating the contact facts (2+ contact blocks): 3/10
- Homepage skeleton similarity across sites: 0.36 (0 = nothing shared, 1 = same section order)
- First screen meets the composition targets: phone 9/10, desktop 10/10 (report-only; table below)
- Slovene copy lint (report only, no model; table below): **1** findings on 1 of 10 sites (dual-we 1); 0 sites mix vi and ti; 0 more echo the client's own text; em dashes 0 (count only)

## First screen

Measured on the rendered homepage before scrolling: photo share · first photo at (screens) · buttons · headline lines · largest empty band (px). Targets: phone photo ≥ 25 % (with photos), ≤ 3 buttons, ≤ 4 lines, band ≤ 96 px; desktop photo ≥ 30 %, ≤ 3 buttons, ≤ 3 lines, band ≤ 160 px.

| Site | Photos | Phone 360×800 | Misses | Desktop 1280×800 | Misses |
|---|---|---|---|---|---|
| atelje-bergant | 0 | 29 % · 0.26 · 1 · 2 · 87 | ✓ | 37 % · 0.15 · 1 · 2 · 142 | ✓ |
| kolesarski-servis-ovinek | 0 | 29 % · 0.09 · 3 · 3 · 48 | ✓ | 38 % · 0.13 · 1 · 3 · 88 | ✓ |
| optika-jasna | 0 | 26 % · 0.59 · 1 · 2 · 109 | empty band 109 px > 96 | 28 % · 0.28 · 0 · 2 · 88 | ✓ |
| pasji-salon-kodra | 0 | 27 % · 0.09 · 2 · 2 · 53 | ✓ | 36 % · 0.13 · 1 · 2 · 100 | ✓ |
| pivovarna-rov | 0 | 85 % · 0.09 · 3 · 2 · 44 | ✓ | 91 % · 0.09 · 1 · 2 · 140 | ✓ |
| plesna-sola-takt | 0 | 29 % · 0.09 · 3 · 2 · 61 | ✓ | 20 % · 0.13 · 1 · 2 · 101 | ✓ |
| sirarna-pr-simnu | 0 | 14 % · 0.81 · 3 · 2 · 73 | ✓ | 27 % · 0.23 · 1 · 2 · 117 | ✓ |
| steklarstvo-vrhovnik | 0 | 29 % · 0.09 · 2 · 2 · 44 | ✓ | 26 % · 0.13 · 1 · 2 · 88 | ✓ |
| urarstvo-tic | 0 | 10 % · 0.85 · 2 · 2 · 71 | ✓ | 25 % · 0.28 · 1 · 2 · 101 | ✓ |
| vinarstvo-pinteric | 0 | 35 % · 0.09 · 3 · 3 · 53 | ✓ | 73 % · 0.13 · 0 · 3 · 128 | ✓ |

## Slovene copy

Deterministic lint (`tools/eval/src/slovene-lint.ts`) over every visible string of the generated site: pages, collections and alt texts; the business's own names, links and brands left out. Report only: no fixture passes or fails on it. A finding whose text is also in the client's own description is *echoed*: listed, not counted. Address counts vi and ti forms over the whole site.

| Site | Strings | Findings | By rule | Address | Echoed | After edits |
|---|---|---|---|---|---|---|
| atelje-bergant | 48 | 1 | dual-we 1 | vi 7 / ti 0 | — | — |
| kolesarski-servis-ovinek | 47 | 0 | — | vi 9 / ti 0 | — | — |
| optika-jasna | 41 | 0 | — | vi 9 / ti 0 | — | — |
| pasji-salon-kodra | 42 | 0 | — | vi 6 / ti 0 | — | — |
| pivovarna-rov | 29 | 0 | — | vi 6 / ti 0 | — | — |
| plesna-sola-takt | 44 | 0 | — | vi 8 / ti 0 | — | — |
| sirarna-pr-simnu | 38 | 0 | — | vi 5 / ti 0 | — | — |
| steklarstvo-vrhovnik | 50 | 0 | — | vi 16 / ti 0 | — | — |
| urarstvo-tic | 52 | 0 | — | vi 11 / ti 0 | — | — |
| vinarstvo-pinteric | 51 | 0 | — | vi 10 / ti 0 | — | — |

| Rule | Findings | Sites | Echoed |
|---|---|---|---|
| english: English word or phrase where Slovene has one | 0 | 0 | 0 |
| ti-form: informal (ti) address; visitors are addressed with vi | 0 | 0 | 0 |
| dual-we: dual with the visitor ("skupaj poiščeva"); with vi it is plural | 1 | 1 | 0 |
| quotes: straight or English quotes; Slovene uses „…“ or »…« | 0 | 0 | 0 |
| decimal-point: decimal point in an amount (4,20 €, not 4.20 €) | 0 | 0 | 0 |
| euro-before: € before the amount (20 €, not €20) | 0 | 0 | 0 |
| unit-space: no space before a unit, € or % (20 €, 5 km, 10 %) | 0 | 0 | 0 |
| range-hyphen: hyphen in a number range (8–16, en dash) | 0 | 0 | 0 |
| spaced-hyphen: spaced hyphen used as a dash (" – ") | 0 | 0 | 0 |
| ellipsis: three dots instead of … | 0 | 0 | 0 |
| em-dash: em dash (repaired in code; count only) | 0 | 0 | 0 |
| space-before-punct: space before punctuation | 0 | 0 | 0 |
| missing-space: no space after punctuation | 0 | 0 | 0 |
| doubled-word: the same word twice in a row | 0 | 0 | 0 |
| tripled-letter: a letter three times in a row | 0 | 0 | 0 |
| roman-artefact: lowercase Roman-numeral artefact (ii, iii, (iv)) | 0 | 0 | 0 |
| english-format: English number format (1st, 8 am/pm) | 0 | 0 | 0 |
| title-case: English Title Case in a heading (Slovene headings are sentence case) | 0 | 0 | 0 |

Findings (up to eight per site; every finding is in `eval/runs/<site>/slovene-lint.json`):

- **atelje-bergant**: dual-we „skupaj določiva“ in „Pri prenovi ohranim značaj starih domačij. Najprej si ogleda…“ (`/pages/0/sections/3/props/paragraphs/0`)

## Sites

Lighthouse thresholds: performance ≥ 90, accessibility 100, best practices ≥ 95, SEO ≥ 95.

| Site | Type | Direction | LH P/A/BP/SEO | axe | 360 px width | Facts | Placeholders | Export offline | Gen cost | Gen time | First preview | Pass |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| atelje-bergant | accountant | clean-swiss | — | 0 | 360 | 0 | 0 | ✓ 2.0 MB | €0.282 | 115.3 s | 54.6 s | ✓ |
| kolesarski-servis-ovinek | shop | bold-local | — | 0 | 360 | 0 | 3 | ✓ 2.4 MB | €0.234 | 95.1 s | 49.7 s | ✓ |
| optika-jasna | dental | nasmeh | — | 0 | 360 | 0 | 4 | ✓ 1.5 MB | €0.259 | 101.0 s | 58.8 s | ✓ |
| pasji-salon-kodra | hairdresser | warm-craft | — | 0 | 360 | 0 | 4 | ✓ 2.0 MB | €0.243 | 136.7 s | 51.7 s | ✓ |
| pivovarna-rov | restaurant | jedilnik | — | 0 | 360 | 0 | 3 | ✓ 2.0 MB | €0.278 | 117.7 s | 72.3 s | ✓ |
| plesna-sola-takt | physio | playful-modern | — | 0 | 360 | 0 | 4 | ✓ 1.7 MB | €0.237 | 118.2 s | 43.6 s | ✓ |
| sirarna-pr-simnu | bakery | etiketa | — | 0 | 360 | 0 | 3 | ✓ 2.1 MB | €0.260 | 108.5 s | 61.5 s | ✓ |
| steklarstvo-vrhovnik | builder | bold-local | — | 0 | 360 | 0 | 3 | ✓ 2.1 MB | €0.238 | 109.5 s | 54.8 s | ✓ |
| urarstvo-tic | shop | etiketa | — | 0 | 360 | 0 | 4 | ✓ 2.0 MB | €0.236 | 98.1 s | 52.8 s | ✓ |
| vinarstvo-pinteric | tourist-farm | alpine-nature | — | 0 | 360 | 0 | 5 | ✓ 2.0 MB | €0.233 | 101.4 s | 52.2 s | ✓ |

### atelje-bergant

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 828 | 18 | 0 | 0 | 0.0008 | 1.9 s |
| brief | 1 | 5052 | 1600 | 0 | 0 | 0.0224 | 11.1 s |
| design | 1 | 8793 | 204 | 0 | 0 | 0.0169 | 3.3 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 39.4 s |
| content | 1 | 2691 | 1625 | 0 | 21583 | 0.0650 | 10.7 s |
| critique | 2 | 14948 | 440 | 42665 | 1819 | 0.0407 | 6.0 s |
| **total** | | | | | | **0.2817** | |

Stage wall times: classify 1.9 s, images 1.9 s, brief 11.5 s, design 3.3 s, imageGen 26.9 s, content 10.9 s, check 54.2 s, critique 6.4 s.

Homepage: hero-split:image-right › contact-strip:bar › services-list:rows › image-text:image-left › steps:horizontal › cta:split (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | — | 0 | ✓ |  | — |

### kolesarski-servis-ovinek

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 750 | 18 | 0 | 0 | 0.0007 | 1.6 s |
| brief | 1 | 4940 | 1412 | 0 | 0 | 0.0206 | 9.2 s |
| design | 1 | 8759 | 211 | 0 | 0 | 0.0169 | 3.1 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 40.9 s |
| content | 1 | 2481 | 1346 | 21583 | 0 | 0.0196 | 10.4 s |
| critique | 2 | 14482 | 898 | 44484 | 0 | 0.0403 | 9.2 s |
| **total** | | | | | | **0.2339** | |

Stage wall times: classify 1.6 s, images 1.7 s, brief 9.8 s, design 3.7 s, imageGen 27.7 s, content 10.5 s, check 36.0 s, critique 9.4 s.

Homepage: hero-split:image-right › price-list:tags › contact-strip:bar › services-cards:compact › image-text:image-left › steps:horizontal › cta:band (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | — | 0 | ✓ |  | — |

### optika-jasna

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 766 | 18 | 0 | 0 | 0.0007 | 1.5 s |
| brief | 1 | 4942 | 1740 | 0 | 0 | 0.0235 | 10.1 s |
| design | 1 | 8780 | 202 | 0 | 0 | 0.0168 | 2.9 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 43.4 s |
| content | 2 | 7751 | 2846 | 43166 | 0 | 0.0452 | 17.1 s |
| critique | 2 | 14527 | 506 | 44484 | 0 | 0.0370 | 7.8 s |
| **total** | | | | | | **0.2591** | |

Stage wall times: classify 1.5 s, images 1.5 s, brief 10.6 s, design 2.9 s, imageGen 29.6 s, content 17.2 s, check 34.1 s, critique 8.0 s.

Homepage: hero-signature:disc › opening-hours:week › services-list:aside › team:list › contact:call-out (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | — | 0 | ✓ |  | — |

### pasji-salon-kodra

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 785 | 18 | 0 | 0 | 0.0008 | 1.8 s |
| brief | 1 | 4971 | 1362 | 0 | 0 | 0.0203 | 9.9 s |
| design | 1 | 8740 | 211 | 0 | 0 | 0.0168 | 3.6 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 40.2 s |
| content | 1 | 2455 | 1256 | 21583 | 0 | 0.0187 | 10.3 s |
| critique | 2 | 13896 | 2231 | 44484 | 0 | 0.0507 | 21.3 s |
| **total** | | | | | | **0.2431** | |

Stage wall times: classify 1.8 s, images 1.8 s, brief 10.3 s, design 3.6 s, imageGen 29.3 s, content 10.4 s, check 62.8 s, critique 21.8 s.

Homepage: hero-split:image-left › price-list:tags › highlights:list › text:two-column › opening-hours:compact › cta:band (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | — | 0 | ✓ |  | — |

### pivovarna-rov

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 798 | 18 | 0 | 0 | 0.0008 | 1.6 s |
| brief | 1 | 4992 | 1753 | 0 | 0 | 0.0237 | 13.1 s |
| design | 1 | 8777 | 222 | 0 | 0 | 0.0170 | 3.6 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 47.3 s |
| content | 3 | 13278 | 3729 | 64749 | 0 | 0.0660 | 24.1 s |
| critique | 2 | 12747 | 553 | 44484 | 0 | 0.0343 | 8.9 s |
| **total** | | | | | | **0.2776** | |

Stage wall times: classify 1.6 s, images 1.6 s, brief 13.5 s, design 3.6 s, imageGen 33.0 s, content 24.2 s, check 36.1 s, critique 9.2 s.

Homepage: hero-signature:card › opening-hours:week › image-text:image-right › contact:call-out (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | — | 0 | ✓ |  | — |

### plesna-sola-takt

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 792 | 15 | 0 | 0 | 0.0007 | 1.6 s |
| brief | 1 | 4980 | 1335 | 0 | 0 | 0.0200 | 8.8 s |
| design | 1 | 8765 | 187 | 0 | 0 | 0.0167 | 2.5 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 38.9 s |
| content | 1 | 2389 | 1192 | 21583 | 0 | 0.0181 | 7.6 s |
| critique | 2 | 13732 | 1655 | 44484 | 0 | 0.0455 | 16.4 s |
| **total** | | | | | | **0.2369** | |

Stage wall times: classify 1.7 s, images 1.7 s, brief 9.1 s, design 2.5 s, imageGen 25.2 s, content 7.6 s, check 57.9 s, critique 16.7 s.

Homepage: hero-split:image-right › price-list:table › image-text:image-left › highlights:list › cta:split (0 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | — | 0 | ✓ |  | — |

### sirarna-pr-simnu

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 792 | 18 | 0 | 0 | 0.0008 | 1.8 s |
| brief | 1 | 5003 | 1746 | 0 | 0 | 0.0236 | 10.7 s |
| design | 1 | 8810 | 193 | 0 | 0 | 0.0168 | 2.6 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 50.5 s |
| content | 2 | 8018 | 2772 | 43166 | 0 | 0.0451 | 17.2 s |
| critique | 2 | 14268 | 704 | 44484 | 0 | 0.0382 | 10.1 s |
| **total** | | | | | | **0.2603** | |

Stage wall times: classify 1.8 s, images 1.8 s, brief 11.0 s, design 2.6 s, imageGen 31.3 s, content 17.3 s, check 36.6 s, critique 10.3 s.

Homepage: hero-signature:label › text:narrow › opening-hours:table › image-text:round › price-list:tags › contact:call-out (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | — | 0 | ✓ |  | — |

### steklarstvo-vrhovnik

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 759 | 18 | 0 | 0 | 0.0007 | 1.6 s |
| brief | 1 | 4962 | 1579 | 0 | 0 | 0.0221 | 10.5 s |
| design | 1 | 8830 | 193 | 0 | 0 | 0.0168 | 2.7 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 42.9 s |
| content | 1 | 2680 | 1532 | 21583 | 0 | 0.0215 | 11.1 s |
| critique | 2 | 15116 | 842 | 44484 | 0 | 0.0409 | 8.4 s |
| **total** | | | | | | **0.2379** | |

Stage wall times: classify 1.6 s, images 1.6 s, brief 10.9 s, design 2.8 s, imageGen 28.4 s, content 11.1 s, check 46.2 s, critique 8.6 s.

Homepage: hero-split:image-right › opening-hours:week › services-list:two-column › image-text:image-left › service-area:inline › cta:band (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | — | 0 | ✓ |  | — |

### urarstvo-tic

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 782 | 18 | 0 | 0 | 0.0008 | 1.7 s |
| brief | 1 | 4950 | 1578 | 0 | 0 | 0.0221 | 10.4 s |
| design | 1 | 8770 | 230 | 0 | 0 | 0.0171 | 4.5 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 43.1 s |
| content | 1 | 2986 | 1601 | 21583 | 0 | 0.0226 | 11.4 s |
| critique | 2 | 15312 | 445 | 44484 | 0 | 0.0378 | 6.7 s |
| **total** | | | | | | **0.2361** | |

Stage wall times: classify 1.7 s, images 1.7 s, brief 11.1 s, design 4.5 s, imageGen 28.6 s, content 11.4 s, check 38.5 s, critique 6.9 s.

Homepage: hero-signature:label › about:figure › image-text:round › services-list:rows › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | — | 0 | ✓ |  | — |

### vinarstvo-pinteric

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 788 | 20 | 0 | 0 | 0.0008 | 1.4 s |
| brief | 1 | 5000 | 1424 | 0 | 0 | 0.0208 | 9.3 s |
| design | 1 | 8655 | 222 | 0 | 0 | 0.0168 | 3.1 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 49.4 s |
| content | 1 | 2515 | 1434 | 21583 | 0 | 0.0204 | 9.7 s |
| critique | 2 | 14592 | 712 | 44484 | 0 | 0.0389 | 11.3 s |
| **total** | | | | | | **0.2335** | |

Stage wall times: classify 1.4 s, images 1.5 s, brief 9.6 s, design 3.1 s, imageGen 31.4 s, content 9.7 s, check 37.5 s, critique 11.6 s.

Homepage: hero-image:overlay-bottom › about:figure › services-list:rows › image-text:image-left › opening-hours:compact › cta:band (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | — | 0 | ✓ |  | — |
