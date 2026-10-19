# Eval report

Mode: **record-missing**, scope: **home**, started 2026-10-19T13:17:35.991Z, wall time 2856.1 s, paid this run €1.645 (replayed answers and cached pictures are free; the € columns below price every call like production).

0 model calls replayed from the recordings, 59 paid and recorded; 0 generated pictures from the cache, 10 made.

## Summary

- Checkpoints passing every automated check: **10/10**
- Scripted edits: 0 pass, 0 fail, 0 manual
- Median generation cost €0.149 (target ≤ €0.300) ✓
- Median generation time 93.6 s (target ≤ 60 s) ✗
- Median time to first preview 40.6 s (first saved version; checks and critique continue after it)
- Median edit cost €0.000 per edit
- Homepages repeating the contact facts (2+ contact blocks): 2/10
- Homepage skeleton similarity across sites: 0.37 (0 = nothing shared, 1 = same section order)
- First screen meets the composition targets: phone 8/10, desktop 7/10 (report-only; table below)
- Vision judge (1–5, 3 = ordinary small-business site): phone median 3.4, desktop median 3.3 (10 sites, €0.125)
- Slovene copy lint (report only, no model; table below): **0** findings on 0 of 10 sites; 0 sites mix vi and ti; 0 more echo the client's own text; em dashes 0 (count only)

## Vision judge

Scores: impression / hierarchy / imagery / spacing / clutter / distinctiveness. Review sheets for a human look: `eval/look/<site>.png`.

