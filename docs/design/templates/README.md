# Design templates: what a generated site should be able to look like

Nineteen hand-made homepages, one per idea, as targets for the engine. Ten cover the product's trades with the eval fixtures' own facts and photos (J to T, in this folder). Nine are variations for one swimming school (A to I, in `../swim-landing/`). None of them is engine output; they are plain HTML and CSS, responsive, without JavaScript. Implementing them in the engine is a separate task.

- Canvas with every template at 1440 px and 390 px: https://claude.ai/artifact/GBMesX76huidKKUswuk1i5 (private to the owner; page "Predloge po dejavnostih" holds J to T, page "Šola plavanja" holds A to I)
- First screens side by side: `first-screens-1.jpg` (J to O), `first-screens-2.jpg` (P to T), and `../swim-landing/first-screens.jpg`, `first-screens-2.jpg`
- The same list as data: `templates.json` (trade, fixture, fonts, colours, hero family, motif, sections, photos needed, rule notes)

## Why these exist

The owner showed a generated swimming-school site and called it "default WordPress": a 46 px headline in a half-empty split, a lavender ground, one photo in an arch. After two rounds for that one school the owner asked for templates across trades and themes to train the engine on (2026-10-01).

## The templates

| | Name | Trade (fixture) | Also fits | The idea in one line |
| --- | --- | --- | --- | --- |
| J | Skorja | Bakery (`pekarna-kvas`) | pastry, butcher, coffee roaster, any maker of food | Dark roast hero, the product in an oven-arch photo that runs off the bottom edge, prices on a ruled board |
| K | Jedilnik | Inn (`gostilna-zlata-zlica`) | restaurants, wine cellars, guest houses | The site as a printed menu: a framed menu card over a full-bleed photo of the house, dishes as round plates, big brass prices |
| L | Ogledalo | Hairdresser (`frizerstvo-lana`) | beauty, nails, barbers, tailors | The name as a wall-sized blush wordmark behind three photos in mirror arches; price list set like a masthead |
| M | Tablica | Car repair (`avtoservis-mrak`) | tyre shops, towing, locksmiths, any trade that lives on calls | The phone number as a Slovenian registration plate with the town's code; prices are plates too |
| N | Markacija | Tourist farm (`kmetija-grabnar`) | rooms, huts, guides, outdoor tourism | The view fills the screen; destinations hang on a red trail signpost; a mountain ridge cuts the sections; photos as a mosaic |
| O | Nasmeh | Dentist (`zobozdravstvo-lebar`) | doctors, vets, opticians, pharmacies | Calm on purpose; the reassuring fact is the headline; surgery hours drawn as a week chart |
| P | Pregib | Physiotherapy (`fizioterapija-pregib`) | coaches, therapists, tutors, anyone selling appointments | The logo's bent line becomes the page; folded-corner photo and cards; numbers set huge; booking always in reach |
| R | Račun | Accountant (`racunovodstvo-seliskar`) | lawyers, notaries, insurance, translators | No photos: the hero object is a paper receipt listing what the office does; the founding year as a wall-sized number |
| S | Cevi | Installer (`instalacije-rebernik`) | electricians, roofers, builders with nothing to show yet | No photos: a drawn radiator fed by a red and a blue pipe; the pipes run on as dividers, step line and service-area map |
| T | Etiketa | Deli shop (`trgovina-oljka-in-sol`) | wine, honey, farm shops, gift shops | Everything set like a bottle label: a framed label card for the headline, each product on its own label with the price |
| A–I | see `../swim-landing/README.md` | Swimming school (no fixture) | sports clubs, classes for children | Nine takes on one brief, from an underwater photo hero to a headline half under a moving waterline |

## What all of them do that the generated page did not

These are the rules to learn, more than any single layout.

