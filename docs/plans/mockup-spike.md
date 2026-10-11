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
