# Eval report

Mode: **record-missing**, scope: **home**, started 2026-10-08T06:12:43.375Z, wall time 4594.4 s, paid this run €3.457 (replayed answers and cached pictures are free; the € columns below price every call like production).

0 model calls replayed from the recordings, 148 paid and recorded; 0 generated pictures from the cache, 12 made.

## Summary

- Checkpoints passing every automated check: **22/22**
- Scripted edits: 0 pass, 0 fail, 0 manual
- Median generation cost €0.123 (target ≤ €0.300) ✓
- Median generation time 108.1 s (target ≤ 60 s) ✗
- Median time to first preview 34.7 s (first saved version; checks and critique continue after it)
- Median edit cost €0.000 per edit
- Homepages repeating the contact facts (2+ contact blocks): 3/22
- Homepage skeleton similarity across sites: 0.45 (0 = nothing shared, 1 = same section order)
- First screen meets the composition targets: phone 17/22, desktop 15/22 (report-only; table below)
- Vision judge (1–5, 3 = ordinary small-business site): phone median 3.3, desktop median 3.7 (22 sites, €0.272)
- Slovene copy lint (report only, no model; table below): **3** findings on 3 of 22 sites (dual-we 1, title-case 2); 0 sites mix vi and ti; 3 more echo the client's own text; em dashes 0 (count only)

## Vision judge

Scores: impression / hierarchy / imagery / spacing / clutter / distinctiveness. Review sheets for a human look: `eval/look/<site>.png`.

