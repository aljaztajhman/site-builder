# Mockup spike: AI homepage picture → composition language (2026-10-11)

HQ `it-studio-mockup-spike`. Owner's idea: let the best image model design the homepage as a picture, then rebuild it cheaply in our spec so the CMS, the editor and the fact rules stay. Evidence: `docs/design/mockup-spike/sheet.jpg` (row 1 every mockup, row 2 the two recreations). Scripts: `tools/eval/src/mockup-spike.ts` (fal calls, ledger `eval/runs/mockup-spike/cost-log.jsonl`), `mockup-recreate.ts`, `mockup-sheet.ts`. Businesses: pekarna-kvas (real fixture photos and logo as references) and an invented tattoo studio "Rja", Maribor (`eval/runs/mockup-spike/tattoo-brief.json`, marked invented, no photos). Same prompt for all: the exact Slovene texts, "original, art-directed, no template, no stock, invent nothing".

## Models (18 images, €1.07 booked of the €1.20 cap)

| Model (fal endpoint) | € / image | s / call (2 images) | Verdict |
|---|---|---|---|
| GPT Image 2.5 (`openai/gpt-image-2.5/flare/edit`, high, 1536×1024) | ≈ 0.086 (token-billed; booked estimate) | 17–22 | **Best.** Every word exact, incl. č/š/ž and hours; uses the client's photos recognisably (re-rendered, not pasted); tattoo artwork genuinely good. Usable as a design target as is. |
| Nano Banana 2 (`fal-ai/nano-banana-2/edit`, 1K) | 0.069 | 13–23 | Second. Text mostly right, editorial grids; one adds "Opening Hours/Thone" in English and a hand, one draws the page as paper on a desk, one has garbled text at the cut-off foot. 1264×848 only. |
| Seedream 5 Lite (`bytedance/seedream/v5/lite/*`) | 0.030 | 99–145 | Unusable: garbled Slovene ("Kruh z drožnis"), wrong phone (091…), English headings. |
| Ideogram 3 (`fal-ai/ideogram/v3`, balanced; no photo input) | 0.052 | 14–15 | Unusable: renamed the bakery "Kruš", invents a cartoon baker, gibberish body text. |

## Verdict 1: do the mockups clearly beat our pages?

**Partly.** For the tattoo studio, a business outside our ten trades, yes, clearly: a coherent, specific art direction (engraved peony and swallow, rust sun, four drawn service marks) that our pipeline cannot make at all today. For the bakery, no: GPT's page is clean and correct but conventional (cream paper, serif, photo grid, brown footer bar). It is on par with hero-bar A/B, not above them, and below C (the linocut) for character. Both GPT and Nano default to a **cream ground and a warm serif**. That is the look our banned list (PRODUCT.md, `isCreamOrOffWhite`) exists to stop. The model is a strong layout and art generator, not a source of taste, so it still needs our rules as a filter.

## Verdict 2: can the composition language recreate them?

**Yes for layout and facts, with gaps.** I wrote both as an Opus director call would: one preset per section (hero, products or services, contact band) with slot markers, filled by `fillPreset` from the fixture's business, brief and copy, plus tokens. No hand HTML. Both validate and render at 1280 and 360 px: axe 0/0, no horizontal scroll, one h1, at most 1 call button per screen. The bakery recreation is close to its mockup: headline left, shelf photo bled right, list beside two photos, brown facts band. The tattoo recreation keeps the hero and the facts row. The mockup's artwork is cut out (no text, people or premises), its paper lifted to white, and it is shown as a labelled AI image ("Ustvarjeno z UI").

**Gaps found (what it would take):**
1. **Generated images only in the opener** (validateSite). The tattoo mockup's four service drawings could not be placed. Fix: allow labelled `origin: generated` art in any section when it shows no people, premises or work (a guard change plus a rule in PRODUCT.md).
2. **Drawings are a closed list** (`DRAWINGS`, 26 ids). Mockup art can't become a decor drawing. Fix: a per-site drawing slot (vectorise the cut-out, or store it as a site asset the decor element may reference).
3. **No tattoo business type** (10 `BusinessType`s). The studio had to sit under "hairdresser". The owner wants any business: make type open, or add a generic `service` type with its own wording.
4. **Directions bind fonts, radius and imagery treatment** (e.g. warm-craft forces offset-block and radius 4–8; editorial forces a frame around the art). A mockup's type and corners rarely match one direction. Fix: let a composed page set tokens within the global ranges, with direction as a default, not a lock.
5. **Cream ground banned**, so both recreations are on white. Correct per our rules, but it is the mockups' main mood. Either keep the ban and tell the image model "white or a strong colour, never cream", or allow a textured paper surface.
6. Smaller ones: running text must span ≥ 4 columns (no 4-across service blurbs); the action bar plus a section call button break "one call button per screen" on phones; nav shows only "Domov" on a one-page site; no background removal for cut-outs.

## If productised: € per site

GPT Image 2.5 desktop mockup €0.09 (2 candidates €0.17) + Opus vision recreation (≈ 6k input incl. the image and cached catalogue, ≈ 8k output with thinking: ≈ €0.17) + one revise round (render plus mockup in, ≈ 5k out: ≈ €0.10) ≈ **€0.35–0.45 per homepage**. These are estimates. Actual fal charges for the token-billed GPT endpoint were not readable (the billing API needs a billing key), so the ledger books $0.10 per image.

## Legal notes

The mockups use the client's own photos as references, so the page photos must stay the client's originals: the recreation does this, while the mockup's re-rendered photos are never published. Art cut from a mockup is AI-made and goes on the page labelled, like today's AI pictures. Cut only decorative art: never people, premises, signs or text. fal states commercial use is allowed for these endpoints; Nano outputs carry SynthID. Invented fixture data (Rja) is marked and never published.

