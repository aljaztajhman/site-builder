# Eval report

Mode: **record-missing**, scope: **home**, started 2026-10-08T07:45:16.328Z, wall time 7030.3 s, paid this run €3.304 (replayed answers and cached pictures are free; the € columns below price every call like production).

34 model calls replayed from the recordings, 160 paid and recorded; 0 generated pictures from the cache, 2 made.

## Summary

- Checkpoints passing every automated check: **6/17**
- Scripted edits: 0 pass, 0 fail, 0 manual
- Median generation cost €0.132 (target ≤ €0.300) ✓
- Median generation time 139.7 s (target ≤ 60 s) ✗
- Median time to first preview 26.3 s (first saved version; checks and critique continue after it)
- Median edit cost €0.000 per edit
- Homepages repeating the contact facts (2+ contact blocks): 4/17
- Homepage skeleton similarity across sites: 0.41 (0 = nothing shared, 1 = same section order)
- First screen meets the composition targets: phone 15/17, desktop 14/17 (report-only; table below)
- Vision judge (1–5, 3 = ordinary small-business site): phone median 3.2, desktop median 3.3 (17 sites, €0.216)
- Slovene copy lint (report only, no model; table below): **0** findings on 0 of 17 sites; 0 sites mix vi and ti; 0 more echo the client's own text; em dashes 0 (count only)

## Vision judge

Scores: impression / hierarchy / imagery / spacing / clutter / distinctiveness. Review sheets for a human look: `eval/look/<site>.png`.