| Site | Phone | Phone note | Desktop | Desktop note | Top fix |
|---|---|---|---|---|---|
| dimnikarstvo-vidmar | **3.3** (3/4/4/3/3/3) | The first screen works: the chimney-brush photo is large, the headline fits and Pokličite is obvious, but the header repeats call/directions right above a second "Oglejte si storitve" button, and the gold block with phone and address repeats the same contact details. | **3.3** (3/4/4/2/4/3) | The hero is solid, with a strong brush photo and a bold headline, but the left column leaves a big empty area below the button, the services grid is lopsided with an empty cell, and the stove section floats in large dead bands. | Tighten the desktop vertical rhythm: cut the dead bands around the hero, the services grid and the stove section, and balance the odd fifth service card so the grid has no empty cell. |
| kamp-soska | **3.5** (3/4/4/3/4/3) | The hero photo is strong and the headline fits, but a dead pale band under the hero and an empty white gap before the kitchen photo break the rhythm, and the pattern is still generic. | **3.2** (3/3/4/2/4/3) | The dark headline box overlaps the photo and hangs below it, leaving a clumsy offset, and the lower half of the photo is hidden; the empty map card and sparse list leave large dead areas. | Fix the desktop hero: make the text panel sit fully inside the photo or fully below it, so it no longer overhangs the image edge awkwardly. |
| klavirji-urbanc | **3.5** (3/4/4/3/4/3) | The first screen works well: the piano photo, headline and call button read clearly, but the lower page ends in a thin 'Kje delam' block and a plain footer with scattered contact details. | **3.3** (3/4/4/2/4/3) | The hero pairs the piano photo with the headline, but the page is a plain stack of sections with large empty bands, a barely used 'Kje delam' block and an oversized footer name. | Make the 'Kje delam' section substantial: add a map or a list of towns instead of a lone line, or merge it into the footer. |
| knjigoveznica-kras | **3.7** (4/4/3/3/4/4) | The white framed label card is distinctive and the headline fits, but the arch photo is pushed to the bottom edge and cut off by the call bar, so the strongest image barely shows in the first screen. | **4.0** (4/4/5/3/4/4) | The label card beside a tall arched photo of bound books works well and looks made for a bookbinder; the lower page has a huge headline in the services list and big empty bands around the red circle section. | On phone, shrink the label card padding and move the arch photo up so at least half of it shows above the fixed bar in the first screen. |
| pedikura-nogica | **3.3** (3/3/4/3/4/3) | The first screen is calm and well ordered, with the image, headline and one call button all visible, but the business name is tiny and the lower third is empty, so the page reads as a generic template. | **3.2** (3/3/4/2/4/3) | The split hero is tidy, but the image and text are not aligned to the same height, there is a large dead band under the hero, and the price section is cut off at the fold. | Make the business name and trade (medical pedicure) more prominent in the hero, and put the phone number next to the call button so it reads what, where, how to reach. |
| pralnica-cisto | **3.2** (3/4/4/3/2/3) | The first screen works: the photo, a headline of fitting size and one button are clear, but the services list and the price list below repeat the same items and prices, which makes the page long and redundant. | **3.2** (3/4/4/3/2/3) | The hero is clean with a big photo, but the text block floats in the middle with empty space below it, and the services list and the price list repeat each other. | Merge the services list and the Cenik section into one price list, so each item and price appears only once. |
| servis-aparatov-rebec | **3.3** (3/4/4/3/4/2) | The first screen is clear, with a relevant image, a bold headline and an obvious call bar, but it is a generic image-headline-text stack and shows no location or contact beyond the bar. | **3.0** (3/3/3/3/4/2) | The hero is clean and the image suits the trade, but the black price band below and the empty space under the hero make it a plain template layout with a small image and no call to action beyond a text link. | Make the hero more specific to appliance repair: put the phone number and service area beside the headline, and use a strong primary call button instead of the text link. |
| slascicarna-pri-zofki | **3.8** (4/4/4/3/4/4) | The hero is strong, with a warm dark ground, a bold slab headline and the cream slice in an arch, but the image only starts at the bottom edge and the fixed bar covers part of it; the long text stack pushes the photo down. | **3.8** (4/4/4/3/4/4) | A confident split hero with the big slab headline, an arched photo and an opening-hours badge looks designed for a bakery, but the logo is tiny in a bare white header and the lower pages are text-heavy with a small image. | On phone, tighten the hero text block and gap above the button so more of the arched cake photo shows in the first screen above the fixed bar. |
| tapetnistvo-lesjak | **4.0** (4/4/4/4/4/4) | The first screen works well: a real workshop photo of the stripped armchair, a clear headline and one button. The page then loses momentum, with a plain text list of services and a footer that repeats the phone number. | **3.8** (4/4/4/3/4/4) | The hero is strong, with a large photo of the armchair beside the headline and one button. The lower half is plain, with a thin services list, a lot of empty space beside the short text in the last photo section, and no contact details visible beyond the header. | On desktop, reduce the empty bands around the short text blocks next to the tall photos, or crop the photos to a landscape shape so the sections are tighter. |
| zeliscarna-pri-lipi | **3.2** (3/4/2/3/4/3) | The first screen is a big white label card with only a clip-art sprig, and the real shelf photo is barely visible as a cropped sliver behind the call bar, so the photography is pushed below the fold. | **3.8** (4/4/4/3/4/4) | The etiketa label card and arched shelf photo work well together in the first screen, but the hours block leaves a wide empty right side and the product cards are plain icon-and-price boxes with no photos. | On phone, put the shelf photo at the top of the first screen, or make the label card shorter, so the real products are visible before scrolling. |

## First screen

Measured on the rendered homepage before scrolling: photo share · first photo at (screens) · buttons · headline lines · largest empty band (px). Targets: phone photo ≥ 25 % (with photos), ≤ 3 buttons, ≤ 4 lines, band ≤ 96 px; desktop photo ≥ 30 %, ≤ 3 buttons, ≤ 3 lines, band ≤ 160 px.