| Site | Phone | Phone note | Desktop | Desktop note | Top fix |
|---|---|---|---|---|---|
| avtoservis-mrak | **3.7** (4/4/3/4/3/4) | The licence-plate phone number is a strong, trade-specific hook, but the hero photo is dimmed so heavily it reads as a dark smudge, and the placeholder tags in the footer look unfinished. | **3.7** (4/4/4/3/3/4) | The hero with the car on the lift and the big plate number is strong, but the hero text sits over the busy car, the lower page is text-heavy with only one small tyre photo, and the contact block repeats the hero's phone, address and hours. | Lighten the hero overlay or place the text on a solid panel so the photo reads clearly, and use the other two photos in the services or about section. |
| fizioterapija-pregib | **3.7** (4/4/4/3/3/4) | The hero photo sits half-hidden between an empty pale band and the dark block, with a dead gap under the intro text, and the fixed bar's three buttons crowd the first screen. | **4.0** (4/4/4/4/4/4) | A strong hero with a big headline and a clearly visible treatment room photo; the headline is a little heavy and the orange circle floats awkwardly over the shape. | On phone, close the gap between intro text and photo, and make the photo larger and full-width so the treatment room reads at once. |
| frizerstvo-lana | **3.0** (3/3/3/3/3/3) | The three arched photos sit under a text-only block with a dead gap and are then cut off by the huge "Cenik" heading, so the first screen reads as a price list rather than a salon. | **3.3** (3/3/4/2/4/4) | The arched photos and the large ghosted "Lana" look distinctive, but the giant "Cenik" heading collides with the hero buttons, and a big empty column is left beside the price list. | Give the hero its own block with a clear boundary and shrink the oversized "Cenik" heading so it no longer crowds the buttons or pulls attention from the salon intro. |
| gostilna-zlata-zlica | **3.3** (3/4/3/3/3/4) | The hero photo is a tightly cropped tree trunk and leaves that hides the inn itself, and the white card covers its lower half. The fixed call bar adds a second competing action pair on top of the hero link, and the circular dish photos stack large with big gaps. | **3.8** (4/4/4/3/4/4) | A strong hero with the real building and a clear card, but the card overhangs the green band and pushes the buttons to the fold edge. The family section leaves the right half empty. | On phone, recrop the hero so the building and terrace show, shrink the card, and keep a single primary action next to the fixed call bar. |
| instalacije-rebernik | **3.8** (4/4/3/4/4/4) | The pipe-themed system and the big red call block work well, but the radiator illustration is pushed to the bottom edge of the first screen and a leftover '[Vnesite e-poštni naslov]' placeholder is visible in the footer. | **3.7** (4/4/3/3/4/4) | The headline, the red call block and the radiator illustration balance well, but the blue Eko sklad banner has a large empty band and the footer leaves its right half empty. | Remove the visible email placeholder from the footer, or replace it with a real contact line. |
| kmetija-grabnar | **3.5** (4/3/4/3/3/4) | The hero photo is darkened to a muddy green and the three signposts crowd its lower half, while the "Oglejte si cene sob" link floats alone in a gap and the bottom bar adds a second pair of actions. | **4.0** (4/4/4/4/4/4) | The signpost hero works and fits the trade, but the dark overlay dulls the lovely view, and the signposts crammed at the right edge compete with the headline and sit close to the page's lower edge. | Lighten the hero overlay so the valley photo shows its colour, and shrink or space out the signposts on phone so they no longer cover half the image. |
| pekarna-kvas | **3.8** (4/4/4/4/3/4) | The hero is strong, with a warm dark palette, a heavy serif headline and an arched bread photo with an opening-hours badge. But the fixed Klic/Navodila bar, the hero button and the repeated 'Pokličite nas' block compete, and the unfilled [Vnesite ceno] placeholders look unfinished. | **3.8** (4/4/5/3/3/4) | The split hero with an arched bread photo and a price-style hours badge looks designed for a bakery. The page then loses energy: wide empty right-hand areas next to the menu and about text, big dead bands, and tiny body text beside oversized headings. | Replace the yellow [Vnesite ceno] placeholders with real prices or hide those rows, so the menu looks finished. |
| racunovodstvo-seliskar | **3.7** (4/4/4/3/3/4) | The receipt-style price list is a distinctive idea for an accountant, but it pushes below the fold and the services get repeated in a second list further down, while the 'Za koga delamo' heading sits cramped against the green block. | **3.8** (4/4/4/3/4/4) | The tilted receipt on a green panel gives the hero a distinct accountant character, but the left column floats with dead space around the text and the services are repeated in the receipt and again in the list below. | Remove the duplicate services list: keep either the receipt or the 'Naše storitve' section, so the services appear once. |
| trgovina-oljka-in-sol | **3.0** (3/3/2/3/3/4) | The white label card fills the first screen and pushes the shop photo below the fold, where only a sliver peeks out behind the fixed bar; the address and the stacked buttons sit in a cramped card. | **3.8** (4/4/4/3/4/4) | The label card with the arched door photo works well and feels like a real delicatessen, but the product cards are empty (no photos, only an icon) and there are dead gaps below them and around the 'Imamo tudi' band. | On phone, shrink the label card (smaller headline, one button, address folded into the eyebrow) so the door photo shows in the first screen above the fixed bar. |
| zobozdravstvo-lebar | **3.5** (4/4/3/3/3/4) | The hero photo is pushed to the bottom edge and cut off by the fixed bar, with a dead gap above the weak "Pišite nam" link; the hours chart also repeats the same bar five times at full width. | **3.8** (4/4/4/3/4/4) | The hero is strong and specific (circle photo, smile arc), but the services block leaves a big empty area under the dark card, and the team section has the two photos floating far from the text. | On phone, tighten the gap after the intro and shrink the headline slightly so the circular photo sits fully in the first screen above the fixed bar. |
| avto-kovac | **3.7** (4/4/3/4/3/4) | The licence-plate phone number and hazard-stripe band suit the trade, but the hero photo is darkened to near-mud and the address, hours and phone are repeated three times down the page. | **3.7** (4/4/4/3/3/4) | The hero garage photo is strong and the plate number is bold, but the content below sits in a thin left column with dead space beside the services, and contact details repeat in the band, call section and footer. | Brighten the hero photo with a lighter overlay, or use the mechanic photo in the first screen on phone, so the work is visible. |
| brivnica-kos | **3.0** (3/4/3/3/3/2) | The first screen is the generic stack of photo, eyebrow, headline and link, and the picture is a street scene rather than the barbershop. The bottom bar repeats the call and directions actions that appear again in the page body. | **3.0** (3/4/3/3/3/2) | The hero overlay card covers a third of a stock street photo and the nav is awkward, with 'Domov' on its own line under the logo. Yellow placeholders show in the price list and footer. | Use the razor and brush image in the hero, or build a deliberately typographic dark-elegant hero, and drop the street photo that says nothing about hairdressing. |
| cvetlicarna-marjetica | **3.3** (3/4/4/3/3/3) | The hero follows the generic pattern of photo, eyebrow, headline and button, and the page below it is long, with yellow [Vnesite ceno] placeholders in the price list and footer that make it look unfinished. | **3.3** (3/4/4/3/3/3) | The hero is clean and the photo is strong, but the page below is a plain list of prices with yellow placeholder chips, and the large empty band under the hero buttons plus the half-empty price columns leave it uneven. | Remove or hide the yellow [Vnesite ...] placeholders: show prices only where they exist, or write 'po dogovoru' instead of leaving gaps in the list and footer. |
| elektro-zupan | **3.2** (3/4/2/4/3/3) | The first screen reads clearly (trade, phone CTA, directions), but the illustration is a radiator, which is heating rather than electrical work, and it is cut off below the fold. | **3.2** (3/4/2/3/4/3) | The headline and phone block are strong, but the radiator illustration is off-topic for an electrician, and the first screen has large empty areas around it with the whole page feeling sparse. | Replace the radiator with an electrical motif (a fuse box, cable run or socket) in the same flat style, so the trade reads at a glance. Keep it smaller on the phone so it fits in the first screen. |
| frizerski-salon-mia | **3.0** (3/3/3/3/3/3) | The three arched photos sit below a dead white band and a faint pink 'Mia' is cut off behind them. The huge 'Cenik' heading then crowds the first screen and pushes the price list ahead of the contact details. | **3.5** (4/3/4/3/3/4) | The arched photo trio with the giant 'Mia' watermark gives it character, but the 'Cenik' heading jammed against the hero buttons leaves a big empty column beside the price list. | Make the first screen the salon: pull the arched photos up directly under the headline, remove the gap before 'Poglejte cenik', and keep the pink 'Mia' fully visible or drop it. |
| gostilna-pri-mostu | **3.0** (3/3/3/3/3/3) | The hero photo is cropped so tightly that the soup is mostly hidden behind a white card that covers the lower half of the screen, and the name of the restaurant is only a small logo. | **3.2** (3/4/4/2/3/3) | The specialities section leaves a large empty white area beside a small circular photo, with a stray 'Vnesite ceno' placeholder and a dead band before the dark section. | Make the phone hero photo taller and show the whole bowl, with a shorter text card or text placed over a gradient, so the dish stays visible and the call/directions bar is the only primary action. |
| gostisce-na-gricu | **3.0** (3/3/3/3/3/3) | The hero photo is cropped to a bare tree trunk and leaves, and the white card covers the building, so the first screen doesn't show a restaurant; the yellow [Vnesite ceno] placeholders in the menu also look unfinished. | **3.7** (4/4/4/3/4/3) | The full-bleed house photo with the overlapping card is strong, but the card spills past the hero and leaves a dead green band, and the menu section below is thin with yellow placeholder prices. | Crop the phone hero to the terrace or house so the restaurant is recognisable, and make the card shorter so it doesn't cover the photo. |
| karoserija-hribar | **3.5** (4/4/2/4/3/4) | The hero photo is blurred and darkened to near-invisibility behind the text, and the only sharp photo (the car fender) is buried far down the page; the footer also shows unfilled placeholder fields. | **3.7** (4/4/4/3/3/4) | The garage photo works well in the hero and the number-plate phone is a strong trade-specific idea, but the tow section has a big empty left column where its photo should be, and the page repeats address and phone three times. | Show the hero photo sharp and lighter on phone (less blur and overlay), or put the fender or tow photo in the first screen, so the work is visible immediately. |
| mizarstvo-lesnik | **3.2** (3/4/3/4/3/2) | The hero is the generic photo, eyebrow, headline, text, link stack; the lumber stock photo and the unrelated misty valley landscape feel like stock, and the yellow placeholder fields in the footer look unfinished. | **3.2** (3/4/3/3/4/2) | The hero is clean, but the second section's landscape photo has nothing to do with joinery, and the About section leaves half the width empty, with yellow placeholder boxes in the footer. | Remove the yellow placeholder fields and replace the stock-looking landscape with a photo of finished furniture or the workshop, or drop the image and let typography carry the section. |
| pizzeria-oljka | **3.3** (3/4/4/3/3/3) | The big fire photo and the pizza headline lead well, but yellow [Vnesite ceno] placeholders in the menu and footer make it look unfinished, and phone, address and the reservation CTA repeat across the page. | **3.3** (3/4/4/3/3/3) | The hero photo and text split works, but the menu is a narrow column hugging the left with a dead right half, and the yellow placeholder tags look unfinished. | Remove the yellow placeholder tags or hide menu items with no price and empty footer fields, so the page looks finished. |
| salon-tina | **3.3** (3/4/4/3/3/3) | The photo-first hero is strong and the headline fits, but the page falls back on the generic pattern of eyebrow, headline, text and button, and the call button is repeated in the final dark block. | **3.5** (3/4/4/3/4/3) | The hero is clean with a large photo, but the dark CTA band is mostly empty on its right side, the section between the services and the photo has a dead band, and yellow footer placeholders are visible. | Fill or restructure the dark CTA band, for example with the second photo or a two-column layout with phone and hours, and trim the dead padding around the services and bridal sections. |
| vulkanizer-zorman | **3.2** (3/4/3/3/2/4) | The licence-plate phone number is a strong, trade-specific hook, but hours, address, directions and the call prompt are each repeated in the hero, the yellow band and the closing section, and the footer shows raw [Vnesite ...] placeholders. | **3.5** (4/4/4/3/2/4) | The full-bleed tyre photo with a huge plate-style number gives a strong first screen, but the headline is oversized, the directions link falls near the fold, and the hours and address are repeated lower down. | Show hours and address once: drop the yellow band under the hero or the duplicate in the closing section, and keep a single call prompt per screen. |