| Site | Phone | Phone note | Desktop | Desktop note | Top fix |
|---|---|---|---|---|---|
| avtoservis-mrak | **3.5** (3/4/3/4/3/4) | The licence-plate phone number and hazard-stripe divider are specific to the trade, but the hero photo is dark and muddy, and the price plates clip text ("20 € KOM", "40 € SEZO"), which looks broken. | **3.3** (3/3/4/3/3/4) | The oversized centered two-line brand header with a lone "Domov" link eats 280px, pushing the headline over the photo and the Navodila link below the fold; the price plates clip their text. | Shrink the desktop header to a single slim bar with logo left and nav/phone right, so the headline, plate and directions button all fit in the first screen. |
| frizerstvo-lana | **2.7** (3/3/3/2/2/3) | The first screen has a dead band between the weak text-link CTAs and the photos, which are pushed to the bottom edge and collide with the next heading, while the call button is repeated in the header, in the text link and in the contact section. | **3.7** (4/4/4/3/3/4) | The arched photo trio over the giant pink 'Lana' letters feels designed for a salon, but the headline overlaps the watermark and the photos sit unevenly, leaving the left column weak and the CTAs as small underlined links. | On phone, tighten the hero: drop the gap above the photos, place a large arched photo directly under the headline and make one clear primary call button, removing the duplicated text links. |
| gostilna-zlata-zlica | **2.8** (3/3/3/3/2/3) | The hero photo is a tight crop of leaves and trunk that hides the inn itself, and the card with its dead gap above the link covers the lower half of the screen; address and hours are then repeated again in the contact block and footer. | **3.5** (4/4/4/3/3/3) | The hero photo of the inn under the lipa tree is strong, but the card hangs off the bottom of the first screen so its CTAs are cut off, and the prices grid leaves an orphaned fifth item with empty space beside it. | Crop the phone hero to show the house and bench (position the image toward the right), and shorten the card so headline, one clear CTA and the call bar all fit without a dead gap. |
| instalacije-rebernik | **3.2** (3/4/3/3/2/4) | The radiator illustration is cut off at the bottom of the first screen, and "Navodila za pot" appears twice before it; the page still reads as a plain stack of text. | **3.5** (4/4/4/3/2/4) | The first screen is strong, with a big headline, a clear orange call block and a radiator illustration, but the left column is heavy and there is a dead gap below the hero. Address and directions repeat three times further down. | Cut the repetition: keep one "Navodila za pot" link in the hero and merge the dark contact block with the "Obiščite nas" block so the address and phone appear only once. |
| trgovina-oljka-in-sol | **2.8** (3/3/3/3/2/3) | The hero is a photo above a heavy plum block, and its two plain text links look weak and unlike buttons. Contact details then appear three times in the closing block and footer, and the gallery leaves a hole under the first photo. | **3.2** (3/3/4/3/3/3) | The large hero photo with the plum card works well, but the heading and intro text are split across the page (heading left, intro far right), and the gallery has an empty cell and uneven crops. | Make the call link a filled button and directions a secondary one, on phone and desktop alike; drop the duplicated phone, address and hours blocks so contact appears once. |
| avto-kovac | **3.5** (4/3/3/4/3/4) | The headline is large and runs into the first-screen text, while the photo is a dark blurred wash that barely reads as a workshop; the hours strip is cut off at the fold and directions are repeated three times. | **3.8** (4/4/4/3/4/4) | The full-bleed lift photo with the number-plate phone works well, but the heading, plate and notes fill the left side so the photo is cramped, and the huge empty left half beside the 2012 block feels like a dead area. | On phone, shrink the headline, lighten the overlay so the garage photo reads, and let the plate phone number be the one primary action; drop the repeated directions link from the first screen. |
| brivnica-kos | **3.5** (3/4/4/3/4/3) | The first screen is solid (photo, headline, fixed call bar), but the opening-hours bars are heavy, repetitive terracotta slabs, and the yellow '[Vnesite ...]' placeholders in the price list and footer make it look unfinished. | **3.5** (3/4/4/3/4/3) | The hero is clean and the photo is large, but the hours chart and the wide price rows leave the lower page sparse, the closing section's links are weak and tiny, and the giant footer wordmark and yellow placeholders look unfinished. | Remove or fill the yellow '[Vnesite ...]' placeholders (child's haircut price, email, company name, ID numbers) so none show in the price list or footer. |
| cvetlicarna-marjetica | **2.7** (3/3/2/3/2/3) | The framed text card fills the first screen, so the photo is cut off at the bottom behind the call bar and its label is clipped; prices and services then repeat in three sections. | **3.5** (4/4/4/3/3/3) | The first screen is strong: a framed headline card beside an arched photo with a round inset. The weak point is the 'Izbrane cene' cards, which repeat the price list further down. | On phone, shrink the hero card and move the arched photo up so it shows in the first screen, and fix the clipped 'Ustvarjeno z…' label. |
| elektro-zupan | **2.7** (3/3/2/3/2/3) | The sticky header sits mid-page in the full-page capture and the first screen is pushed down by a large empty band. The heading hides the call action as a small underlined text link, and the giant '2006' outweighs the business offer and phone number. | **2.7** (3/3/2/2/3/3) | The hero has a big empty left column under the headline, with a small underlined 'Pokličite nas' as the only action, and then the oversized '2006' takes the first screen instead of the contact route. | Make the phone call the primary action: a solid, large button in the hero and in the bottom bar, and drop the extra underlined links ('Navodila za pot' repeated 3-4 times, repeated address and email). |
| frizerski-salon-mia | **3.0** (3/3/4/3/2/3) | The first screen has a good salon photo but the call action is only a small underlined text link and the opening-hours heading cuts in at the bottom; address, hours and phone repeat several times down the page. | **3.2** (3/3/4/3/3/3) | The salon photo is large and the headline is clear, but the call link is tiny and the left column is half empty, with a dead band under the text and a huge 'Cenik' heading beside a short list. | Make 'Pokličite nas' a real filled button, with a full-width call bar on the phone, so there is one obvious primary action above the fold. |
| gostilna-pri-mostu | **3.2** (3/3/4/3/3/3) | The first screen has a good soup photo and a readable headline, but the call CTA is a weak text link and the fixed bar crowds the content, with 'Kuhamo od leta' clipped behind it. | **3.3** (3/3/4/3/4/3) | The oversized centred wordmark with a single 'Domov' nav item pushes the hero down, and the 'Pokličite nas' link is too weak, so the menu prices and the phone number only show far below. | Make the call action a solid button in the hero, and put the phone number and address near the top so the bar is not needed to find them. |
| gostisce-na-gricu | **3.2** (3/4/4/3/2/3) | The first screen is clear, with a big photo, the green card and a call bar, but the bottom bar overlaps the card edge and the page repeats hours, address and phone across several blocks, with leftover placeholder fields in the footer. | **3.0** (3/3/4/3/2/3) | The oversized logo and lone 'Domov' nav push the hero down, so the headline card is cut off at the fold and the call button is not visible in the first screen. | Shrink the desktop header and fit the photo and headline card with a visible reservation button in the first 800px. |
| karoserija-hribar | **3.2** (3/4/3/3/2/4) | The photo is darkened to near-invisibility behind the headline, and the directions link and address block repeat several times, so the first screen feels cluttered and the hours bar crowds it. | **3.8** (4/4/5/3/3/4) | Strong full-bleed garage photo with the number-plate phone as a clear primary action; the weak spots are the lonely 'Savinjska regija' row beside a huge stacked heading and the large dead white area. | Cut the repeated 'Navodila za pot' links and address/hours blocks (header, hero, orange band, contact, footer) to one each, so the phone number is the only primary action. |
| mizarstvo-lesnik | **2.8** (3/3/2/4/2/3) | The first screen shows a generic misty-valley landscape with an 'Ustvarjeno z UI' badge instead of any furniture or workshop, and two filled brown buttons plus a directions link compete above and below the headline. | **2.8** (3/3/2/3/3/3) | The hero is dominated by a tall AI landscape that says nothing about joinery, while the text column floats small and vertically centred with big dead space beneath it. | Replace the landscape hero with a wood or furniture image (the timber stack is already stronger), or make the hero deliberately typographic. Remove the AI badge from the first screen. |
| pizzeria-oljka | **3.2** (3/4/3/3/3/3) | The oven photo is pushed right and cropped, and the orange "Vsak da…" badge is cut off behind it; the bottom bar duplicates the call and directions actions already in the header and hero. | **3.5** (3/4/4/3/4/3) | The hero is strong, but the badge is hidden behind the photo and the menu, hours and dough sections leave a lot of empty white on the right. | Fully show the round badge (opening hours) on top of the photo, or remove it, and make the hero photo full width on phone so the fire reads well. |
| salon-tina | **3.2** (3/3/4/3/3/3) | The first screen is a header with the phone number, directions and menu, then a strong bridal photo; the call action is a weak underlined text link and the page ends in a dead band. | **3.3** (3/3/4/3/4/3) | The hero photo is large and fits the trade, but the 'Pokličite me' action is a tiny underlined link, the text block floats mid-column, and the page below is plain stacked sections with empty areas beside the text. | Make the call a real filled button (phone number on it) in the hero on both viewports, and drop the duplicate phone and directions links from the header and contact block. |
| vulkanizer-zorman | **3.0** (3/4/2/3/3/3) | The first screen is all text with two weak underlined links, so the phone number, the key action for a tyre shop, is not prominent, and the page is a long column of text blocks with no visual anchor. | **2.8** (3/3/2/2/4/3) | The headline sits top-left with an empty left column beside the intro text, leaving a dead white band, and the first screen has no image, tyre or number plate motif to show what the business does. | Make the phone number the primary action: a full-width solid call button on phone, and the number shown large in the hero on desktop; turn 'Kako do nas' into a secondary button. |

