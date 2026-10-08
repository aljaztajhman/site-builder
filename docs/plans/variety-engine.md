# Variety engine: every business its own site

Status 2026-10-07: the free parts of Steps 0–3 are built; nothing is measured on real generations yet (that needs the paid twin run below), so `variety.families` and `variety.concept` stay off.
- Step 0 (measure): 12 twins in `tools/eval/twins/` (`--twins`), look distance (`tools/eval/src/look-distance.ts`), brand fit, motif fit, `--no-edits`. The variety report goes in `eval/variety-<mode>-<scope>.md`. Offline baseline over the 10 goldens: look distance across trades 0.61 (replay of the 2026-10-01 recordings 0.47), no colliding pair. Within a trade there is no number yet: it needs `pnpm eval --twins --no-edits --scope home` (paid, ≈ €2–3 with the batched judge).
- Step 1 (families): `packages/spec/src/families.ts` gives 3 palettes, 3 font pairs and 3 heroes per template and outline slots. Logo colours go into the template's roles. The template is offered beside two fitting directions. A seed from the site id breaks ties. The full sheet is `pnpm variety:sheet` (eval/look/families-*.jpg).
- Step 2 (neighbours, regenerate): `awayFromNeighbours` covers the same trade, same town first. "Ustvari znova" asks for another look and moves the seed. "Druga podoba" (decision `sb-druga-podoba` = one-plus-switch) is built behind the same switch: the editor's button re-dresses the same content in the next look of the family (palette, font pair, a hero that takes the same props; another skeleton with `variety.skeleton` on), no model call, each look a version. A signature hero keeps its hero until Step 5's section intents.
- Step 3 (concept), the free parts, behind config `variety.concept` (off; with it off every request is byte-identical to before, checked by replaying all ten fixtures on both branches):
  - spec v16: `business.subtype` (car repair: repair, tyres, bodywork; builder: plumbing, electrical, carpentry, roofing, painting; shop: deli, florist, boutique), validated against the type; migration 15 → 16 (v15 is Step 4's skeleton);
  - six sub-trade motifs drawn on their template's layout (`packages/spec/src/motif.ts`, `packages/components/src/motifs/trades.tsx`): wire, joint, tiles and strip on Cevi; stem and tag on Etiketa. Sites without a subtype keep byte-identical stylesheets. `pnpm motifs:sheet` renders them at 360 and 1280 px with axe; `MOTIF_TRADES` knows them;
  - the brief adds `concept` (subtype, goal, angle, signature fact, materials, local anchor; `packages/engine/src/concept.ts`). Code drops materials and an anchor that aren't in the client's text, a signature fact the client didn't give and a subtype of another type;
  - five homepage blueprints by goal (call-first, book-first, browse-first, visit-first, story-first) as outline slots that replace the template's fixed outline, in the template's own variants where it has them;
  - a signature device by fact and materials (call object, seal, week chart, poster, labels, offers, tags, figure, route line, rates, address card), placed right after the hero;
  - the design step is told the subtype, goal and angle; the subtype goes into the spec and picks the motif.
  - Not built: the paid twin eval (≈ €5). The critique prompt still lists only the template motifs' words.
- Step 4 (skeleton), free part built 2026-10-07 behind config `variety.skeleton` (off): spec v15 `design.skeleton` (`packages/spec/src/skeleton.ts`): 8 header families (today's 3 map one to one, plus centred, phone, overlay, word, compact; they differ on phones), phone actions by goal (bar, floating call button, the call in a sticky header), 4 footer families (columns, compact, wordmark, visit) with their own tone, section width, cards, buttons, dividers and photo ratio. One call button per screen is enforced in CSS and checked (`callButtonsPerScreen`, banned list). With the switch on the generator picks the skeleton from the seed and away from the neighbours (`pickSkeleton`), holds the primary hue and saturation and the section rhythm in code (`holdPrimary`, `holdRhythm`), drops a street-address eyebrow (and per seed any eyebrow), and prefers a family's photo hero for a hero-suitable picture. Alignment per section: at most one centred section per page (`design.skeleton.centred`: a short stack centred whole or a symmetric grid under a centred head, never long running text), picked per page in the seed's order or none (`pickCentred`). Contact sheet: `pnpm variety:skeleton` (27 looks on three goldens, every other one with a centred section per page). Turning it on needs the twin judge (≈ €6).
- Step 5 (design in parts), free part built 2026-10-08 behind config `variety.genome` (off): spec v18 `design.genome`, eleven axes (type, palette, ground, hero, header, footer, rhythm, imagery, shape, density, motif) with 15 compatibility rules in code (validation for a picked genome, a repair in `enforceDesign`), directions and templates as presets, section intents, the genome picked in code after the content step from the seed and away from the neighbours, and "Druga podoba" along the axes for every style. See "Step 5 as built" below. Contact sheet: `pnpm variety:genome` (38 looks on five goldens). Turning it on needs the twin judge (≈ €10).

Status: plan, 2026-10-04. Nothing here is built. Building waits for eval budget (HQ `meta/budget` is "spend nothing"), because every step changes what the model produces and has to be measured on real generations. HQ decisions: `sb-variety-approach` (which way), `sb-druga-podoba` (how owners see alternatives). Items: `it-variety-*` and the existing `it-sameness`, `it-hero-families`, `it-catalogue-sameness`.

The owner's worry (2026-10-04): "I don't want it to look like a template filler and that every avtoserviser would get a same-y looking site."

## Short answer

That is what the engine does today. Since the ten trade templates landed (spec v5 to v10), each business type has exactly one hand-made template. The template fixes the palette, the font pair, the type sizes, the header, the hero and the homepage outline: which sections appear, in what order, with which variants and tones. Two car repair shops get the same yellow number-plate site. Only the words and the photos differ.

Across trades, variety went up: the 10 goldens are 10 visibly different sites. Within a trade it went to about one look. That is the comparison owners will make. The go-to-market plan is one town, in person (`sb-first-market`), so the owners will see each other's sites.

## What fixes the look today (diagnosis)

Read from the code and the committed reports. No model calls.

| # | What | Where | Effect |
|---|---|---|---|
| 1 | One template per trade, named to the design step as "Choose it whenever the business fits its description" | `templateFor` in `packages/spec/src/directions.ts`; `templateLine` in `packages/engine/src/stages.ts` | All 10 business types map to a template: car repair → tablica, builder → cevi, bakery → skorja, and so on. A fallback direction is used only when there are too few photos (`minPhotos`: hairdresser 3, tourist farm 5, bakery/shop/restaurant/dental 1). |
| 2 | Template palette is fixed; the logo's colours are ignored | `designFromChoice` (`stages.ts`: `dir.template ? { ...dir.palette.fallback }`) | Every car repair shop is asphalt and signal yellow, whatever its logo. TASKS already notes that Pekarna Kvas keeps J's palette instead of its logo's. |
| 3 | Template outline is fixed | `templateOutline`: "these sections in this order, with these variants and tones, and no others" | Same sections, same order, same tones per trade. `pnpm templates:compare` shows the engine reproducing the hand-made page almost pixel for pixel (`eval/runs/templates-k`, `templates-r`). That was the goal of the template work, and it is also the problem. |
| 4 | Ten business types | `BusinessType` in `packages/spec/src/business.ts` | Electricians, carpenters and roofers are "builder" and are offered the radiator with hot and cold pipes. Florists and boutiques are "shop" and are offered bottle labels and an olive branch. Trades outside the ten (swimming school, photographer, cleaning) are forced into one of them. This is a risk, not a measurement: the design step may decline a template that doesn't fit, but nothing makes it. |
| 5 | Nothing steers away from what was already made | no seed; `awayFromShowcases` only avoids the landing showcases | "Ustvari znova" rebuilds from the same intake with the same prompts and nothing asks for a different look. On a template trade it lands on the same template, so the owner pays €0.09–0.43 for the same site. Two businesses in the same town and trade are never compared. |
| 6 | The brief holds facts, not a concept | `Brief` in `packages/engine/src/brief.ts` | It has a tone (one of six) and up to eight highlights, but no "what makes this business itself": its main goal, its angle, the one fact worth turning into an object, its materials. So copy is the only thing that can differ. |
| 7 | Design choices are bundled | `Direction` in `packages/spec/src/design.ts` | A direction fixes fonts (1–2 pairs), imagery, heroes (2), header, footer and rhythm together. There are 20 directions, 25 direction/font combinations and about 30 distinct first screens in total. Per trade that is about 1 when the template applies, and 3–4 when it doesn't. |
| 8 | A shared skeleton on every site | `packages/components/styles/base.css`, `chrome.css` | One container (76rem), left alignment only, one card style, three button kinds. Header variants differ only from 48rem up, so phones get the same header everywhere: logo plus an outlined "Meni" box. Footers have the same content (two variants), and the phone bar is the same "Klic / Navodila za pot". 6 of the 10 golden first screens open with the street address as the eyebrow. |
| 9 | Some rules exist only in the prompt | `layout.rhythm`, `primaryHue`, `primarySaturation` | Nothing in code holds them, so they drift towards the same choices. |
| 10 | We measure across trades, not within one | `tools/eval/src/homepage-metrics.ts` | The skeleton similarity compares the order of section types between 10 different trades. Nothing compares two businesses of the same trade, and nothing compares screenshots. The last full live run (2026-10-01) predates 7 of the 10 templates: similarity 0.63, judge distinctiveness 2 of 5 on 6 of 10 phones. Composition numbers were nearly identical across sites: 9 of 10 phones had 28–29 % photo share, every site had its first photo at 0.11–0.12 of the screen, and 9 of 10 phones had 3 buttons. No live run exists for templates R, T, K, L, O, N and P. |

## The principle

A site should be unique because it is about this business, not because something was randomised. Differences should come from these sources, in order:

1. **The business's own material:** its logo colours, its photos, its strongest fact, its story, its place and the materials it works with.
2. **A concept:** the business's main goal (call, book, visit, browse) and its angle decide the page's structure and its one signature object.
3. **Independent design choices** within rules that keep them coherent: type, palette, hero, header, rhythm, imagery, shapes and motif.
4. **A seed and a neighbour check** to break ties, so that two similar businesses, or a regeneration, never land on the same look.

Quality stays with the guards we already have: the banned list in code, contrast in code, composition targets, the judge and the fact check. The templates stay as presets. They are the best-looking points in the space, but no longer the only point for a trade.

## The steps

Each step is one PR and one eval measurement. Before a step merges, the twins' look distance has to go up and the per-site judge medians must not drop. Euro figures are eval costs at today's measured prices. The model cost per generated site stays within €0.01 of today in every step.

### Step 0. Measure sameness within a trade (prerequisite)

- **Twin fixtures.** Write 12 new descriptions (text only, free):
  - three more car repair shops beside avtoservis-mrak: a family tyre shop in Ptuj with no photos, a premium specialist in Ljubljana whose logo is blue, and a body shop that also tows;
  - three more hairdressers;
  - three more restaurants;
  - three businesses whose trade the templates don't fit: an electrician, a carpenter and a florist.

  These cover the go-to-market trades (restaurants, hairdressers, tradespeople) and the owner's example. They reuse different subsets of the 36 committed fixture photos, and at least one twin per trade has no photos.
- **Look distance per pair (free, offline, from spec and screenshots).**
  - From the spec: direction, font pair, palette (ΔE of primary, band and background), hero type and variant, header, and the edit distance of the section sequence including variants and tones.
  - From the first screen at 360 and 1280 px: a structural image distance and a colour histogram distance.
  - These combine into one look distance from 0 to 1, reported per trade and across trades.
- **Brand fit (free).** Whether a logo colour reaches primary, band or accent (ΔE).
- **Motif fit (free).** Whether the chosen motif belongs to the trade (lookup table).
- **Pairwise judge (paid).** One question per twin pair: "Would a visitor take these two for the same template?" It runs beside the existing six-criteria judge.
- **Eval flag `--no-edits` (free).** Today every live run also pays for 5 scripted chat edits per site, which is 40 % of a homepage run.
- **Targets.**
  - Look distance within a trade is at least today's distance across trades.
  - No twin pair shares palette, font pair and hero.
  - Judge distinctiveness is at least 3 on every site.
  - Judge medians don't drop below today's (3.2, and 3.7 on the template trades).
- **Eval cost.** Baseline on the current engine: 15 homepages ≈ €2–3 including both judges.

### Step 1. Templates become families, not pages

This is the biggest drop in same-trade sameness for the smallest risk.

- **Brand colours.** The logo's and photos' colours go into the template's colour roles (primary, band, accent) when they are usable. The trade palette becomes the fallback. Code already enforces contrast.
- **More options per template.** Each template gets 2–3 palettes, 2–3 font pairs that fit its character, and hero alternates. For tablica: the plate over a photo, the plate on a yellow band, or a type-only plate.
- **Outline slots.** The outline gets required, optional and one-of slots instead of one fixed list, so the page structure can follow what the business has.
- **No forced template.** The template stops being the forced first choice. The design step gets the template and two general directions that fit, and chooses by the business: premium or budget, photo quality, the logo.
- **Site seed.** A seed taken from the site id chooses among equally good options. The design call sees the options and may override the seed with a reason. The same site renders the same way every time.
- **Checks.** Twin eval; `pnpm templates:compare` stays green; judge medians hold.
- **Eval cost.** 2 iterations ≈ €5.

### Step 2. Regenerations explore, neighbours don't collide

- **"Ustvari znova".** It sends the current look (direction, palette, fonts, hero) as "make it different" and moves the seed on.
- **Neighbour check.** `awayFromShowcases` becomes `awayFromNeighbours`. It covers the sites already in the database with the same trade, the same town first. No two may share direction, palette family, font pair and hero.
- **"Druga podoba" (decision `sb-druga-podoba`).** The same content dressed in another look of the same family or a compatible direction. It needs no model call and shows instantly. The editor's "Slog" switch already swaps tokens without a call; this extends it to whole looks: hero, header and section variants.
- **Checks.** Unit tests (free); one twin eval with a regeneration per twin.
- **Eval cost.** ≈ €2.

### Step 3. The concept: what makes this business itself

- **Brief.** The same call adds:
  - `goal`: call, book, visit, browse, order or enquire;
  - `angle`: family history, a speciality, speed and availability, the place, craft or material, value, or the person;
  - `signatureFact`: which fact becomes the object, such as the phone number, the hours, the founding year, a price, a distance, the rooms or a place;
  - `materials`: 3–5 nouns from the client's own text;
  - `localAnchor`: the town, valley or landmark.
- **Design step.** It picks a homepage blueprint by goal: call-first, book-first, browse-first, visit-first or story-first. These replace one fixed outline per template. It also picks a signature device by the signature fact and the materials, not by the trade. The devices that exist today are the plate, receipt, seal, week chart, trail sign, label, menu card and wall-sized wordmark. New ones include a job ticket, a stamp, a route line and a figures band.
- **Motif library by sub-trade.** The pipes stay for plumbing and heating. New motifs: a wire line for electricians, a wood joint for carpenters, tile courses for roofers, a colour strip for painters, a stem for florists and a garment tag for boutiques. Each motif is about half a day to a day of CSS and SVG. Start with the trades most common in the first town.
- **Sub-trades.** The business type gets a `subtype`: car repair / tyres / bodywork; plumbing / electrical / carpentry / roofing / painting; deli / florist / boutique. The ten types stay for plans and blueprints. Spec bump and migration.
- **Cost per site.** The brief writes about 200 more output tokens and the design step about 150: under €0.005 per site.
- **Eval cost.** 2 iterations ≈ €5.

### Step 4. Break the shared skeleton

Component work. It is free to build and judged by screenshots.

- **Header families that differ on phones too:**
  - a centred wordmark;
  - the logo plus the phone number with no menu box;
  - transparent over the hero photo;
  - the menu as a word without a box (from `ideas.html`);
  - compact and sticky.
- **Hero formulas.** The eyebrow becomes optional per family. When there is one, it is not the street address by default.
- **The phone bar by goal.** The bar as today, one floating call button, or the action in the header.
- **Footer families.** A big closing wordmark, a map with the hours, or compact. The footer tone comes from the design, not forced dark under every motif.
- **Section level.**
  - Width: contained, wide or full-bleed.
  - One centred section allowed per page.
  - Cards: bordered, filled or none.
  - Buttons within the banned list: square, soft or underline-only.
  - Dividers: motif, rule or none.
  - Photo ratio as a design property.
- **Move prompt-only rules into code.** Rhythm, primary hue and saturation.
- **Checks.** Render tests at 360 and 1280 px for every new variant; contact sheet; banned-pattern tests; twin judge.
- **Eval cost.** 2 passes ≈ €6.

### Step 5. Split the design system into parts

- **Independent axes.** A direction becomes a set of independent choices:
  - type system;
  - palette strategy and page ground;
  - hero family;
  - header family;
  - footer family;
  - rhythm;
  - imagery;
  - shape language (radius, cut corners, arches);
  - density;
  - motif.
- **Presets and rules.** Directions and templates stay as named presets: good starting points and the landing showcases. Compatibility rules live in the spec: a dark ground excludes some imagery, uppercase only with heavy grotesks, and so on.
- **How choices are made.** The model chooses per axis with a reason tied to the concept, and the seed breaks ties.
- **Section intents.** Content is written against section intents (services, prices, story, hours, contact, gallery), each with several layouts. Changing the look then never needs a new content call. That is what makes "Druga podoba" and regenerating the look alone free.
- **Spec.** Bump and migration: today's sites map one to one from their direction.
- **When.** This is the biggest and riskiest step. Do it after Steps 1–3 have shown which axes carry the difference.
- **Eval cost.** ≈ €10: 3 twin iterations and one full 10-fixture run (€3).

#### Step 5 as built (2026-10-08, free part; where it deviates from the plan above)

- **What the genome stores.** Most axes already have a home in the spec, and storing them twice would let them disagree after an owner's or a chat edit: type is `design.fontPair` (its heading case, weight and tracking follow the pair's type system), ground is `colors.background`, imagery and density are the design's tokens, header and footer are `design.skeleton` (or `chrome`), the hero is the homepage's first section, and the motif follows the preset and the subtype (`siteMotif`). `design.genome` stores only what has no other home: `source` (preset or picked), `palette` (where the colours came from), `rhythm` and `shape`. `genomeOf(spec)` reads all eleven axes (`packages/spec/src/genome.ts`, `genome-rules.ts`).
- **Presets.** `source: "preset"` is a direction's own genome: the 17 → 18 migration writes it to every stored site one to one (the direction's rhythm, square or soft by the radius), the editor's style switch resets to it, and the direction's token ranges hold the design exactly as before; nothing renders differently (every page of every golden renders byte-identical HTML, `packages/render/test/genome.test.ts`). With the switch off the generator writes no genome at all, so every model request is as before; absent means the direction's preset.
- **Picked genomes and the rules.** `source: "picked"` replaces the direction's ranges with the rules: a type system per font pair (the weight, tracking and case ranges of every preset that uses it; uppercase only with a heavy grotesk at 600 or more), the radius within the shape (square ≤ 2 px, soft 3–12, cut ≤ 4, arch 4–12; no pills), a known ground, and 15 compatibility rules (`GENOME_RULES`): a dark page takes natural, framed, monochrome or full-bleed photos; cut corners no rounded or offset photos; arched tops natural or arched photos; rounded, duotone and arched photos only with soft or arched shapes; compact density only with a sans-serif heading and never with a flat rhythm; a header over the photo only over a full-bleed photo hero; the skeleton's buttons follow the shape; a trade motif needs a light page, natural or its template's own photos, square or soft corners, its family's font pairs and its outline's rhythm. Every preset satisfies them at both ends of its ranges (`packages/spec/test/genome.test.ts`). `enforceDesign` repairs a picked design into them, idempotently.
- **The motif stays with the preset.** A motif is drawn on its template's layout (signature heroes, motif sections), so in this version the motif axis is the preset's (and the subtype's); the type, palette, header, footer, density and corners of a template move, its motif, signature hero, rhythm and natural photos stay. Free motif choice needs motif CSS that doesn't assume the template's layout.
- **How it is chosen.** In code, not by the model (the plan's "the model chooses per axis with a reason" is left for when the twin judge has measured the code's choices): after the content step, `pickGenome` (`packages/engine/src/genome.ts`) takes per axis the values of every preset that fits the trade (curated points, mixed), in the site seed's order, the first combination inside the rules that is at least 4 of 11 axes away from every neighbour of the same trade. A logo keeps the design step's colours. Measured on the goldens: 7,200 valid combinations for the car repair shop, 21,000 for the builder, 6,048 for the bakery (logo, so one palette), 72–576 for the trade templates (about 5× each with the skeleton on: its 8 header and 4 footer families instead of the chrome's 3 and 2); 20 sites of one trade get 20 different genomes on every golden.
- **Section intents.** Every section type has an intent (`packages/spec/src/intents.ts`: hero, story, services, prices, hours, contact, gallery …); `asLayout` moves a section to another layout of its intent only when that layout's strict schema takes its props as they are (and per-variant rules hold). The genome and "Druga podoba" use it for the homepage hero (split ↔ photo hero, the two type-only heroes). What still needs a content call: a signature hero (each variant reads its props differently), a type-only hero to a photo hero, and layouts that share an intent but not a schema (services-list ↔ services-cards, about ↔ image-text, contact ↔ contact-strip). The content step is not yet told the intents (its prompt is unchanged, so requests stay byte-identical).
- **Shape in the page.** cut (one cut corner on photos and cards) and arch (arched photo tops, rounded card tops) render from `<body data-shape>` (`packages/components/styles/genome.css`) only for a picked genome; never on focusable elements, heroes' full-bleed photos or a generated picture (its label).
- **Druga podoba.** With `variety.genome` on, `POST /api/sites/:id/look` dresses every site (not only template families) in the next genome: at least 4 axes from the current one where the pools allow, away from the neighbours, the texts, photos and facts untouched, saved as a version. Each tap moves the seed by the current look.

### Step 6. Copy that doesn't repeat (runs beside Steps 1–3)

- **Catalogue wording that steers every site the same way** (`it-catalogue-sameness`): the eyebrow "e.g. the town or trade", contact-strip "right after the hero", cta "near the end".
- **Headlines carry one fact the client gave** (`ideas.html`). Section titles say something specific ("Kaj popravimo" instead of "Naše storitve"). No slogan shapes.
- **Copy similarity across twins (free).** Word overlap of headlines and section titles, with the Slovene judge (`it-slovene-copy`).
- **Eval cost.** ≈ €3.

## Order and money

| Step | What you'd see | Eval € |
|---|---|---|
| 0 Measure | A number for "same-trade sameness" and a contact sheet of 4 car repair shops side by side | 2–3 |
| 1 Template families | Car repair shops in their own colours, with different heroes and structures | 5 |
| 2 Regenerate, neighbours, Druga podoba | "Ustvari znova" gives a new look; a free look switch | 2 |
| 3 Concept | The page's structure and signature object come from the business's own facts; the right motif for electricians, carpenters and florists | 5 |
| 4 Skeleton | Headers, footers and phone bars differ; no longer the same phone frame on every site | 6 |
| 5 Design in parts | Thousands of valid combinations; looks change without a content call | 10 |
| 6 Copy | Headlines and titles specific to each business | 3 |
| **Total** | | **≈ 33–34** |

Recommended first approval: Steps 0–2 together, ≈ €10. They give the measurement and the largest same-trade gain without touching the spec's structure.

## What doesn't change

- The spec is the single source of truth.
- The banned list is enforced in code.
- Facts are never invented.
- The preview equals the published site.
- Contrast is enforced in code.
- Costs per generation stay within a cent of today's.

## Risks

- **Ugly combinations.** More freedom means more ways to combine badly. Mitigations: compatibility rules in code, presets as anchors, composition targets, and a judge gate on every merge.
- **Template quality.** The template trades scored 3.7, and they must not drop. The templates stay as presets, and only measured changes merge.
- **Spec growth.** Steps 3 and 5 bump the spec. Each bump needs a migration with a test.
- **Prompt caching.** The section catalogue grows. Keep the static parts byte-stable.
- **Editor.** Switching looks must keep the owner's content and edits. `offeredVariants` already hides layouts a section can't fill.