## First screen

Measured on the rendered homepage before scrolling: photo share · first photo at (screens) · buttons · headline lines · largest empty band (px). Targets: phone photo ≥ 25 % (with photos), ≤ 3 buttons, ≤ 4 lines, band ≤ 96 px; desktop photo ≥ 30 %, ≤ 3 buttons, ≤ 3 lines, band ≤ 160 px.

| Site | Photos | Phone 360×800 | Misses | Desktop 1280×800 | Misses |
|---|---|---|---|---|---|
| avtoservis-mrak | 3 | 92 % · 0.08 · 0 · 3 · 60 | ✓ | 91 % · 0.09 · 0 · 3 · 88 | ✓ |
| fizioterapija-pregib | 1 | 25 % · 0.50 · 3 · 2 · 76 | ✓ | 26 % · 0.23 · 2 · 3 · 88 | photo 26 % < 30 % |
| frizerstvo-lana | 5 | 21 % · 0.56 · 2 · 2 · 65 | photo 21 % < 25 % | 21 % · 0.18 · 1 · 3 · 109 | photo 21 % < 30 % |
| gostilna-zlata-zlica | 8 | 78 % · 0.09 · 2 · 2 · 44 | ✓ | 91 % · 0.09 · 1 · 2 · 140 | ✓ |
| instalacije-rebernik | 0 | 0 % · — · 0 · 3 · 109 | empty band 109 px > 96 | 0 % · — · 0 · 3 · 142 | ✓ |
| kmetija-grabnar | 8 | 92 % · 0.08 · 2 · 2 · 54 | ✓ | 91 % · 0.09 · 1 · 3 · 88 | ✓ |
| pekarna-kvas | 3 | 28 % · 0.54 · 3 · 2 · 63 | ✓ | 25 % · 0.14 · 1 · 2 · 148 | photo 25 % < 30 % |
| racunovodstvo-seliskar | 0 | 0 % · — · 2 · 3 · 91 | ✓ | 0 % · — · 1 · 3 · 126 | ✓ |
| trgovina-oljka-in-sol | 5 | 10 % · 0.86 · 3 · 3 · 88 | photo 10 % < 25 % | 24 % · 0.37 · 2 · 3 · 117 | photo 24 % < 30 % |
| zobozdravstvo-lebar | 3 | 26 % · 0.58 · 2 · 2 · 64 | ✓ | 24 % · 0.16 · 1 · 3 · 112 | photo 24 % < 30 % |
| avto-kovac | 2 | 92 % · 0.08 · 0 · 3 · 60 | ✓ | 91 % · 0.09 · 0 · 2 · 88 | ✓ |
| brivnica-kos | 0 | 26 % · 0.13 · 2 · 3 · 77 | ✓ | 71 % · 0.21 · 2 · 4 · 133 | headline 4 lines > 3 |
| cvetlicarna-marjetica | 0 | 28 % · 0.12 · 1 · 3 · 56 | ✓ | 29 % · 0.16 · 2 · 3 · 124 | ✓ |
| elektro-zupan | 0 | 0 % · — · 0 · 2 · 109 | empty band 109 px > 96 | 0 % · — · 0 · 3 · 142 | ✓ |
| frizerski-salon-mia | 3 | 21 % · 0.53 · 2 · 2 · 65 | photo 21 % < 25 % | 21 % · 0.18 · 1 · 3 · 110 | photo 21 % < 30 % |
| gostilna-pri-mostu | 3 | 86 % · 0.09 · 2 · 3 · 44 | ✓ | 91 % · 0.09 · 1 · 3 · 140 | ✓ |
| gostisce-na-gricu | 3 | 81 % · 0.09 · 2 · 2 · 83 | ✓ | 91 % · 0.09 · 1 · 2 · 140 | ✓ |
| karoserija-hribar | 1 | 92 % · 0.08 · 0 · 3 · 60 | ✓ | 91 % · 0.09 · 0 · 3 · 88 | ✓ |
| mizarstvo-lesnik | 0 | 28 % · 0.11 · 2 · 3 · 65 | ✓ | 29 % · 0.15 · 2 · 2 · 109 | ✓ |
| pizzeria-oljka | 0 | 28 % · 0.11 · 1 · 2 · 48 | ✓ | 29 % · 0.15 · 2 · 2 · 100 | ✓ |
| salon-tina | 2 | 29 % · 0.12 · 1 · 2 · 61 | ✓ | 30 % · 0.16 · 2 · 2 · 112 | ✓ |
| vulkanizer-zorman | 0 | 92 % · 0.08 · 0 · 4 · 60 | ✓ | 91 % · 0.09 · 0 · 3 · 88 | ✓ |