## First screen

Measured on the rendered homepage before scrolling: photo share · first photo at (screens) · buttons · headline lines · largest empty band (px). Targets: phone photo ≥ 25 % (with photos), ≤ 3 buttons, ≤ 4 lines, band ≤ 96 px; desktop photo ≥ 30 %, ≤ 3 buttons, ≤ 3 lines, band ≤ 160 px.

| Site | Photos | Phone 360×800 | Misses | Desktop 1280×800 | Misses |
|---|---|---|---|---|---|
| avtoservis-mrak | 3 | 92 % · 0.09 · 0 · 3 · 60 | ✓ | 66 % · 0.35 · 0 · 2 · 88 | ✓ |
| frizerstvo-lana | 5 | 21 % · 0.57 · 2 · 1 · 52 | photo 21 % < 25 % | 21 % · 0.16 · 2 · 2 · 88 | photo 21 % < 30 % |
| gostilna-zlata-zlica | 8 | 83 % · 0.09 · 2 · 3 · 44 | ✓ | 91 % · 0.09 · 1 · 3 · 140 | ✓ |
| instalacije-rebernik | 0 | 0 % · — · 0 · 3 · 109 | empty band 109 px > 96 | 0 % · — · 0 · 3 · 142 | ✓ |
| trgovina-oljka-in-sol | 5 | 30 % · 0.09 · 1 · 2 · 72 | ✓ | 66 % · 0.13 · 1 · 2 · 98 | ✓ |
| avto-kovac | 2 | 85 % · 0.16 · 0 · 4 · 50 | ✓ | 91 % · 0.09 · 0 · 3 · 88 | ✓ |
| brivnica-kos | 0 | 27 % · 0.09 · 2 · 3 · 68 | ✓ | 29 % · 0.13 · 1 · 3 · 100 | ✓ |
| cvetlicarna-marjetica | 0 | 18 % · 0.76 · 3 · 2 · 94 | ✓ | 26 % · 0.31 · 1 · 3 · 149 | ✓ |
| elektro-zupan | 0 | 0 % · — · 1 · 2 · 55 | ✓ | 0 % · — · 1 · 2 · 113 | ✓ |
| frizerski-salon-mia | 3 | 29 % · 0.18 · 1 · 2 · 45 | ✓ | 37 % · 0.15 · 1 · 2 · 88 | ✓ |
| gostilna-pri-mostu | 3 | 29 % · 0.11 · 3 · 2 · 44 | ✓ | 25 % · 0.27 · 1 · 2 · 88 | photo 25 % < 30 % |
| gostisce-na-gricu | 3 | 29 % · 0.11 · 3 · 3 · 71 | ✓ | 69 % · 0.27 · 0 · 2 · 182 | empty band 182 px > 160 |
| karoserija-hribar | 1 | 86 % · 0.14 · 0 · 3 · 60 | ✓ | 93 % · 0.07 · 0 · 3 · 88 | ✓ |
| mizarstvo-lesnik | 0 | 28 % · 0.17 · 2 · 3 · 53 | ✓ | 36 % · 0.13 · 2 · 2 · 100 | ✓ |
| pizzeria-oljka | 0 | 32 % · 0.51 · 3 · 3 · 44 | ✓ | 28 % · 0.14 · 1 · 2 · 100 | ✓ |
| salon-tina | 2 | 28 % · 0.19 · 1 · 2 · 61 | ✓ | 36 % · 0.16 · 1 · 2 · 112 | ✓ |
| vulkanizer-zorman | 0 | 0 % · — · 1 · 2 · 65 | ✓ | 0 % · — · 1 · 2 · 108 | ✓ |

## Slovene copy

Deterministic lint (`tools/eval/src/slovene-lint.ts`) over every visible string of the generated site: pages, collections and alt texts; the business's own names, links and brands left out. Report only: no fixture passes or fails on it. A finding whose text is also in the client's own description is *echoed*: listed, not counted. Address counts vi and ti forms over the whole site.

