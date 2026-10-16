# Design direction for Design 5 · Structures (October 2026, Fable, design director)

Written by Fable 5.1 (FABLE: project-design) on 2026-10-15, from:
- the shoot-out: today's pages 3.47, picture studio 2.86, Fable studio 2.98, distinctiveness 3.45 / 3.20 / 3.58;
- the whole-set rounds: every set, the 50 Review 50 pages included, got 2–3 for variety;
- the contact sheets in eval/outside-review/shootout-sets and shootout-sets-after50.

The text below is Fable's, unedited apart from the headings.

## 1. Diagnosis: why ten pages read as one

The split hero is only the symptom. Every page shares five fingerprints, whichever studio made it:

- **One scale.** A headline of about 52 px broken into 3 lines, a grey 15 px paragraph and a 36 px button, all in the same 45 % column, starting about 60 px below the header. Text fills a third of the hero's height; the rest is dead white or dead black. Nothing is ever huge, and nothing is ever small on purpose.
- **One stack.** Eyebrow → headline → paragraph → filled button + underlined link, in every hero and again in every section.
- **One image role.** A single rectangle (or arch/circle mask) of the same size and position. It never bleeds, is never cropped tight, never serves as texture, and never comes in twos. Tabletop still lifes make a cheese dairy and a watchmaker the same lifestyle brand. Thin 1 px line icons make four dark pages interchangeable.
- **One chrome.** A hairline header with the wordmark and a lone "Domov", an outlined "Meni" button, and the same Klic + Navodila bottom bar on all ten phones.
- **One sequence.** Hero → service list → hours, each section a split again, and no second moment on the page.

Colour and font pairs vary; nothing else does. That is why the visual distance stays at 0.57 for every approach: the art director's intent dies at the layout layer.

## 2. First-screen structures to add (trade-neutral)

The designer picks the structure first, then type, then colour.

1. **Poster.**
   - 1280: headline at 7–9 vw (about 100–130 px), at most 2 lines, spanning at least 8 of 12 columns. Below it, one line of facts (place · hours · phone) in body size. No image, or a small 3-column inset at the bottom right.
   - 360: a 44–52 px headline over 3 lines, the facts line, then the image.
   - Suits: confident one-sentence offers, no or weak photos, service trades.
2. **Full-bleed photo with type band.**
   - 1280: the photo fills 80 vh, cropped tight with the subject off-centre (crop code enforces the rule of thirds). The headline sits in a solid band pinned to the bottom, or down the left 5 columns.
   - 360: photo at 55 vh, band below.
   - Needs one photo that passes the quality gate. Suits places: gostilna, farm, salon, workshop interior.
3. **Magazine columns.**
   - 1280: headline in columns 1–7 at the top, body and action in columns 9–12 at the bottom, and a tall portrait image in columns 8–12 at the top, deliberately offset vertically.
   - 360: headline, image, body.
   - Suits: ateliers, practices, anyone with a vertical photo.
4. **Strata.**
   - 1280: three full-width bands: a thin facts strip, a huge headline band, and a photo ribbon (one panorama, or 3 tight crops in a row).
   - 360: the bands stack and the ribbon becomes a horizontal scroller.
   - Suits: several mediocre photos.
5. **Mosaic.**
   - 1280: a 12-column grid of 3–5 unequal cells. The headline fills one cell as a solid-colour tile; photos fill the others edge to edge.
   - 360: a 2-column grid, headline tile first.
   - Suits: 3 or more photos (food, hair, products, rooms).
6. **Colour field with window.**
   - 1280: a solid field fills the viewport, one small photo "window" (at most 30 % of the width) sits off-grid, and the headline is large.
   - 360: the same, with the window below.
   - Suits: no-photo or logo-strong brands. Replaces the dark pages with line icons.
7. **Ledger.**
   - 1280: headline in columns 1–5; columns 7–12 hold a ruled table of the 4–6 services, prices or hours as the hero's visual. No image.
   - 360: the table below the headline.
   - Suits: accountants, translators, repair shops, anyone whose offer is a list.
8. **Split, kept but gated.** Only with a photo that passes the gate: 60/40 asymmetric, the headline overlapping the image edge by at least 48 px, and the image bleeding to one viewport edge.

**Chrome variants:**
- Three headers: a hairline wordmark; a tall masthead with a facts row; a tinted band with the nav.
- Three phone actions: today's bar; a single floating call button; none, with the phone in a sticky header.

## 3. Choosing

**Inputs, in order:**
1. Photo inventory: count, plus a computed quality score (sharpness, subject size, people/premises/work vs tabletop).
2. Whether the offer is a place, a product, a person or a list.
3. Brief tone on three axes: loud–quiet, warm–cool, traditional–modern.
4. Logo shape.
5. The **set registry**: the structures, header variants and type voices of the last N sites in the same trade and town.

**Hard rules:**
- No two sites in one trade or one town share the same structure, header and type voice.
- In any set of ten, no structure covers more than 25 % of the pages.
- The designer samples with a penalty from the registry, not by preference.
- Regenerating the same brief must change the structure, not just the colour.

## 4. Imagery

- **Client photos are the only hero subject.** The quality gate decides whether a photo may carry a full bleed, a window, or only a thumbnail.
- **AI pictures:**
  - only textures, materials and landscape, at window or ribbon size;
  - never the hero's main subject;
  - never a drawing of the trade's object (dog, cheese, bike), which is what got the clip-art verdict.
- **Drawn art:** only when the direction is illustrated and the drawing is bold, filled and two-colour. Retire thin single-weight line icons.
- **The AI label:**
  - one caption per picture in the eyebrow style, below the image or in the gutter ("Slika ustvarjena z UI");
  - never a chip over the photo, and the alt text keeps the label;
  - a caption is part of the type system and meets Art. 50 at least as clearly as a badge. *Owner decision needed before changing the label.*

## 5. Setup

**Recommended: a hybrid.**
- Fable (or Opus xhigh) writes a composition brief: the structure, scales, crops, type voice and the second moment.
- Opus builds the spec against the enlarged library.
- Sonnet's picker stays for free previews.

**Not recommended:** the picture studio. It pays for the imagery reviewers dislike most.

**Order:** any director is wasted until the library can express what it asks for. Ship the structures first, then re-run all three setups.

**What would change this:** Fable-direct still scoring 3 or lower for variety with the new library, or a photo-realistic mockup studio reaching imagery of 3.5 or more for under €0.10 a page.

## 6. Below the fold

1. **A second moment:** one oversized element between the hero and the lists (a photo ribbon, a big price ledger, a designed hours/contact block), so the page has two beats.
2. **A scale system:**
   - body text 17–18 px and section headings 40 px or more;
   - section heights that vary;
   - the eyebrow-headline-paragraph stack used at most once per page.
3. **Contact and hours** as one designed block, shown once; the footer carries only the legal line.

## 7. Measure

**Per page:**
- reviewer mean ≥ 3.8 at both widths;
- the first screen at 360 px shows the headline, one action and one fact without the bar.

**Per set:**
- variety ≥ 4 from two of three reviewers;
- mean pairwise visual distance ≥ 0.70;
- no structure on more than 25 % of the pages;
- no two pages with identical chrome;
- no AI chips over photos;
- fewer than 5 build defects per ten pages.