## Slovene copy

Deterministic lint (`tools/eval/src/slovene-lint.ts`) over every visible string of the generated site: pages, collections and alt texts; the business's own names, links and brands left out. Report only: no fixture passes or fails on it. A finding whose text is also in the client's own description is *echoed*: listed, not counted. Address counts vi and ti forms over the whole site.

| Site | Strings | Findings | By rule | Address | Echoed | After edits |
|---|---|---|---|---|---|---|
| avtoservis-mrak | 53 | 0 | — | vi 7 / ti 0 | — | — |
| fizioterapija-pregib | 54 | 0 | — | vi 10 / ti 0 | 3 (english 3) | — |
| frizerstvo-lana | 48 | 0 | — | vi 9 / ti 0 | — | — |
| gostilna-zlata-zlica | 55 | 0 | — | vi 5 / ti 0 | — | — |
| instalacije-rebernik | 44 | 0 | — | vi 9 / ti 0 | — | — |
| kmetija-grabnar | 60 | 0 | — | vi 4 / ti 0 | — | — |
| pekarna-kvas | 43 | 0 | — | vi 10 / ti 0 | — | — |
| racunovodstvo-seliskar | 58 | 1 | title-case 1 | vi 8 / ti 0 | — | — |
| trgovina-oljka-in-sol | 40 | 0 | — | vi 8 / ti 0 | — | — |
| zobozdravstvo-lebar | 44 | 0 | — | vi 8 / ti 0 | — | — |
| avto-kovac | 40 | 0 | — | vi 10 / ti 0 | — | — |
| brivnica-kos | 43 | 0 | — | vi 11 / ti 0 | — | — |
| cvetlicarna-marjetica | 51 | 0 | — | vi 7 / ti 0 | — | — |
| elektro-zupan | 49 | 0 | — | vi 6 / ti 0 | — | — |
| frizerski-salon-mia | 40 | 0 | — | vi 7 / ti 0 | — | — |
| gostilna-pri-mostu | 51 | 0 | — | vi 9 / ti 0 | — | — |
| gostisce-na-gricu | 44 | 0 | — | vi 6 / ti 0 | — | — |
| karoserija-hribar | 45 | 0 | — | vi 7 / ti 0 | — | — |
| mizarstvo-lesnik | 58 | 1 | title-case 1 | vi 16 / ti 0 | — | — |
| pizzeria-oljka | 45 | 0 | — | vi 6 / ti 0 | — | — |
| salon-tina | 39 | 1 | dual-we 1 | vi 10 / ti 0 | — | — |
| vulkanizer-zorman | 43 | 0 | — | vi 9 / ti 0 | — | — |

| Rule | Findings | Sites | Echoed |
|---|---|---|---|
| english: English word or phrase where Slovene has one | 0 | 0 | 3 |
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
| title-case: English Title Case in a heading (Slovene headings are sentence case) | 2 | 2 | 0 |

Findings (up to eight per site; every finding is in `eval/runs/<site>/slovene-lint.json`):

- **fizioterapija-pregib**: english „dry needling“ in „Delam z manualno terapijo in terapevtskimi vajami. Po potreb…“ (`/pages/0/sections/3/props/paragraphs/0`) *echoed*; english „kinesio taping“ in „Delam z manualno terapijo in terapevtskimi vajami. Po potreb…“ (`/pages/0/sections/3/props/paragraphs/0`) *echoed*; english „Dry needling“ in „Dry needling kot dodatek“ (`/pages/0/sections/4/props/groups/0/items/2/name`) *echoed*
- **racunovodstvo-seliskar**: title-case „Delamo v Murski Soboti“ in „Delamo v Murski Soboti“ (`/pages/0/sections/3/props/heading`)
- **mizarstvo-lesnik**: title-case „Mizarstvo v Škofji Loki“ in „Mizarstvo v Škofji Loki“ (`/pages/0/sections/0/props/eyebrow`)
- **salon-tina**: dual-we „skupaj poiščeva“ in „Delam samo po naročilu. Pokličite me in skupaj poiščeva term…“ (`/pages/0/sections/4/props/text`)

## Sites

Lighthouse thresholds: performance ≥ 90, accessibility 100, best practices ≥ 95, SEO ≥ 95.