| Site | Strings | Findings | By rule | Address | Echoed | After edits |
|---|---|---|---|---|---|---|
| avtoservis-mrak | 59 | 0 | — | vi 8 / ti 0 | — | — |
| frizerstvo-lana | 47 | 0 | — | vi 10 / ti 0 | — | — |
| gostilna-zlata-zlica | 52 | 0 | — | vi 8 / ti 0 | — | — |
| instalacije-rebernik | 40 | 0 | — | vi 10 / ti 0 | — | — |
| trgovina-oljka-in-sol | 36 | 0 | — | vi 7 / ti 0 | — | — |
| avto-kovac | 50 | 0 | — | vi 13 / ti 0 | — | — |
| brivnica-kos | 46 | 0 | — | vi 7 / ti 0 | — | — |
| cvetlicarna-marjetica | 52 | 0 | — | vi 7 / ti 0 | — | — |
| elektro-zupan | 49 | 0 | — | vi 6 / ti 0 | — | — |
| frizerski-salon-mia | 39 | 0 | — | vi 7 / ti 0 | — | — |
| gostilna-pri-mostu | 45 | 0 | — | vi 7 / ti 0 | — | — |
| gostisce-na-gricu | 41 | 0 | — | vi 2 / ti 0 | — | — |
| karoserija-hribar | 50 | 0 | — | vi 6 / ti 0 | — | — |
| mizarstvo-lesnik | 48 | 0 | — | vi 9 / ti 0 | — | — |
| pizzeria-oljka | 39 | 0 | — | vi 7 / ti 0 | — | — |
| salon-tina | 47 | 0 | — | vi 7 / ti 0 | — | — |
| vulkanizer-zorman | 47 | 0 | — | vi 10 / ti 0 | — | — |

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
| avtoservis-mrak | car-repair | tablica | 97/100/100/100 | 0 | 360 | 0 | 4 | ✓ 2.3 MB | €0.182 | 183.8 s | 23.1 s | ✗ |
| frizerstvo-lana | hairdresser | ogledalo | 97/100/100/100 | 0 | 360 | 0 | 5 | ✓ 2.6 MB | €0.118 | 122.3 s | 29.3 s | ✓ |
| gostilna-zlata-zlica | restaurant | jedilnik | 96/100/100/100 | 0 | 360 | 0 | 0 | ✓ 5.1 MB | €0.149 | 195.2 s | 57.4 s | ✓ |
| instalacije-rebernik | builder | cevi | 99/100/100/100 | 0 | 360 | 0 | 1 | ✓ 1.0 MB | €0.102 | 84.9 s | 10.5 s | ✓ |
| trgovina-oljka-in-sol | shop | etiketa | 91/100/100/100 | 0 | 360 | 0 | 0 | ✗ 3.6 MB | €0.112 | 132.8 s | 28.6 s | ✗ |
| avto-kovac | car-repair | tablica | 98/100/100/100 | 0 | 360 | 0 | 3 | ✗ 1.8 MB | €0.102 | 130.2 s | 21.0 s | ✗ |
| brivnica-kos | hairdresser | warm-craft | 98/100/100/100 | 0 | 360 | 0 | 5 | ✗ 1.8 MB | €0.238 | 150.8 s | 26.3 s | ✗ |
| cvetlicarna-marjetica | shop | etiketa | 97/100/100/100 | 0 | 360 | 0 | 3 | ✓ 1.9 MB | €0.249 | 139.7 s | 32.8 s | ✓ |
| elektro-zupan | builder | cevi | 99/100/100/100 | 0 | 360 | 0 | 3 | ✗ 1.0 MB | €0.100 | 139.1 s | 20.4 s | ✗ |
| frizerski-salon-mia | hairdresser | ogledalo | 96/100/100/100 | 0 | 360 | 0 | 5 | ✗ 2.0 MB | €0.108 | 140.3 s | 18.1 s | ✗ |
| gostilna-pri-mostu | restaurant | jedilnik | 97/100/100/100 | 0 | 360 | 0 | 3 | ✓ 2.3 MB | €0.105 | 150.4 s | 20.3 s | ✓ |
| gostisce-na-gricu | restaurant | jedilnik | 96/100/100/100 | 0 | 360 | 0 | 3 | ✓ 2.9 MB | €0.100 | 82.7 s | 21.5 s | ✓ |
| karoserija-hribar | car-repair | tablica | 98/100/100/100 | 0 | 360 | 0 | 4 | ✓ 1.9 MB | €0.175 | 109.2 s | 25.8 s | ✗ |
| mizarstvo-lesnik | builder | warm-craft | 97/100/100/100 | 0 | 360 | 0 | 3 | ✗ 2.2 MB | €0.242 | 134.6 s | 30.8 s | ✗ |
| pizzeria-oljka | restaurant | warm-craft | 98/100/100/100 | 0 | 360 | 0 | 4 | ✗ 2.0 MB | €0.235 | 141.5 s | 26.3 s | ✗ |
| salon-tina | hairdresser | soft-studio | 96/100/100/100 | 0 | 360 | 0 | 3 | ✗ 1.6 MB | €0.132 | 153.4 s | 31.0 s | ✗ |
| vulkanizer-zorman | car-repair | tablica | 99/100/100/100 | 0 | 360 | 0 | 4 | ✗ 2.1 MB | €0.243 | 153.9 s | 26.8 s | ✗ |