1. **The strongest fact is the biggest thing on the first screen.** Opening time, phone number, price, a promise the owner actually made ("prvi obisk je le pogovor"). It is an object (tile, plate, sticker, signpost, receipt), not a sentence in the lead.
2. **One motif from the trade, drawn in code, used three or four times.** Scoring cuts, a brass spoon, mirror arches, a number plate and tyre tread, trail signs and a ridge, a smile arc, a bent limb, a torn receipt, pipes, a bottle label. It replaces icons, gradients and stock ornaments.
3. **Colour comes from the business.** From its logo where there is one (L, P, J), from its name (K: zlata žlica), its material (J crust, T olive and terracotta), its equipment (swim templates) or its landscape (N). Never an unowned pastel.
4. **Display type is three to six times the body size**: 84 to 136 px on desktop, 40 to 56 px on a phone, leading 0.9 to 1.0. Prices and phone numbers are set at headline size, not body size.
5. **Photos take a shape that means something** (oven arch, plate, mirror, porthole, doorway, folded corner) and run off an edge or overlap the next section. No small centred rectangle.
6. **Sections change ground, not just content**: a dark or saturated band at least twice per page, and one section that looks unlike the others (the week chart, the plates, the receipt, the mosaic).
7. **Prices and hours are designed, not listed**: dotted leaders, plates, tickets, labels, a chart. A missing price is a marked placeholder in the same slot.
8. **One primary action per screen**, named for what happens (Rezervirajte mizo, Naročite se, Pokličite za ogled), and on a phone a call bar that stays at the bottom.
9. **Templates for owners without photos are designed as such** (R, S, and E and B in the swim set): the first screen is type, colour and one drawn object.

## Per template

Each entry lists what the engine would need. Fonts are all from the repo's 19 subset fonts.

### J · Skorja
- Type: Bitter 900 display, Karla text. Colour: roast `#24130a`, wheat `#f4b942`, flour `#f1e2d2`, crust `#8a4a1c`, white page.
- Hero: dark ground, headline at 106 px, photo in an arch (radius 999 px top) aligned to the hero's bottom edge, round wheat seal with the opening time overlapping the arch.
- Motif: three scoring cuts (from the logo) as section marker.
- Sections: price board with dotted leaders; wheat band for the Friday and Saturday special with its own button; dark "how we bake" with three facts; the owner's own sentence as a pull quote; hours and orders side by side.
- Needs one good product photo; works with three.

### K · Jedilnik
- Type: EB Garamond 600 display, Figtree text. Colour: bottle green `#16382b` / `#0f2a20`, brass `#d2ab55`, white.
- Hero: full-bleed photo of the house, white menu card (inner brass rule) laid over it and hanging 72 px into the next section.
- Motif: a brass spoon, from the name, as brand mark and divider.
- Sections: green band with the two daily offers and prices at 108 px; three dishes as round plate photos with name and price; ruled list for dishes without a price; terrace with the seat count as a 176 px numeral and a second photo overlapping; family; hours and reservations with the phone at 92 px.
- Needs a wide exterior or interior photo; plates need top-down food photos.