| Site | Type | Direction | LH P/A/BP/SEO | axe | 360 px width | Facts | Placeholders | Export offline | Gen cost | Gen time | First preview | Pass |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| avtoservis-mrak | car-repair | tablica | 97/100/100/100 | 0 | 360 | 0 | 4 | ✓ 2.3 MB | €0.155 | 310.0 s | 30.5 s | ✓ |
| fizioterapija-pregib | physio | pregib | 97/100/100/100 | 0 | 360 | 0 | 0 | ✓ 1.5 MB | €0.172 | 121.4 s | 40.7 s | ✓ |
| frizerstvo-lana | hairdresser | ogledalo | 97/100/100/100 | 0 | 360 | 0 | 5 | ✓ 2.6 MB | €0.105 | 121.2 s | 38.5 s | ✓ |
| gostilna-zlata-zlica | restaurant | jedilnik | 95/100/100/100 | 0 | 360 | 0 | 2 | ✓ 5.1 MB | €0.115 | 101.1 s | 67.1 s | ✓ |
| instalacije-rebernik | builder | cevi | 99/100/100/100 | 0 | 360 | 0 | 1 | ✓ 1.0 MB | €0.099 | 117.2 s | 33.0 s | ✓ |
| kmetija-grabnar | tourist-farm | markacija | 92/100/100/100 | 0 | 360 | 0 | 3 | ✓ 5.7 MB | €0.149 | 116.5 s | 81.7 s | ✓ |
| pekarna-kvas | bakery | skorja | 97/100/100/100 | 0 | 360 | 0 | 5 | ✓ 2.5 MB | €0.106 | 79.6 s | 23.0 s | ✓ |
| racunovodstvo-seliskar | accountant | racun | 100/100/100/100 | 0 | 360 | 0 | 0 | ✓ 1.0 MB | €0.102 | 78.4 s | 21.7 s | ✓ |
| trgovina-oljka-in-sol | shop | etiketa | 96/100/100/100 | 0 | 360 | 0 | 0 | ✓ 3.6 MB | €0.102 | 87.9 s | 36.3 s | ✓ |
| zobozdravstvo-lebar | dental | nasmeh | 99/100/100/100 | 0 | 360 | 0 | 0 | ✓ 1.9 MB | €0.083 | 49.9 s | 21.4 s | ✓ |
| avto-kovac | car-repair | tablica | 97/100/100/100 | 0 | 360 | 0 | 3 | ✓ 1.8 MB | €0.076 | 49.7 s | 19.7 s | ✓ |
| brivnica-kos | hairdresser | dark-elegant | 96/100/100/100 | 0 | 360 | 0 | 5 | ✓ 1.8 MB | €0.231 | 99.7 s | 42.0 s | ✓ |
| cvetlicarna-marjetica | shop | warm-craft | 96/100/100/100 | 0 | 360 | 0 | 8 | ✓ 1.9 MB | €0.242 | 120.3 s | 46.6 s | ✓ |
| elektro-zupan | builder | cevi | 99/100/100/100 | 0 | 360 | 0 | 3 | ✓ 1.0 MB | €0.099 | 103.2 s | 28.2 s | ✓ |
| frizerski-salon-mia | hairdresser | ogledalo | 97/100/100/100 | 0 | 360 | 0 | 5 | ✓ 2.0 MB | €0.098 | 87.7 s | 19.7 s | ✓ |
| gostilna-pri-mostu | restaurant | jedilnik | 96/100/100/100 | 0 | 360 | 0 | 4 | ✓ 2.3 MB | €0.130 | 105.4 s | 30.4 s | ✓ |
| gostisce-na-gricu | restaurant | jedilnik | 96/100/100/100 | 0 | 360 | 0 | 7 | ✓ 2.9 MB | €0.125 | 104.4 s | 32.1 s | ✓ |
| karoserija-hribar | car-repair | tablica | 97/100/100/100 | 0 | 360 | 0 | 4 | ✓ 1.9 MB | €0.175 | 126.3 s | 44.4 s | ✓ |
| mizarstvo-lesnik | builder | warm-craft | 97/100/100/100 | 0 | 360 | 0 | 3 | ✓ 2.2 MB | €0.236 | 128.6 s | 51.5 s | ✓ |
| pizzeria-oljka | restaurant | warm-craft | 95/100/100/100 | 0 | 360 | 0 | 6 | ✓ 2.0 MB | €0.230 | 110.7 s | 41.9 s | ✓ |
| salon-tina | hairdresser | soft-studio | 97/100/100/100 | 0 | 360 | 0 | 3 | ✓ 1.6 MB | €0.122 | 115.1 s | 28.0 s | ✓ |
| vulkanizer-zorman | car-repair | tablica | 97/100/100/100 | 0 | 360 | 0 | 4 | ✓ 2.1 MB | €0.235 | 125.7 s | 40.8 s | ✓ |

### avtoservis-mrak

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 818 | 20 | 0 | 0 | 0.0008 | 2.0 s |
| brief | 1 | 4026 | 1519 | 0 | 0 | 0.0200 | 9.4 s |
| design | 1 | 8663 | 187 | 0 | 0 | 0.0165 | 3.9 s |
| altText | 1 | 2218 | 276 | 0 | 0 | 0.0062 | 5.7 s |
| content | 1 | 2729 | 1281 | 0 | 21583 | 0.0621 | 12.7 s |
| critique | 2 | 14966 | 1493 | 42665 | 1819 | 0.0498 | 16.2 s |
| **total** | | | | | | **0.1554** | |

Stage wall times: classify 2.0 s, brief 9.8 s, design 3.9 s, images 17.6 s, content 12.8 s, check 262.7 s, critique 16.7 s.

Homepage: hero-signature:photo › services-list:two-column › price-list:tags › image-text:image-left › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### fizioterapija-pregib

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 859 | 19 | 0 | 0 | 0.0008 | 1.9 s |
| altText | 1 | 1134 | 110 | 0 | 0 | 0.0029 | 2.4 s |
| brief | 1 | 4078 | 1456 | 0 | 0 | 0.0195 | 9.8 s |
| design | 1 | 8689 | 182 | 0 | 0 | 0.0165 | 2.9 s |
| imageGen | 1 | 0 | 0 | 0 | 0 | 0.0679 | 16.3 s |
| content | 1 | 2757 | 1280 | 20423 | 1160 | 0.0218 | 7.9 s |
| critique | 2 | 15082 | 1001 | 44484 | 0 | 0.0422 | 13.3 s |
| **total** | | | | | | **0.1716** | |

Stage wall times: classify 1.9 s, images 9.5 s, brief 10.2 s, design 2.9 s, imageGen 20.4 s, content 8.0 s, check 67.0 s, critique 13.7 s.