### avtoservis-mrak

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 818 | 20 | 0 | 0 | 0.0008 | 0.0 s |
| brief | 1 | 5023 | 1412 | 0 | 0 | 0.0208 | 0.0 s |
| design | 1 | 8738 | 206 | 0 | 0 | 0.0168 | 0.0 s |
| altText | 1 | 2218 | 276 | 0 | 0 | 0.0062 | 0.0 s |
| content | 2 | 6988 | 2954 | 21583 | 21583 | 0.0875 | 0.0 s |
| critique | 2 | 15210 | 1892 | 44484 | 0 | 0.0501 | 18.4 s |
| **total** | | | | | | **0.1822** | |

Stage wall times: classify 0.1 s, brief 1.4 s, design 0.0 s, images 22.7 s, content 0.4 s, check 141.5 s, critique 18.9 s.

Homepage: hero-signature:photo › services-list:two-column › steps:vertical › price-list:tags › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | index.html: banned patterns: 2 call buttons on one screen (at 2800 px): a.plate.plate--poster "SLOKR041 555 730", a.btn.btn--primary.action-bar__btn "Klic" |

### frizerstvo-lana

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 853 | 21 | 0 | 0 | 0.0008 | 0.0 s |
| brief | 1 | 5058 | 1476 | 0 | 0 | 0.0214 | 0.0 s |
| design | 1 | 8786 | 206 | 0 | 0 | 0.0169 | 3.0 s |
| altText | 1 | 3302 | 465 | 0 | 0 | 0.0097 | 0.0 s |
| content | 1 | 3029 | 1321 | 20423 | 1160 | 0.0226 | 8.5 s |
| critique | 2 | 14364 | 1606 | 44484 | 0 | 0.0462 | 15.9 s |
| **total** | | | | | | **0.1175** | |

Stage wall times: classify 0.0 s, brief 0.9 s, design 3.0 s, images 20.8 s, content 8.5 s, check 76.5 s, critique 16.2 s.

Homepage: hero-signature:mirrors › steps:vertical › price-list:grouped › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### gostilna-zlata-zlica

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 906 | 18 | 0 | 0 | 0.0009 | 0.0 s |
| brief | 1 | 5139 | 1626 | 0 | 0 | 0.0228 | 0.0 s |
| design | 1 | 8783 | 206 | 0 | 0 | 0.0169 | 2.7 s |
| altText | 1 | 4928 | 669 | 0 | 0 | 0.0142 | 0.0 s |
| content | 2 | 8010 | 2947 | 43166 | 0 | 0.0465 | 16.3 s |
| critique | 2 | 15220 | 1610 | 44484 | 0 | 0.0477 | 15.9 s |
| **total** | | | | | | **0.1490** | |

Stage wall times: classify 0.0 s, brief 0.9 s, design 2.7 s, images 40.8 s, content 16.5 s, check 121.2 s, critique 16.4 s.