### L · Ogledalo
- Type: Inter Tight 800 display, DM Sans text. Colour: wine `#7a2e3a`, blush `#f6e3e7`, dark `#2b1418` (the salon's logo colours).
- Hero: the name at 500 px in blush behind everything; three portrait photos in arches of different heights; headline at 104 px on the left.
- Sections: wine band with the booking sentence and the number; "Cenik" at 176 px beside a ruled price list; team on blush with an arched interior photo and a small arch overlapping it; hours and phone at 96 px.
- Needs three portrait-able photos.

### M · Tablica
- Type: Archivo 900 uppercase display, Public Sans text. Colour: asphalt `#15181c`, signal yellow `#ffcc00`, plate blue `#0b3fa8`.
- Hero: full-bleed workshop photo under a flat 72 % overlay, headline at 122 px, the phone number as a registration plate (blue strip, town code, number) that is the call link.
- Motif: plate; tyre-tread strip (SVG pattern) between sections.
- Sections: yellow fact strip; services as a two-column list with square bullets; prices as four plates; tyres; yellow closing band with the plate at 112 px.
- Works without photos (flat asphalt hero).

### N · Markacija
- Type: Fraunces 900 display, Nunito Sans text. Colour: forest `#1d3a2a`, trail red `#c8202a`, meadow `#eaf3e4`.
- Hero: full-bleed view under a flat 42 % overlay, headline at 120 px, a wooden post with three red arrow signs (CSS clip-path), white ridge silhouette as the bottom edge.
- Motif: the trail blaze (red ring, white centre) as bullet and brand mark; ridge path as section edge.
- Sections: rooms with two prices at 92 px; five-photo mosaic edge to edge; breakfast statement on meadow; red weekend band with the hours at 80 px; trails and directions; hosts and reservations on forest.
- Needs one landscape photo; rewards many.

### O · Nasmeh
- Type: Figtree 800 display and text. Colour: teal `#0c7a70`, deep `#0f2f38`, mint `#dff4ee`, coral `#ff7a66`.
- Hero: white, headline at 86 px, round photo on a mint disc with a coral arc under it and a tilted note chip.
- Signature: surgery hours as a week chart (a 12-column grid from 7.00 to 19.00, one bar per day) on mint. On a phone the scale hides and each bar keeps its label.
- Sections: services with small arc bullets and a dark note about self-pay; team with a round and an arched photo; teal contact with the phone at 112 px.

### P · Pregib
- Type: Bricolage Grotesque 800 display, Public Sans text. Colour: teal `#0f6b63`, orange `#e0833a`, dark `#10302d`, mist `#e6f2f0` (the logo's colours).
- Hero: a 150 px-wide pale limb that bends at an orange joint behind the headline (one SVG path), headline at 102 px, photo with a folded corner hanging into the next section.
- Sections: four facts as 80 px orange numbers on dark; complaints as folded-corner tiles; methods as one 50 px sentence; four price cards with 76 px prices; teal booking band; three-column contact.
- Two actions on the phone bar: book online, call.

### R · Račun
- Type: IBM Plex Sans 700, tabular figures. Colour: ledger green `#0b5a3c`, dark `#0c2a1e`, mint `#e4f1ea`, red ink `#c2362b` for the double rule only.
- Hero: headline at 88 px on white; right 38 % solid green with a tilted white receipt (dashed rows, check marks, double total line, zigzag torn edge as an SVG path).
- Sections: the three client types at 136 px; services as ledger rows; the founding year at 268 px; dark contact with the phone at 124 px.
- No photos, no hours, no prices in the brief: none are shown or invented.

### S · Cevi
- Type: Space Grotesk 700 display, Public Sans text. Colour: ink `#101820`, hot `#d63c22`, cold `#1f6fe0`, steel `#e6ebf0`.
- Hero: headline at 100 px, the phone number in a red block at 68 px with the owner's call-back promise under it, a radiator drawn in SVG with a red feed pipe and a blue return pipe.
- Motif: the two pipes as a full-width divider (SVG pattern with flanges), T-joint glyphs as bullets, a red line with valves for the three steps, a blue line with stops for the service area.
- Sections: services; blue subsidy band; steps; towns; dark contact with the number at 196 px.
- No photos, no e-mail, no hours in the brief: none are shown or invented.

### T · Etiketa
- Type: Lora 700 display, Karla text. Colour: olive `#414f1f`, terracotta `#b9492f`, leaf `#e9eeda`.
- Hero: olive ground, a white label card with a double inner rule and an olive branch drawn in SVG, photo in a tall arch with a round photo overlapping it.
- Sections: three product labels (name, quantity, price at 64 px, text centred as on a bottle); the rest of the range as one 46 px sentence; terracotta gift-box band with a round photo; shop front in an arch with hours; olive contact.

## Facts, placeholders and photos

- Every stated fact comes from the fixture's `brief.json`: names, addresses, phones, prices, hours, people, legal data. Slovene formats are used (`6.30`, `4,20 €`).
- Missing facts are yellow dashed placeholders: prices the owner did not give (J žemlje and polži, K ričet and pečenke, L prameni and fen frizura) and legal data where the brief has none (J, L, M, N). Where the owner said a thing does not exist or should not be shown (M and S have no e-mail; R and S no hours or prices; O no prices), nothing is shown.
- Photos are the fixtures' own (`tools/eval/fixtures/*/photos`, generated stand-ins from PR #23 that the eval treats as the owner's). They carry no "Ustvarjeno z UI" badge here for that reason. No picture was generated for these ten templates.

## Where they step outside rules I know of

Checked against docs/PRODUCT.md and docs/design/ideas.html, not against the component library or the stylesheet test.

- None uses gradients, glass, emoji, italics, numbered labels, monospace or pill buttons. All dividers and objects are inline SVG or CSS shapes; photo overlays are one flat colour (M, N).
- Radius above 12 px: arches and discs for photos (J, L, O, T, K plates), O's chart tracks (14 px) and note (20 px).
- Rotated elements: J seal, N signs, O chip, R receipt. Flat offset shadow on R's receipt.
- Uppercase headings in M (ideas.html allows them in Bold Local and Industrial).
- Centred text inside T's product labels and label-like cards only; sections are left-aligned.
- CSS `clip-path` for N's arrow signs and P's folded corners; `text-wrap` is not relied on.
- K's hero card, R's receipt and T's label are text containers laid over or beside a full-bleed element; they are not cards-in-cards.
- L's wall wordmark and E's submerged line (swim set) are decorative duplicates of text, marked `aria-hidden`.

## In the engine (M, S and J, spec v4)

Owner's decision `sb-landing-directions` = start-three (2026-10-02). M, S and J are design directions `tablica`, `cevi` and `skorja` in `packages/spec/src/directions.ts`, each with a `template` block: the motif, display and h2 sizes, the trades it is the first choice for, the photos it needs and the homepage outline the content step follows.

- Spec v4 (additive migration): the `band` tone with optional `band`/`onBand` colours (contrast checked like the others), heading weight up to 900, the `hero-signature` section (variants photo, drawing, arch; the fact shown is the phone or the earliest opening time, always from the business facts), price-list `tags` and contact `call-out`.
- Rendering: `<body data-motif>` and `packages/components/styles/motifs.css`; the motif's repeating pieces (tyre tread, pipes, T-joints, scoring cuts) are SVG images that `packages/render/src/tokens.ts` builds from the site's colours. Plate, seal and radiator are components in `packages/components/src/motifs/`.
- Pipeline: the design step is told the trade's template; a template keeps its own palette; the content step gets the outline; the header is set in code (dark over a dark hero unless there is a logo, no header call button above a phone object); a template that draws (S) gets no generated pictures.
- Still outside the rules above and not built: clip-path shapes (N, P), the templates K, L, N, O and P, the swim set's motion and photo-filled type, logo colours for template palettes.

## In the engine (R and T, spec v7)

R and T are directions `racun` and `etiketa` (branch claude/templates-rt). Compare them with `pnpm templates:compare R,T`: it renders the hand-made page and the fixture's golden spec through the engine at 1440, 1280, 390 and 360 px, checks the engine's page and writes first screens side by side to `eval/runs/templates-<letter>/`.

- Spec v7 (additive migration): hero-signature variants `receipt` and `label`, fact `address`, optional `receipt` and `inset`, and `factLabel` optional (validation still requires it for a phone or an opening time); highlights `figures`; about `figure` with an optional `figure` (the client's own number); image-text `round`; opening-hours `photo` with optional `image` and `inset`.
- R draws a paper receipt (check marks and a torn edge as SVG tokens in the site's colours, the offset shadow as a layer, not a box-shadow; the red double rule under the name is the motif's fixed ink). T draws a bottle label (a double inner rule in the ground colour, an olive branch as an inline SVG in the site's colours) and sets each priced product on its own label; text is centred inside those labels only.
- Photo shapes: `.arch-top` and `.disc` in motifs.css, the only round shapes allowed besides drawn objects; a test keeps them off buttons and links.
- A template may list the colour pairs it sets as text (`textPairs`, e.g. Račun's green figures on white); they are held at 4.5:1 by checkDesign and enforceDesign.
- Pipeline: hero variants that draw (drawing, receipt) get no generated pictures; the design and critique prompts name every template from the directions list.

## Checked

All ten rendered in Chromium at 1440 × 900 and 390 × 844, as plain HTML and through the canvas's own runtime: no horizontal scroll, no failed requests or broken images, every button, call link, plate and bar link at least 44 px tall on the phone. Contrast computed for 69 text and background colour pairs: lowest 4.64:1 (S, white on the red block, after darkening the red from 4.01:1), all others 4.76:1 or more. White text over the photo overlays in M and N is not measured per pixel. Not checked: axe, Lighthouse, other browsers.