Homepage: hero-signature:bend › highlights:figures › services-list:aside › text:narrow › price-list:tags › cta:band › contact-strip:cards (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### frizerstvo-lana

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 853 | 21 | 0 | 0 | 0.0008 | 1.7 s |
| brief | 1 | 4065 | 1443 | 0 | 0 | 0.0194 | 8.6 s |
| design | 1 | 8715 | 190 | 0 | 0 | 0.0166 | 3.2 s |
| altText | 1 | 3302 | 465 | 0 | 0 | 0.0097 | 6.0 s |
| content | 1 | 2828 | 1208 | 21583 | 0 | 0.0190 | 7.3 s |
| critique | 2 | 13921 | 921 | 44484 | 0 | 0.0395 | 12.6 s |
| **total** | | | | | | **0.1050** | |

Stage wall times: classify 1.8 s, brief 9.5 s, design 3.3 s, images 30.8 s, content 7.4 s, check 69.6 s, critique 13.1 s.

Homepage: hero-signature:mirrors › price-list:grouped › team:photo › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### gostilna-zlata-zlica

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 906 | 18 | 0 | 0 | 0.0009 | 1.8 s |
| brief | 1 | 4147 | 1633 | 0 | 0 | 0.0212 | 10.1 s |
| design | 1 | 8720 | 200 | 0 | 0 | 0.0167 | 2.9 s |
| altText | 1 | 4928 | 669 | 0 | 0 | 0.0142 | 9.2 s |
| content | 2 | 7818 | 2664 | 43166 | 0 | 0.0438 | 14.0 s |
| critique | 1 | 8102 | 16 | 22242 | 0 | 0.0179 | 2.5 s |
| **total** | | | | | | **0.1147** | |

Stage wall times: classify 1.8 s, brief 10.7 s, design 2.9 s, images 52.9 s, content 14.2 s, check 31.3 s, critique 2.7 s.

Homepage: hero-signature:card › price-list:offers › products:plates › image-text:pair › team:photo › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 95/100/100/100 | 0 | ✓ |  | — |

### instalacije-rebernik

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 876 | 18 | 0 | 0 | 0.0008 | 2.8 s |
| brief | 1 | 4124 | 1503 | 0 | 0 | 0.0200 | 19.5 s |
| design | 1 | 8673 | 191 | 0 | 0 | 0.0166 | 2.5 s |
| content | 1 | 2486 | 1196 | 21583 | 0 | 0.0183 | 7.5 s |
| critique | 2 | 14488 | 1271 | 44484 | 0 | 0.0435 | 13.0 s |
| **total** | | | | | | **0.0992** | |

Stage wall times: classify 2.8 s, images 2.8 s, brief 19.9 s, design 2.5 s, content 7.5 s, check 70.3 s, critique 13.9 s.

Homepage: hero-signature:drawing › services-list:rows › text:narrow › steps:horizontal › service-area:list › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |

### kmetija-grabnar

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 910 | 20 | 0 | 0 | 0.0009 | 1.7 s |
| brief | 2 | 10097 | 3261 | 0 | 0 | 0.0454 | 19.4 s |
| design | 1 | 8699 | 190 | 0 | 0 | 0.0166 | 2.4 s |
| altText | 1 | 4928 | 700 | 0 | 0 | 0.0145 | 9.2 s |
| content | 2 | 8349 | 3096 | 43166 | 0 | 0.0484 | 17.6 s |
| critique | 1 | 8207 | 608 | 22242 | 0 | 0.0232 | 6.9 s |
| **total** | | | | | | **0.1490** | |

Stage wall times: classify 1.7 s, brief 19.8 s, design 2.4 s, images 63.9 s, content 17.7 s, check 27.6 s, critique 7.2 s.

Homepage: hero-signature:view › price-list:rates › gallery:wall › image-text:image-right › opening-hours:poster › services-list:aside › team:list › contact:call-out (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 92/100/100/100 | 0 | ✓ |  | — |

### pekarna-kvas

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 911 | 19 | 0 | 0 | 0.0009 | 1.7 s |
| brief | 1 | 4133 | 1505 | 0 | 0 | 0.0201 | 9.4 s |
| design | 1 | 8709 | 187 | 0 | 0 | 0.0166 | 2.4 s |
| altText | 1 | 2218 | 270 | 0 | 0 | 0.0061 | 4.2 s |
| content | 1 | 2731 | 1219 | 21583 | 0 | 0.0189 | 8.1 s |
| critique | 2 | 14580 | 1299 | 44484 | 0 | 0.0439 | 13.5 s |
| **total** | | | | | | **0.1064** | |

Stage wall times: classify 1.7 s, brief 9.7 s, design 2.4 s, images 14.8 s, content 8.2 s, check 43.0 s, critique 13.6 s.

Homepage: hero-signature:arch › price-list:grouped › cta:band › image-text:image-left › about:text-only › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### racunovodstvo-seliskar

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 875 | 19 | 0 | 0 | 0.0008 | 1.4 s |
| brief | 1 | 4113 | 1468 | 0 | 0 | 0.0197 | 9.8 s |
| design | 1 | 8655 | 169 | 0 | 0 | 0.0163 | 2.4 s |
| content | 1 | 2640 | 1284 | 21583 | 0 | 0.0193 | 7.7 s |
| critique | 2 | 14763 | 1507 | 44484 | 0 | 0.0460 | 13.7 s |
| **total** | | | | | | **0.1022** | |

Stage wall times: classify 1.4 s, images 1.4 s, brief 10.1 s, design 2.4 s, content 7.8 s, check 42.8 s, critique 13.9 s.

Homepage: hero-signature:receipt › highlights:figures › services-list:rows › about:figure › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 100/100/100/100 | 0 | ✓ |  | — |

### trgovina-oljka-in-sol

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 883 | 18 | 0 | 0 | 0.0008 | 2.0 s |
| brief | 1 | 4114 | 1556 | 0 | 0 | 0.0205 | 8.7 s |
| design | 1 | 8672 | 208 | 0 | 0 | 0.0167 | 3.0 s |
| altText | 1 | 3302 | 433 | 0 | 0 | 0.0094 | 6.0 s |
| content | 1 | 2994 | 1104 | 21583 | 0 | 0.0184 | 6.5 s |
| critique | 2 | 14739 | 352 | 44484 | 0 | 0.0360 | 6.3 s |
| **total** | | | | | | **0.1018** | |

Stage wall times: classify 2.1 s, brief 9.1 s, design 3.0 s, images 29.8 s, content 6.5 s, check 44.9 s, critique 6.6 s.

Homepage: hero-signature:label › price-list:tags › text:narrow › image-text:round › opening-hours:photo › contact:call-out (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 96/100/100/100 | 0 | ✓ |  | — |

### zobozdravstvo-lebar

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 892 | 18 | 0 | 0 | 0.0008 | 1.6 s |
| brief | 1 | 4132 | 1535 | 0 | 0 | 0.0203 | 9.3 s |
| altText | 1 | 2218 | 276 | 0 | 0 | 0.0062 | 3.9 s |
| design | 1 | 8679 | 215 | 0 | 0 | 0.0168 | 3.2 s |
| content | 1 | 2793 | 1057 | 21583 | 0 | 0.0176 | 6.9 s |
| critique | 1 | 7340 | 566 | 22242 | 0 | 0.0213 | 7.0 s |
| **total** | | | | | | **0.0830** | |

Stage wall times: classify 1.6 s, brief 9.7 s, images 13.5 s, design 3.2 s, content 6.9 s, check 21.4 s, critique 7.1 s.

Homepage: hero-signature:disc › opening-hours:week › services-list:aside › team:photo › contact:call-out (2 contact blocks).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |

### avto-kovac

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 791 | 20 | 0 | 0 | 0.0008 | 1.5 s |
| brief | 1 | 4008 | 1171 | 0 | 0 | 0.0170 | 7.2 s |
| design | 1 | 8659 | 182 | 0 | 0 | 0.0165 | 2.5 s |
| altText | 1 | 1676 | 189 | 0 | 0 | 0.0045 | 6.7 s |
| content | 1 | 2298 | 962 | 21583 | 0 | 0.0159 | 5.9 s |
| critique | 1 | 6686 | 649 | 22242 | 0 | 0.0209 | 7.0 s |
| **total** | | | | | | **0.0755** | |

Stage wall times: classify 1.5 s, brief 7.7 s, design 2.5 s, images 13.8 s, content 5.9 s, check 22.8 s, critique 7.2 s.

Homepage: hero-signature:photo › services-list:two-column › image-text:image-left › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### brivnica-kos

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 743 | 21 | 0 | 0 | 0.0007 | 1.5 s |
| brief | 1 | 3911 | 1264 | 0 | 0 | 0.0176 | 8.5 s |
| design | 1 | 8549 | 184 | 0 | 0 | 0.0163 | 2.5 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 36.4 s |
| content | 1 | 2193 | 1112 | 21583 | 0 | 0.0170 | 6.8 s |
| critique | 2 | 13812 | 1358 | 44484 | 0 | 0.0431 | 12.8 s |
| **total** | | | | | | **0.2306** | |

Stage wall times: classify 1.5 s, images 1.5 s, brief 8.8 s, design 2.5 s, imageGen 24.7 s, content 6.9 s, check 44.5 s, critique 13.1 s.

Homepage: hero-image:overlay-left › contact-strip:cards › price-list:grouped › image-text:image-right › booking:simple (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 96/100/100/100 | 0 | ✓ |  | — |

### cvetlicarna-marjetica

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 754 | 18 | 0 | 0 | 0.0007 | 1.6 s |
| brief | 1 | 3931 | 1715 | 0 | 0 | 0.0215 | 11.2 s |
| design | 1 | 8637 | 199 | 0 | 0 | 0.0166 | 3.9 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 38.5 s |
| content | 1 | 2669 | 1444 | 21583 | 0 | 0.0207 | 8.3 s |
| critique | 2 | 14990 | 1517 | 44484 | 0 | 0.0465 | 13.4 s |
| **total** | | | | | | **0.2418** | |

Stage wall times: classify 1.6 s, images 1.6 s, brief 11.5 s, design 3.9 s, imageGen 25.1 s, content 8.4 s, check 59.9 s, critique 13.7 s.

Homepage: hero-split:image-left › contact-strip:bar › price-list:grouped › image-text:image-left › cta:band (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 96/100/100/100 | 0 | ✓ |  | — |

### elektro-zupan

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 732 | 18 | 0 | 0 | 0.0007 | 1.7 s |
| brief | 1 | 3926 | 1382 | 0 | 0 | 0.0186 | 15.0 s |
| design | 1 | 8665 | 184 | 0 | 0 | 0.0165 | 2.7 s |
| content | 1 | 2375 | 1251 | 21583 | 0 | 0.0186 | 8.2 s |
| critique | 2 | 14435 | 1413 | 44484 | 0 | 0.0446 | 13.3 s |
| **total** | | | | | | **0.0990** | |

Stage wall times: classify 1.8 s, images 1.8 s, brief 15.3 s, design 2.7 s, content 8.3 s, check 61.5 s, critique 13.4 s.

Homepage: hero-signature:drawing › services-list:rows › steps:horizontal › service-area:list › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 99/100/100/100 | 0 | ✓ |  | — |

### frizerski-salon-mia

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 731 | 21 | 0 | 0 | 0.0007 | 1.5 s |
| brief | 1 | 3911 | 1254 | 0 | 0 | 0.0175 | 7.3 s |
| design | 1 | 8669 | 206 | 0 | 0 | 0.0167 | 3.6 s |
| altText | 1 | 2218 | 286 | 0 | 0 | 0.0063 | 4.8 s |
| content | 1 | 2500 | 1000 | 21583 | 0 | 0.0166 | 6.6 s |
| critique | 2 | 12884 | 1164 | 44484 | 0 | 0.0398 | 12.1 s |
| **total** | | | | | | **0.0976** | |

Stage wall times: classify 1.5 s, brief 7.6 s, design 3.6 s, images 13.1 s, content 6.6 s, check 55.7 s, critique 12.2 s.

Homepage: hero-signature:mirrors › price-list:grouped › team:photo › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### gostilna-pri-mostu

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 734 | 18 | 0 | 0 | 0.0007 | 1.6 s |
| brief | 1 | 3916 | 1312 | 0 | 0 | 0.0180 | 8.4 s |
| design | 1 | 8710 | 188 | 0 | 0 | 0.0166 | 3.2 s |
| altText | 1 | 2218 | 272 | 0 | 0 | 0.0062 | 4.4 s |
| content | 2 | 6664 | 2549 | 43166 | 0 | 0.0408 | 16.1 s |
| critique | 2 | 15033 | 1637 | 44484 | 0 | 0.0476 | 17.7 s |
| **total** | | | | | | **0.1299** | |

Stage wall times: classify 1.6 s, brief 8.7 s, design 3.2 s, images 14.3 s, content 16.1 s, check 57.1 s, critique 17.9 s.

Homepage: hero-signature:card › price-list:offers › products:plates › image-text:pair › team:list › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 96/100/100/100 | 0 | ✓ |  | — |

### gostisce-na-gricu

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 743 | 18 | 0 | 0 | 0.0007 | 1.4 s |
| brief | 1 | 3924 | 1362 | 0 | 0 | 0.0185 | 9.1 s |
| design | 1 | 8676 | 185 | 0 | 0 | 0.0165 | 2.6 s |
| altText | 1 | 2218 | 288 | 0 | 0 | 0.0063 | 4.4 s |
| content | 2 | 6653 | 2592 | 43166 | 0 | 0.0412 | 14.7 s |
| critique | 2 | 14142 | 1099 | 44484 | 0 | 0.0414 | 11.9 s |
| **total** | | | | | | **0.1246** | |

Stage wall times: classify 1.4 s, brief 9.4 s, design 2.6 s, images 17.2 s, content 14.9 s, check 60.1 s, critique 12.1 s.

Homepage: hero-signature:card › price-list:offers › products:plates › image-text:pair › team:photo › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 96/100/100/100 | 0 | ✓ |  | — |

### karoserija-hribar

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 743 | 20 | 0 | 0 | 0.0007 | 1.4 s |
| altText | 1 | 1134 | 109 | 0 | 0 | 0.0029 | 4.7 s |
| brief | 1 | 3936 | 1587 | 0 | 0 | 0.0204 | 12.5 s |
| design | 1 | 8700 | 197 | 0 | 0 | 0.0167 | 2.8 s |
| imageGen | 1 | 0 | 0 | 0 | 0 | 0.0679 | 20.4 s |
| content | 1 | 2775 | 1157 | 21583 | 0 | 0.0184 | 7.1 s |
| critique | 2 | 14160 | 1819 | 44484 | 0 | 0.0476 | 18.4 s |
| **total** | | | | | | **0.1747** | |

Stage wall times: classify 1.4 s, images 8.2 s, brief 12.9 s, design 2.8 s, imageGen 22.9 s, content 7.2 s, check 63.2 s, critique 18.7 s.

Homepage: hero-signature:photo › services-list:two-column › price-list:tags › image-text:image-left › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### mizarstvo-lesnik

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 732 | 18 | 0 | 0 | 0.0007 | 1.7 s |
| brief | 1 | 3930 | 1379 | 0 | 0 | 0.0186 | 9.3 s |
| design | 1 | 8657 | 216 | 0 | 0 | 0.0167 | 2.8 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 41.0 s |
| content | 1 | 2347 | 1611 | 21583 | 0 | 0.0216 | 10.6 s |
| critique | 2 | 15719 | 919 | 44484 | 0 | 0.0426 | 13.6 s |
| **total** | | | | | | **0.2361** | |

Stage wall times: classify 1.7 s, images 1.7 s, brief 9.7 s, design 2.8 s, imageGen 26.6 s, content 10.6 s, check 63.3 s, critique 13.8 s.

Homepage: hero-split:image-left › contact-strip:cards › services-list:two-column › image-text:image-left › steps:horizontal › about:text-only › cta:band (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### pizzeria-oljka

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 717 | 18 | 0 | 0 | 0.0007 | 1.6 s |
| brief | 1 | 3899 | 1311 | 0 | 0 | 0.0180 | 9.6 s |
| design | 1 | 8574 | 212 | 0 | 0 | 0.0166 | 2.6 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 38.0 s |
| content | 1 | 2263 | 1146 | 21583 | 0 | 0.0175 | 6.6 s |
| critique | 2 | 13744 | 1163 | 44484 | 0 | 0.0413 | 12.2 s |
| **total** | | | | | | **0.2298** | |

Stage wall times: classify 1.6 s, images 1.6 s, brief 9.9 s, design 2.6 s, imageGen 23.7 s, content 6.7 s, check 56.2 s, critique 12.5 s.

Homepage: hero-split:image-left › contact-strip:bar › menu:classic › image-text:image-left › cta:band (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 95/100/100/100 | 0 | ✓ |  | — |

### salon-tina

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 747 | 21 | 0 | 0 | 0.0007 | 2.0 s |
| altText | 1 | 1676 | 204 | 0 | 0 | 0.0046 | 3.4 s |
| brief | 2 | 9347 | 2722 | 0 | 0 | 0.0395 | 15.3 s |
| design | 1 | 8594 | 191 | 0 | 0 | 0.0164 | 2.7 s |
| content | 1 | 2249 | 1087 | 21583 | 0 | 0.0169 | 7.1 s |
| critique | 2 | 13374 | 1470 | 44484 | 0 | 0.0433 | 13.5 s |
| **total** | | | | | | **0.1215** | |

Stage wall times: classify 2.0 s, images 10.0 s, brief 16.1 s, design 2.7 s, content 7.2 s, check 73.4 s, critique 13.7 s.

Homepage: hero-split:image-left › contact-strip:bar › services-list:rows › image-text:image-right › booking:simple (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |

### vulkanizer-zorman

| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |
|---|---|---|---|---|---|---|---|
| classify | 1 | 776 | 20 | 0 | 0 | 0.0008 | 1.6 s |
| brief | 1 | 3987 | 1430 | 0 | 0 | 0.0192 | 9.1 s |
| design | 1 | 8635 | 190 | 0 | 0 | 0.0165 | 2.7 s |
| imageGen | 2 | 0 | 0 | 0 | 0 | 0.1358 | 34.1 s |
| content | 1 | 2631 | 1082 | 21583 | 0 | 0.0175 | 6.6 s |
| critique | 2 | 14059 | 1608 | 44484 | 0 | 0.0457 | 15.8 s |
| **total** | | | | | | **0.2354** | |

Stage wall times: classify 1.6 s, images 1.6 s, brief 9.5 s, design 2.7 s, imageGen 23.0 s, content 6.7 s, check 68.4 s, critique 16.4 s.

Homepage: hero-signature:photo › services-list:two-column › price-list:tags › about:text-only › contact:call-out (1 contact block).

| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |
|---|---|---|---|---|---|
| generated | 97/100/100/100 | 0 | ✓ |  | — |