| Site | Photos | Phone 360×800 | Misses | Desktop 1280×800 | Misses |
|---|---|---|---|---|---|
| dimnikarstvo-vidmar | 0 | 29 % · 0.17 · 2 · 3 · 58 | ✓ | 38 % · 0.13 · 2 · 3 · 88 | ✓ |
| kamp-soska | 3 | 35 % · 0.09 · 3 · 3 · 72 | ✓ | 62 % · 0.13 · 1 · 3 · 128 | ✓ |
| klavirji-urbanc | 0 | 28 % · 0.19 · 2 · 2 · 61 | ✓ | 20 % · 0.16 · 2 · 2 · 137 | ✓ |
| knjigoveznica-kras | 3 | 17 % · 0.76 · 2 · 2 · 68 | photo 17 % < 25 % | 27 % · 0.18 · 1 · 2 · 112 | photo 27 % < 30 % |
| pedikura-nogica | 0 | 29 % · 0.19 · 2 · 2 · 56 | ✓ | 20 % · 0.16 · 2 · 2 · 112 | ✓ |
| pralnica-cisto | 0 | 29 % · 0.25 · 1 · 2 · 71 | ✓ | 37 % · 0.15 · 1 · 2 · 142 | ✓ |
| servis-aparatov-rebec | 0 | 29 % · 0.09 · 3 · 3 · 48 | ✓ | 20 % · 0.13 · 1 · 3 · 88 | ✓ |
| slascicarna-pri-zofki | 3 | 28 % · 0.56 · 3 · 3 · 77 | ✓ | 28 % · 0.12 · 1 · 3 · 148 | photo 28 % < 30 % |
| tapetnistvo-lesjak | 3 | 28 % · 0.19 · 1 · 2 · 53 | ✓ | 36 % · 0.15 · 1 · 2 · 100 | ✓ |
| zeliscarna-pri-lipi | 3 | 14 % · 0.80 · 3 · 3 · 68 | photo 14 % < 25 % | 26 % · 0.31 · 1 · 3 · 99 | photo 26 % < 30 % |

## Slovene copy

Deterministic lint (`tools/eval/src/slovene-lint.ts`) over every visible string of the generated site: pages, collections and alt texts; the business's own names, links and brands left out. Report only: no fixture passes or fails on it. A finding whose text is also in the client's own description is *echoed*: listed, not counted. Address counts vi and ti forms over the whole site.

| Site | Strings | Findings | By rule | Address | Echoed | After edits |
|---|---|---|---|---|---|---|
| dimnikarstvo-vidmar | 44 | 0 | — | vi 6 / ti 0 | — | — |
| kamp-soska | 52 | 0 | — | vi 6 / ti 0 | — | — |
| klavirji-urbanc | 38 | 0 | — | vi 6 / ti 0 | — | — |
| knjigoveznica-kras | 58 | 0 | — | vi 8 / ti 0 | — | — |
| pedikura-nogica | 38 | 0 | — | vi 6 / ti 0 | — | — |
| pralnica-cisto | 54 | 0 | — | vi 4 / ti 0 | — | — |
| servis-aparatov-rebec | 48 | 0 | — | vi 13 / ti 0 | — | — |
| slascicarna-pri-zofki | 43 | 0 | — | vi 5 / ti 0 | — | — |
| tapetnistvo-lesjak | 47 | 0 | — | vi 6 / ti 0 | — | — |
| zeliscarna-pri-lipi | 32 | 0 | — | vi 6 / ti 0 | — | — |

| Rule | Findings | Sites | Echoed |
|---|---|---|---|
| english: English word or phrase where Slovene has one | 0 | 0 | 0 |
| ti-form: informal (ti) address; visitors are addressed with vi | 0 | 0 | 0 |
| dual-we: dual with the visitor ("skupaj poiščeva"); with vi it is plural | 0 | 0 | 0 |
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

## Sites

Lighthouse thresholds: performance ≥ 90, accessibility 100, best practices ≥ 95, SEO ≥ 95.