Homepage: hero-signature:card › price-list:tags › opening-hours:table › services-list:rows › team:photo › contact:call-out (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 96/100/100/100 | 0 | ✓ |  | — |

### instalacije-rebernik

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 876 | 18 | 0 | 0 | 0.0008 | 0.0 s |
| brief | 1 | 5128 | 1581 | 0 | 0 | 0.0224 | 0.0 s |
| design | 1 | 8786 | 193 | 0 | 0 | 0.0168 | 2.8 s |
| content | 1 | 2686 | 1083 | 21583 | 0 | 0.0176 | 7.0 s |
| critique | 2 | 14060 | 1453 | 44484 | 0 | 0.0443 | 12.8 s |
| **total** | | | | | | **0.1020** | |

Stage wall times: classify 0.0 s, images 0.0 s, brief 0.6 s, design 2.8 s, content 7.0 s, check 61.3 s, critique 13.0 s.

Homepage: hero-signature:drawing › services-list:rows › service-area:list › steps:horizontal › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |

### trgovina-oljka-in-sol

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 883 | 18 | 0 | 0 | 0.0008 | 0.0 s |
| brief | 1 | 5107 | 1522 | 0 | 0 | 0.0219 | 8.8 s |
| design | 1 | 8759 | 213 | 0 | 0 | 0.0169 | 3.4 s |
| altText | 1 | 3302 | 433 | 0 | 0 | 0.0094 | 0.0 s |
| content | 1 | 3070 | 1040 | 21583 | 0 | 0.0179 | 6.4 s |
| critique | 2 | 14563 | 1446 | 44484 | 0 | 0.0451 | 15.4 s |
| **total** | | | | | | **0.1121** | |

Stage wall times: classify 0.0 s, brief 9.6 s, design 3.4 s, images 22.1 s, content 6.5 s, check 88.4 s, critique 15.8 s.

Homepage: hero-image:overlay-left › image-text:round › price-list:tags › gallery:mosaic › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 91/100/100/100 | 0 | ✓ |  | export offline: trgovina-oljka-in-sol/index.html: stylesheet did not apply<br>export offline: trgovina-oljka-in-sol/zasebnost.html: stylesheet did not apply<br>export offline: trgovina-oljka-in-sol/dostopnost.html: stylesheet did not apply<br>export offline: trgovina-oljka-in-sol/404.html: stylesheet did not apply |

### avto-kovac

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 2 | 1582 | 40 | 0 | 0 | 0.0015 | 1.7 s |
| brief | 2 | 10010 | 2390 | 0 | 0 | 0.0378 | 14.5 s |
| altText | 2 | 3352 | 382 | 0 | 0 | 0.0091 | 3.4 s |
| design | 2 | 17569 | 421 | 0 | 0 | 0.0338 | 6.2 s |
| content | 2 | 4767 | 2559 | 43166 | 0 | 0.0376 | 17.6 s |
| critique | 4 | 29575 | 2361 | 88968 | 0 | 0.0865 | 24.1 s |
| **total** | | | | | | **0.2063** | |

Stage wall times: classify 0.0 s, brief 8.0 s, images 11.7 s, design 3.5 s, content 8.9 s, check 97.9 s, critique 11.2 s.

Homepage: hero-signature:photo › about:figure › services-list:two-column › steps:vertical › contact:stacked (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 98/100/100/100 | 0 | ✓ |  | export offline: avto-kovac/index.html: stylesheet did not apply<br>export offline: avto-kovac/zasebnost.html: stylesheet did not apply<br>export offline: avto-kovac/dostopnost.html: stylesheet did not apply<br>export offline: avto-kovac/404.html: stylesheet did not apply |

### brivnica-kos

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 2 | 1486 | 42 | 0 | 0 | 0.0015 | 1.7 s |
| brief | 2 | 9808 | 2690 | 0 | 0 | 0.0400 | 17.6 s |
| imageGen | 4 | 0 | 0 | 0 | 0 | 0.2716 | 1.5 s |
| design | 2 | 17205 | 402 | 0 | 0 | 0.0331 | 5.5 s |
| content | 2 | 4862 | 2118 | 43166 | 0 | 0.0340 | 13.9 s |
| critique | 4 | 27475 | 3430 | 88968 | 0 | 0.0921 | 31.2 s |
| **total** | | | | | | **0.4722** | |

Stage wall times: classify 0.0 s, images 0.0 s, brief 9.7 s, design 3.1 s, imageGen 8.7 s, content 7.8 s, check 108.0 s, critique 16.5 s.

Homepage: hero-split:image-left › opening-hours:week › services-list:rows › about:text-only › cta:band (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 98/100/100/100 | 0 | ✓ |  | export offline: brivnica-kos/index.html: stylesheet did not apply<br>export offline: brivnica-kos/zasebnost.html: stylesheet did not apply<br>export offline: brivnica-kos/dostopnost.html: stylesheet did not apply<br>export offline: brivnica-kos/404.html: stylesheet did not apply |

### cvetlicarna-marjetica

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 2 | 1508 | 36 | 0 | 0 | 0.0015 | 1.8 s |
| brief | 2 | 9848 | 3251 | 0 | 0 | 0.0449 | 20.5 s |
| imageGen | 4 | 0 | 0 | 0 | 0 | 0.2716 | 3.3 s |
| design | 2 | 17401 | 417 | 0 | 0 | 0.0335 | 6.2 s |
| content | 2 | 5824 | 3052 | 43166 | 0 | 0.0437 | 20.0 s |
| critique | 3 | 23816 | 2287 | 66726 | 0 | 0.0721 | 21.0 s |
| **total** | | | | | | **0.4673** | |

Stage wall times: classify 0.0 s, images 0.0 s, brief 11.1 s, design 3.4 s, imageGen 10.6 s, content 11.0 s, check 90.6 s, critique 16.2 s.

Homepage: hero-signature:label › price-list:tags › about:text-only › image-text:round › services-list:rows › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### elektro-zupan

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 2 | 1464 | 36 | 0 | 0 | 0.0014 | 1.5 s |
| brief | 2 | 9860 | 2784 | 0 | 0 | 0.0409 | 18.5 s |
| design | 2 | 17666 | 379 | 0 | 0 | 0.0336 | 5.5 s |
| content | 2 | 5035 | 2580 | 43166 | 0 | 0.0383 | 16.5 s |
| critique | 4 | 29541 | 2781 | 88968 | 0 | 0.0900 | 27.4 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 52.9 s |
| **total** | | | | | | **0.3401** | |

Stage wall times: classify 0.0 s, images 0.0 s, brief 9.8 s, design 2.7 s, content 7.9 s, check 104.0 s, critique 14.7 s.

Homepage: hero-type:large › about:figure › services-list:rows › service-area:list › steps:horizontal › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | export offline: elektro-zupan/index.html: stylesheet did not apply<br>export offline: elektro-zupan/zasebnost.html: stylesheet did not apply<br>export offline: elektro-zupan/dostopnost.html: stylesheet did not apply<br>export offline: elektro-zupan/404.html: stylesheet did not apply |

### frizerski-salon-mia

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 2 | 1462 | 42 | 0 | 0 | 0.0014 | 1.7 s |
| brief | 2 | 9808 | 2563 | 0 | 0 | 0.0389 | 14.8 s |
| altText | 2 | 4436 | 587 | 0 | 0 | 0.0127 | 5.1 s |
| design | 2 | 17547 | 410 | 0 | 0 | 0.0337 | 5.5 s |
| content | 3 | 8787 | 3952 | 64749 | 0 | 0.0602 | 25.2 s |
| critique | 4 | 28798 | 3234 | 88968 | 0 | 0.0926 | 31.4 s |
| **total** | | | | | | **0.2396** | |

Stage wall times: classify 0.0 s, brief 8.1 s, images 9.9 s, design 2.8 s, content 7.1 s, check 105.3 s, critique 16.8 s.

Homepage: hero-split:image-right › opening-hours:week › price-list:grouped › team:photo › contact:call-out (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 96/100/100/100 | 0 | ✓ |  | export offline: frizerski-salon-mia/index.html: stylesheet did not apply<br>export offline: frizerski-salon-mia/zasebnost.html: stylesheet did not apply<br>export offline: frizerski-salon-mia/dostopnost.html: stylesheet did not apply<br>export offline: frizerski-salon-mia/404.html: stylesheet did not apply |

### gostilna-pri-mostu

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 2 | 1468 | 36 | 0 | 0 | 0.0014 | 1.9 s |
| brief | 2 | 9816 | 2653 | 0 | 0 | 0.0397 | 16.0 s |
| altText | 2 | 4436 | 535 | 0 | 0 | 0.0122 | 4.3 s |
| design | 2 | 17611 | 413 | 0 | 0 | 0.0338 | 6.1 s |
| content | 2 | 5217 | 2601 | 43166 | 0 | 0.0388 | 16.7 s |
| critique | 4 | 28464 | 2392 | 88968 | 0 | 0.0848 | 27.9 s |
| **total** | | | | | | **0.2108** | |

Stage wall times: classify 0.0 s, brief 8.7 s, images 10.7 s, design 3.3 s, content 8.2 s, check 117.7 s, critique 12.2 s.

Homepage: hero-split:image-right › about:figure › opening-hours:table › price-list:offers › team:photo › contact:call-out (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### gostisce-na-gricu

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 2 | 1486 | 33 | 0 | 0 | 0.0014 | 1.6 s |
| brief | 2 | 9832 | 2782 | 0 | 0 | 0.0408 | 17.4 s |
| design | 2 | 17597 | 429 | 0 | 0 | 0.0340 | 5.6 s |
| altText | 2 | 4436 | 598 | 0 | 0 | 0.0128 | 4.6 s |
| content | 3 | 9344 | 4017 | 64749 | 0 | 0.0618 | 25.5 s |
| critique | 4 | 28185 | 1332 | 88968 | 0 | 0.0752 | 19.1 s |
| **total** | | | | | | **0.2260** | |

Stage wall times: classify 0.0 s, brief 9.6 s, design 2.8 s, images 12.9 s, content 8.6 s, check 52.9 s, critique 8.2 s.

Homepage: hero-image:overlay-bottom › about:figure › opening-hours:table › price-list:offers › team:photo › contact:call-out (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 96/100/100/100 | 0 | ✓ |  | — |

### karoserija-hribar

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 2 | 1486 | 40 | 0 | 0 | 0.0014 | 1.9 s |
| altText | 2 | 2268 | 217 | 0 | 0 | 0.0058 | 2.9 s |
| brief | 2 | 9866 | 3297 | 0 | 0 | 0.0453 | 21.2 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 1.0 s |
| design | 2 | 17623 | 388 | 0 | 0 | 0.0336 | 5.6 s |
| content | 2 | 5705 | 2416 | 43166 | 0 | 0.0380 | 15.7 s |
| critique | 4 | 28955 | 2436 | 88968 | 0 | 0.0861 | 27.3 s |
| **total** | | | | | | **0.3461** | |

Stage wall times: classify 0.0 s, images 4.0 s, brief 11.2 s, design 2.8 s, imageGen 6.4 s, content 8.2 s, check 69.9 s, critique 13.5 s.

Homepage: hero-signature:photo › services-list:two-column › service-area:list › steps:vertical › price-list:tags › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 98/100/100/100 | 0 | ✓ |  | index.html: banned patterns: 2 call buttons on one screen (at 2800 px): a.btn.btn--primary.site-header__cta "Pokličite", a.plate.plate--poster "SLOCE00 415 55 702"; 2 call buttons on one screen (at 3200 px): a.btn.btn--primary.site-header__cta "Pokličite", a.plate.plate--poster "SLOCE00 415 55 702" |

### mizarstvo-lesnik

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 2 | 1464 | 36 | 0 | 0 | 0.0014 | 1.6 s |
| brief | 2 | 9868 | 2937 | 0 | 0 | 0.0422 | 19.7 s |
| design | 2 | 17650 | 409 | 0 | 0 | 0.0339 | 6.1 s |
| imageGen | 4 | 0 | 0 | 0 | 0 | 0.2716 | 1.3 s |
| content | 2 | 5085 | 2816 | 43166 | 0 | 0.0404 | 19.1 s |
| critique | 4 | 29023 | 3122 | 88968 | 0 | 0.0921 | 27.7 s |
| **total** | | | | | | **0.4816** | |

Stage wall times: classify 0.0 s, images 0.1 s, brief 10.5 s, design 3.2 s, imageGen 7.6 s, content 9.5 s, check 88.5 s, critique 15.2 s.

Homepage: hero-split:image-left › about:figure › services-list:two-column › image-text:image-right › contact-strip:cards › cta:band (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | export offline: mizarstvo-lesnik/index.html: stylesheet did not apply<br>export offline: mizarstvo-lesnik/zasebnost.html: stylesheet did not apply<br>export offline: mizarstvo-lesnik/dostopnost.html: stylesheet did not apply<br>export offline: mizarstvo-lesnik/404.html: stylesheet did not apply |

### pizzeria-oljka

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 2 | 1434 | 36 | 0 | 0 | 0.0014 | 1.8 s |
| brief | 2 | 9782 | 2652 | 0 | 0 | 0.0396 | 16.8 s |
| imageGen | 4 | 0 | 0 | 0 | 0 | 0.2716 | 1.3 s |
| design | 2 | 17226 | 428 | 0 | 0 | 0.0333 | 6.2 s |
| content | 3 | 8446 | 3807 | 64749 | 0 | 0.0584 | 25.4 s |
| critique | 3 | 19630 | 2033 | 66726 | 0 | 0.0627 | 21.2 s |
| **total** | | | | | | **0.4671** | |

Stage wall times: classify 0.0 s, images 0.0 s, brief 9.3 s, design 3.0 s, imageGen 8.8 s, content 8.2 s, check 97.8 s, critique 17.4 s.

Homepage: hero-signature:arch › image-text:image-left › menu:classic › opening-hours:compact › cta:band (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 98/100/100/100 | 0 | ✓ |  | export offline: pizzeria-oljka/index.html: stylesheet did not apply<br>export offline: pizzeria-oljka/zasebnost.html: stylesheet did not apply<br>export offline: pizzeria-oljka/dostopnost.html: stylesheet did not apply<br>export offline: pizzeria-oljka/404.html: stylesheet did not apply |

### salon-tina

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 2 | 1494 | 42 | 0 | 0 | 0.0015 | 1.6 s |
| altText | 2 | 3352 | 406 | 0 | 0 | 0.0093 | 3.7 s |
| brief | 2 | 9840 | 2598 | 0 | 0 | 0.0393 | 15.7 s |
| design | 2 | 17231 | 377 | 0 | 0 | 0.0329 | 5.7 s |
| content | 3 | 8361 | 4249 | 64749 | 0 | 0.0621 | 27.1 s |
| critique | 4 | 28956 | 3719 | 88968 | 0 | 0.0971 | 35.6 s |
| **total** | | | | | | **0.2420** | |

Stage wall times: classify 0.0 s, images 7.8 s, brief 8.4 s, design 2.9 s, content 19.3 s, check 106.0 s, critique 16.4 s.

Homepage: hero-split:image-left › price-list:tags › services-list:rows › image-text:image-right › contact:split-map (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 96/100/100/100 | 0 | ✓ |  | export offline: salon-tina/index.html: stylesheet did not apply<br>export offline: salon-tina/zasebnost.html: stylesheet did not apply<br>export offline: salon-tina/dostopnost.html: stylesheet did not apply<br>export offline: salon-tina/404.html: stylesheet did not apply |

### vulkanizer-zorman

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 2 | 1552 | 40 | 0 | 0 | 0.0015 | 1.8 s |
| brief | 2 | 9968 | 2983 | 0 | 0 | 0.0428 | 19.4 s |
| imageGen | 4 | 0 | 0 | 0 | 0 | 0.2716 | 2.5 s |
| design | 2 | 17518 | 386 | 0 | 0 | 0.0335 | 7.2 s |
| content | 2 | 5413 | 2588 | 43166 | 0 | 0.0390 | 16.3 s |
| critique | 4 | 28928 | 4770 | 88968 | 0 | 0.1061 | 40.6 s |
| **total** | | | | | | **0.4944** | |

Stage wall times: classify 0.0 s, images 0.0 s, brief 10.1 s, design 3.2 s, imageGen 8.1 s, content 8.5 s, check 108.3 s, critique 18.8 s.

Homepage: hero-type:large › services-list:two-column › steps:vertical › price-list:tags › contact:stacked (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | export offline: vulkanizer-zorman/index.html: stylesheet did not apply<br>export offline: vulkanizer-zorman/zasebnost.html: stylesheet did not apply<br>export offline: vulkanizer-zorman/dostopnost.html: stylesheet did not apply<br>export offline: vulkanizer-zorman/404.html: stylesheet did not apply |