## Recommended pipeline

1. Brief → GPT Image 2.5 edit (client photos and logo as references, exact Slovene texts, our banned list in the prompt: no cream, no invented people) → 2 desktop candidates; the owner or an Opus judge picks one.
2. Opus vision: mockup + composition catalogue → presets per section, facts via slots, tokens → `validateSite` + render 1280/360 + checks.
3. One revise round: Opus compares the render with the mockup and patches the presets.
4. Decorative art cut from the mockup → labelled AI asset.

Next step: fix gaps 1–4 (open business type, generated art beyond the opener, per-site drawing, tokens unlocked from directions), then a paid 5-fixture run of steps 1–3 with a real Opus call, measuring € and judge scores against the hero bar.

## Spike 2: Opus art-directs, GPT Image paints (2026-10-11)

Question: with an Opus art director in front, do the mockups stop being conventional and become unique per business, and still rebuildable? Evidence: `docs/design/mockup-spike/sheet-2.jpg`. Scripts: `mockup-director.ts` (one real Opus 5.5 call per business, config `models.fullBuild` at effort medium, structured output, the client's photos and logo sent as images, our banned list and the owner's taste in the system prompt), `mockup-spike.ts --spike2`, `mockup-recreate2.ts`, `mockup-sheet2.ts`. Businesses: pekarna-kvas, the tattoo studio Rja and an invented florist, Cvetličarna Šipek in Novo mesto (`eval/runs/mockup-spike/florist-brief.json`, marked invented, no photos).

**Directions** (the director's own words, shortened):
- Pekarna A "Nočno vzhajanje": a night-blue page lit by the loaves, the logo's three scores as long wheat slashes. B "Polica" (rebuilt): white page, the daily breads stacked as giant condensed words on oak planks, like Jure's shelf.
- Tattoo A "Rust line" (rebuilt): the name as the ground, a deep rust field crossed by one unbroken off-white hairline that becomes a fern, then a swallow, then underlines the phone. B "Osnutek": every drawing twice, a grey draft under the final rust line, on white.
- Florist A "Rosehip Red" (rebuilt): one saturated hip-red field crossed by a drawn dog-rose briar. B "Week Print": deep garden green, a two-colour linocut of this week's stems, the hours as a week strip.

**Verdict: yes.** All six are distinctive, none is cream with a warm serif, and each could only belong to its business. The bakery's "Polica" and the florist's briar clear the hero bar's A, B and G and sit with C, the linocut, for character. The tattoo's "Rust line" is the strongest page either spike made. Text stayed exact in all six. Slips:
- Florist B repeats "Pon–pet" five times in its week strip.
- Pekarna B has slight halos around the headline.
- The phone mockup is a narrow desktop, not a phone layout.

**Rebuildable: mostly.** All three rebuilds validate and render at 1280 and 360 px: axe 0/0, no horizontal scroll, one h1 and one call button per screen. Each keeps its idea: the hip-red briar field, the rust field with the hairline fern, the bakery's huge stacked bread names. What the language lost, with what it would take:
1. **Display faces.** Anton and Big Shoulders (condensed) are not in our font pairs, so we use Archivo heavy and the condensed poster voice is gone. Fix: add 2–3 condensed display faces and let a page pick a font pair outside its direction (token override).
2. **The bakery's planks.** A decor may not share a cell with text, and a row per plank would need 11 rows (max 8). Fix: a heading treatment "plank": a thick rule in a colour role under the line.
3. **One line through the whole page** (tattoo signature). Fix: a page-level drawing layer that spans sections. Today it is three separate cut-outs at most.
4. **AI art outside the opener** (WORKAROUND(ai-art-outside-hero), the tattoo swallow). validateSite rejects it; the page renders. Fix: allow labelled AI art in any section.
5. **Cut-outs keep the mockup's painted ground** (WORKAROUND(art-ground-match)): the band colour is sampled to match. Fix: background removal or transparent PNG assets.
6. **No florist or tattoo business type** (WORKAROUND(invented-business-type)), as in spike 1.
7. **The director's palettes must clear our contrast rules.** Two `accent on inverse` failures needed a role swap; the director should get the role contrast rules in its prompt.

**€ measured:**
- Director, one call per business: €0.062–0.106 (2.3k–5.4k in, 3.1k–5.1k out, 34–57 s). The bakery call carries 4 images.
- GPT Image 2.5 high: €0.069 per image without references, €0.086 with them (booked rate, 17–27 s).
- Per site, as run here (director + 2 directions × 1 image) ≈ €0.21–0.28. Adding the Opus vision rebuild (≈ €0.17) and one revise round (≈ €0.10) **≈ €0.50–0.55 per homepage**, or ≈ €0.65–0.70 with 2 images per direction.

**Cap note:** the brief asked for 2 images × 2 directions × 3 businesses (12 at high), which is ≈ €0.90 at the booked rate, over the €0.60 fal cap. I made 1 image per direction (6) plus 1 phone image, €0.52.

**Recommended pipeline (replaces spike 1's step 1):**
1. Opus director: brief + photos + banned list + role contrast rules + "what the layout system can build" → 2 directions with prompts.
2. GPT Image 2.5 high: 1 desktop image per direction. The owner picks, or an Opus judge picks against the banned list.
3. Opus vision rebuild into composed sections, facts through slots.
4. One revise round against the mockup.

Before productising, fix gaps 1, 2, 4 and 5 above and gaps 1–4 from spike 1. Then a paid 10-business run to measure judge scores and the owner's picks against the hero bar.