| Site | Type | Direction | LH P/A/BP/SEO | axe | 360 px width | Facts | Placeholders | Export offline | Gen cost | Gen time | First preview | Pass |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dimnikarstvo-vidmar | builder | bold-local | 98/100/100/100 | 0 | 360 | 0 | 1 | ✓ 2.3 MB | €0.246 | 118.2 s | 60.7 s | ✓ |
| kamp-soska | tourist-farm | alpine-nature | 94/100/100/100 | 0 | 360 | 0 | 4 | ✓ 3.5 MB | €0.088 | 82.1 s | 32.5 s | ✓ |
| klavirji-urbanc | shop | warm-craft | 96/100/100/100 | 0 | 360 | 0 | 5 | ✓ 1.9 MB | €0.203 | 94.6 s | 46.2 s | ✓ |
| knjigoveznica-kras | shop | etiketa | 97/100/100/100 | 0 | 360 | 0 | 1 | ✓ 2.4 MB | €0.094 | 92.6 s | 35.0 s | ✓ |
| pedikura-nogica | hairdresser | soft-studio | 98/100/100/100 | 0 | 360 | 0 | 3 | ✓ 1.7 MB | €0.206 | 98.0 s | 47.4 s | ✓ |
| pralnica-cisto | shop | clean-swiss | 97/100/100/100 | 0 | 360 | 0 | 6 | ✓ 1.7 MB | €0.221 | 108.6 s | 49.2 s | ✓ |
| servis-aparatov-rebec | builder | bold-local | 98/100/100/100 | 0 | 360 | 0 | 3 | ✓ 1.9 MB | €0.211 | 99.0 s | 46.9 s | ✓ |
| slascicarna-pri-zofki | bakery | skorja | 97/100/100/100 | 0 | 360 | 0 | 3 | ✓ 2.3 MB | €0.082 | 70.0 s | 24.1 s | ✓ |
| tapetnistvo-lesjak | builder | warm-craft | 95/100/100/100 | 0 | 360 | 0 | 3 | ✓ 2.5 MB | €0.090 | 74.3 s | 26.8 s | ✓ |
| zeliscarna-pri-lipi | shop | etiketa | 95/100/100/100 | 0 | 360 | 0 | 3 | ✓ 2.7 MB | €0.079 | 79.6 s | 33.5 s | ✓ |

### dimnikarstvo-vidmar

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 1008 | 21 | 0 | 0 | 0.0010 | 2.5 s |
| brief | 1 | 4280 | 1391 | 0 | 0 | 0.0193 | 9.5 s |
| design | 1 | 8785 | 197 | 0 | 0 | 0.0168 | 5.0 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 44.5 s |
| content | 2 | 6272 | 1288 | 12416 | 12416 | 0.0507 | 14.3 s |
| critique | 1 | 7185 | 230 | 10687 | 2690 | 0.0220 | 7.2 s |
| **total** | | | | | | **0.2455** | |

Stage wall times: classify 2.5 s, images 2.6 s, brief 9.9 s, design 5.0 s, imageGen 28.2 s, content 15.0 s, check 50.1 s, critique 7.3 s.

Homepage: hero-split:image-right › contact-strip:bar › services-cards:compact › image-text:image-left › steps:horizontal › service-area:inline (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 98/100/100/100 | 0 | ✓ |  | — |

### kamp-soska

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 983 | 27 | 0 | 0 | 0.0010 | 1.4 s |
| brief | 1 | 4215 | 1255 | 0 | 0 | 0.0180 | 8.5 s |
| design | 1 | 8637 | 190 | 0 | 0 | 0.0165 | 3.7 s |
| altText | 1 | 2743 | 277 | 0 | 0 | 0.0071 | 5.8 s |
| content | 2 | 6033 | 1358 | 24832 | 0 | 0.0263 | 11.4 s |
| critique | 1 | 7425 | 454 | 13377 | 0 | 0.0190 | 7.3 s |
| **total** | | | | | | **0.0879** | |

Stage wall times: classify 1.4 s, brief 8.9 s, design 3.7 s, images 20.5 s, content 12.0 s, check 42.2 s, critique 7.4 s.

Homepage: hero-image:overlay-bottom › highlights:columns › image-text:image-left › price-list:table › contact:split-map (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 94/100/100/100 | 0 | ✓ |  | — |

### klavirji-urbanc

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 963 | 21 | 0 | 0 | 0.0009 | 0.9 s |
| brief | 1 | 4225 | 1221 | 0 | 0 | 0.0178 | 8.8 s |
| design | 1 | 8720 | 195 | 0 | 0 | 0.0167 | 2.7 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 36.6 s |
| content | 1 | 2327 | 1167 | 12416 | 0 | 0.0162 | 9.2 s |
| critique | 1 | 6746 | 259 | 13377 | 0 | 0.0161 | 5.0 s |
| **total** | | | | | | **0.2035** | |

Stage wall times: classify 0.9 s, images 0.9 s, brief 9.2 s, design 2.7 s, imageGen 23.4 s, content 9.9 s, check 43.3 s, critique 5.1 s.

Homepage: hero-split:image-left › services-list:rows › image-text:image-right › service-area:inline (0 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 96/100/100/100 | 0 | ✓ |  | — |

### knjigoveznica-kras

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 1041 | 21 | 0 | 0 | 0.0010 | 1.0 s |
| brief | 1 | 4290 | 1345 | 0 | 0 | 0.0189 | 8.9 s |
| design | 1 | 8756 | 202 | 0 | 0 | 0.0168 | 4.3 s |
| altText | 1 | 2819 | 318 | 0 | 0 | 0.0076 | 4.0 s |
| content | 1 | 2805 | 2600 | 12416 | 0 | 0.0293 | 18.3 s |
| critique | 1 | 8880 | 380 | 13377 | 0 | 0.0208 | 6.2 s |
| **total** | | | | | | **0.0945** | |

Stage wall times: classify 1.0 s, brief 9.3 s, design 4.3 s, images 16.2 s, content 18.8 s, check 51.2 s, critique 6.4 s.

Homepage: hero-signature:label › opening-hours:week › about:image-side › image-text:round › services-list:rows › highlights:list › contact:stacked (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### pedikura-nogica

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 1020 | 22 | 0 | 0 | 0.0010 | 1.2 s |
| brief | 1 | 4276 | 1531 | 0 | 0 | 0.0205 | 10.7 s |
| design | 1 | 8745 | 205 | 0 | 0 | 0.0168 | 3.9 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 38.6 s |
| content | 1 | 2614 | 1120 | 12416 | 0 | 0.0163 | 7.5 s |
| critique | 1 | 6906 | 145 | 13377 | 0 | 0.0154 | 3.9 s |
| **total** | | | | | | **0.2058** | |

Stage wall times: classify 1.2 s, images 1.2 s, brief 11.1 s, design 3.9 s, imageGen 26.2 s, content 8.9 s, check 46.5 s, critique 4.0 s.

Homepage: hero-split:image-left › price-list:tags › image-text:image-right › highlights:list › opening-hours:table (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 98/100/100/100 | 0 | ✓ |  | — |

### pralnica-cisto

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 983 | 21 | 0 | 0 | 0.0009 | 1.1 s |
| brief | 1 | 4213 | 1367 | 0 | 0 | 0.0190 | 9.7 s |
| design | 1 | 8713 | 228 | 0 | 0 | 0.0169 | 3.4 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 38.0 s |
| content | 2 | 6692 | 1717 | 24832 | 0 | 0.0305 | 11.6 s |
| critique | 1 | 8129 | 222 | 13377 | 0 | 0.0182 | 3.9 s |
| **total** | | | | | | **0.2214** | |

Stage wall times: classify 1.1 s, images 1.1 s, brief 10.0 s, design 3.5 s, imageGen 25.5 s, content 12.5 s, check 55.3 s, critique 4.0 s.

Homepage: hero-split:image-right › services-list:rows › image-text:image-left › price-list:table › opening-hours:table (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### servis-aparatov-rebec

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 1040 | 23 | 0 | 0 | 0.0010 | 1.1 s |
| brief | 1 | 4292 | 1629 | 0 | 0 | 0.0214 | 10.9 s |
| design | 1 | 8722 | 192 | 0 | 0 | 0.0167 | 2.3 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 38.8 s |
| content | 1 | 2725 | 1348 | 12416 | 0 | 0.0184 | 8.6 s |
| critique | 1 | 7320 | 383 | 13377 | 0 | 0.0182 | 5.5 s |
| **total** | | | | | | **0.2114** | |

Stage wall times: classify 1.1 s, images 1.1 s, brief 11.3 s, design 2.3 s, imageGen 25.2 s, content 9.3 s, check 46.4 s, critique 5.6 s.

Homepage: hero-split:image-right › price-list:tags › contact-strip:bar › services-list:rows › steps:horizontal › image-text:image-left › service-area:inline (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 98/100/100/100 | 0 | ✓ |  | — |

### slascicarna-pri-zofki

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 1031 | 22 | 0 | 0 | 0.0010 | 1.3 s |
| brief | 1 | 4270 | 1562 | 0 | 0 | 0.0208 | 9.9 s |
| altText | 1 | 2800 | 264 | 0 | 0 | 0.0071 | 4.1 s |
| design | 1 | 8847 | 197 | 0 | 0 | 0.0169 | 3.5 s |
| content | 1 | 2905 | 1345 | 12416 | 0 | 0.0187 | 8.0 s |
| critique | 1 | 7569 | 207 | 13377 | 0 | 0.0171 | 3.8 s |
| **total** | | | | | | **0.0816** | |

Stage wall times: classify 1.3 s, brief 10.3 s, images 14.9 s, design 3.5 s, content 8.6 s, check 41.9 s, critique 4.0 s.

Homepage: hero-signature:arch › about:text-only › image-text:image-left › services-list:rows › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### tapetnistvo-lesjak

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 1026 | 25 | 0 | 0 | 0.0010 | 1.0 s |
| brief | 1 | 4289 | 1358 | 0 | 0 | 0.0191 | 8.2 s |
| design | 1 | 8790 | 208 | 0 | 0 | 0.0169 | 2.6 s |
| altText | 1 | 2807 | 296 | 0 | 0 | 0.0074 | 4.1 s |
| content | 2 | 6486 | 1483 | 24832 | 0 | 0.0282 | 12.0 s |
| critique | 1 | 7312 | 323 | 13377 | 0 | 0.0177 | 4.8 s |
| **total** | | | | | | **0.0902** | |

Stage wall times: classify 1.0 s, brief 8.6 s, design 2.6 s, images 14.4 s, content 12.4 s, check 42.6 s, critique 4.9 s.

Homepage: hero-split:image-left › price-list:tags › services-list:rows › image-text:image-left › image-text:image-right › opening-hours:compact (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 95/100/100/100 | 0 | ✓ |  | — |

### zeliscarna-pri-lipi

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 1023 | 25 | 0 | 0 | 0.0010 | 1.2 s |
| brief | 1 | 4271 | 1405 | 0 | 0 | 0.0194 | 16.0 s |
| altText | 1 | 2799 | 275 | 0 | 0 | 0.0072 | 7.5 s |
| design | 1 | 8858 | 182 | 0 | 0 | 0.0168 | 2.5 s |
| content | 1 | 2849 | 1123 | 12416 | 0 | 0.0167 | 12.9 s |
| critique | 1 | 7190 | 353 | 13377 | 0 | 0.0177 | 4.2 s |
| **total** | | | | | | **0.0788** | |

Stage wall times: classify 1.2 s, brief 16.3 s, images 18.1 s, design 2.5 s, content 13.4 s, check 41.8 s, critique 4.3 s.

Homepage: hero-signature:label › opening-hours:photo › image-text:round › price-list:tags › contact:call-out (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 95/100/100/100 | 0 | ✓ |  | — |
