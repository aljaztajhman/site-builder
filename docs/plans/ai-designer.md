# AI designer: a layer that designs each site instead of picking one

Status: plan, 2026-10-08. Nothing built. HQ decision `sb-ai-designer`, item `it-ai-designer`.

The owner (2026-10-08): "Its too templaty. We need another layer where an ai agent kind of designs the webpage based on input and assets/elements/architecture we have. I dont think ai does any proper design now."

## Short answer: the owner is right

Read from the code (`packages/engine/src/stages.ts`, `packages/spec/src/directions.ts`, `config/app.config.json`). No model calls.

Today a site is made by **pick and fill**:

1. **Design is a menu choice.** The design call (Sonnet 5.5, medium effort, 4k tokens) returns one of 20 direction ids plus ten numbers (radius, base size, scale, weight, case, tracking, density, shadow, two colours). It never sees the photos, the logo or the page. Measured in `eval/report-home.md`: about 200 output tokens, €0.003 and 2–3 s per site; that is the whole design decision. On a template trade, code then overrides even the colours (`designWithVariety`: the template's or its family's palette).
2. **The direction fixes everything visual.** Fonts, heroes, header, footer, section rhythm and preferred variants come with the direction. On the ten template trades the content step is told: "these sections in this order, with these variants and tones, and no others" (`templateOutline`).
3. **Layouts are a fixed set.** About 30 section types with 2–5 hand-built variants each (`packages/spec/src/sections/`). The model can choose `image-left` or `image-right`; it cannot make a layout that isn't in the list: no overlap, no giant numeral bleeding off the edge, no photo cut into an arch beside a rotated label, nothing a designer would invent for one business.
4. **The content step writes words into slots.** It is the step that does the most work, and it is a copywriter, not a designer.
5. **The only step that looks at the page can't redesign it.** The critique sees screenshots, but its patches are mostly copy and variant swaps inside the same catalogue, at most two rounds.
6. **The variety engine adds permutations, not design.** Families, skeletons and concept (on since PR #157) pick palettes, font pairs, heroes, headers and footers by seed and away from neighbours. That makes two car repair shops differ, but every difference is a combination of the same parts. Step 5 (the genome, spec v18, built behind `variety.genome`, off) splits a direction into 11 axes and lets code pick each by seed: more combinations again, and still no one deciding why.

So nobody in the pipeline does what a designer does: look at the business and its photos, have one idea, compose the page around it, look at the result and fix it.

## What changes

Three new things. The spec stays the single source of truth, preview stays equal to published, and every guard we have stays in code.

### 1. An art director (new stage, before content)

One call, Opus 5.5 at high effort, that **sees** the logo, the photos and the brief and writes the site's design:

- **The idea**: one sentence a designer would pitch ("a workshop job ticket: the page reads like the docket you get with your car", "the bakery's day from 4 a.m. oven to the counter").
- **The visual language**, written as a genome (spec v18: type, palette, ground, hero, header, footer, rhythm, imagery, shape, density, motif), chosen axis by axis with a reason tied to the idea instead of by seed. The genome's compatibility rules and `enforceDesign` still repair it; colours come from the logo and photos (code extracts, the director assigns roles, contrast fixed in code).
- **The page**: the homepage as a sequence of moments, each with its purpose, what is big, what bleeds, what overlaps, which photo and which fact carry it.

It is shown 3–4 of our hand-made templates (screenshot plus spec) that fit the business as the bar to reach, never as pages to copy. The trade templates stop being outputs and become the designer's references.

### 2. A composition language (spec v19)

Sections can be **composed** instead of picked: a constrained layout language the director and the content step write in, rendered by one new component group in `packages/components` (so the editor preview and the published site are the same code).

- **Grid**: 12 columns from 64 rem, 4 on phones; each element places itself per breakpoint (column start and span, row), with layering and controlled overlap in fixed steps, bleed (contained, wide, full), minimum height in steps.
- **Elements**: text (headline, body, list, price, fact), media (a photo id with focal point, crop ratio, a mask from a library: arch, circle, cut corner, stamp, ticket), action (call, book, map), fact objects (a giant numeral, a plate, a stamp, a ticket, a seal), decor (a motif from the library, or a small SVG the director draws: palette colours only, a node and size cap, no text or scripts, sanitised in code).
- **Type per element**: a step on the site's scale (including display sizes up to ~12vw), weight, case, measure, rotation for labels (0, 90, −90).
- **Surface**: tone, texture, divider.

The existing sections stay. They become presets (each is one fixed composition), the fallback when composition fails validation, and what the editor already knows. A site can mix both.

**Guards in code, not in the prompt** (`packages/spec`, zod plus checks): the banned list where it is structural (no gradient text, no pill buttons by default, no row of three icon cards, at most one centred block per page, no cream page by default, no monospace eyebrows); contrast for every text over its surface or photo; body ≥ 16 px and 45–75 characters; tap targets; no horizontal scroll at 360 px (render check); a phone layout for every composition (phone placement required, never inferred).

### 3. A look-and-revise loop (agent)

After the first render, the designer works at the screen: an Opus tool-use loop with `render(page, width)` → screenshot, `check()` → the automated checks (banned, contrast, axe, mobile checklist), `patch(ops)` → spec changes (composition, design system, order, photos, copy), `done(reason)`. It judges against its own idea and a written rubric (hierarchy, rhythm, one focal point per screen, photos used well, the phone screen as good as the desktop). Capped by rounds and by € per site in config. The critique stage is folded into it.

## What it costs per homepage (estimate, to be measured)

Today's column from `eval/report-home.md` and the 2026-10-08 twin runs (€3.18 for 22 homepages incl. pictures); the designer's column estimated from config prices (Opus 5.5 $4/$20 per MTok, €0.86 per $):

| Stage | Today | With the designer |
|---|---|---|
| Classify, brief, alt text, content | ≈ €0.06–0.08 | ≈ €0.08–0.10 (content also writes compositions) |
| Design | €0.003, ≈ 200 output tokens (Sonnet) | art director ≈ €0.10–0.15 (Opus, sees photos) |
| Critique / loop | €0.02–0.04, 16–500 output tokens | 2–3 rounds ≈ €0.10–0.25 (Opus with screenshots; Sonnet halves it) |
| Pictures (fal, when too few photos) | ≈ €0.05 | same |
| **Homepage** | **≈ €0.15** (measured 2026-10-08) | **≈ €0.33–0.55** |

The preview target is €0.30 and 60 s (PRODUCT.md). The designer likely misses both: ≈ +30–60 s for the director and the loop. Ways to hold it, decided after measuring: Sonnet for the loop, one loop round on the free preview and more on paid sites, or the designer only after sign-in. This is a separate decision once real numbers exist.

## Steps

Each step is one PR behind config `designer.agent` (off). With it off every request is byte-identical to today.

| Step | What | How it is checked | Eval € |
|---|---|---|---|
| 1 | Composition language: spec v19 + migration + zod guards; renderer in `packages/components`; templates M, S and J re-expressed as compositions | Free. Render compare against the hand-made pages at 360 and 1280 px (`pnpm templates:compare`), axe, banned-pattern tests, contact sheet | 0 |
| 2 | Art director stage + content writes compositions; reference library (19 templates as screenshot + spec) | Unit tests on recorded fixtures; one paid run on 3 fixtures | ≈ 1.5 |
| 3 | Look-and-revise loop with render/check/patch tools; critique folded in; € and round caps | Recorded loop fixtures; paid run on the same 3 | ≈ 2 |
| 4 | Measure against today's engine: 10 goldens + 12 twins, homepage, judge + pairwise "same template?" + contact sheet side by side for the owner | Judge medians, look distance within and across trades, cost and time per homepage | ≈ 6–8 |
| 5 | Editor: composed sections editable (text and photo replace through their slots, "Druga podoba" re-runs the director keeping the content) | Browser tests at 360 and 1280 px | 0 |

Total ≈ €10–12 in evals, about one week's development budget. Steps 1 and 5 are free and can run tonight; Steps 2–4 wait for budget (≈ €1.2 left this week).

**Targets to switch it on:** judge median ≥ 3.7 on every fixture (today 3.17–3.42), distinctiveness ≥ 4, no twin pair judged "same template", every automated check passing, and the owner picks the designer's version over today's on the side-by-side sheet. Cost and time per homepage are reported, not hidden; whether they fit the preview is the follow-up decision.

## What happens to existing work

- The trade templates and directions become presets and references. Nothing is deleted.
- The concept fields in the brief (goal, angle, signature fact, materials, local anchor) feed the art director.
- The variety switches stay as they are for sites made without the designer. The genome (variety Step 5) becomes the director's design-system vocabulary: its axes, rules and repair stay, the director picks instead of the seed. Its own twin judge run (≈ €10) is no longer needed; Step 4 here measures both.
- The twins, look distance and judge from variety Step 0 are the measuring tools for Step 4.
- The neighbour check stays: the director is told its town's same-trade sites' ideas and must not repeat one.

## Alternatives considered

- **Model writes each site's HTML and CSS directly** (v0, Lovable style). The most freedom, but the spec stops being the source of truth: owner edits, translations, "Druga podoba", the banned list and contrast in code, fact and placeholder checks all stop working or move into a fragile HTML parser. Quality varies run to run with nothing to hold it. Rejected for the product; useful as a sketching tool for new presets.
- **The loop only, on today's components.** Fast (one PR, ≈ €3) and it would fix composition mistakes, but the designer could still only choose among the same 30 sections, so the result stays recognisably templated. It is Step 3 of this plan, not a replacement for it.
- **Turn on the genome and stop there.** More combinations of the same parts, picked by seed. That is the current feeling's cause, not its cure.

## Risks

- **Ugly freedom.** A composition language can express bad layouts. Mitigations: structural guards in code, phone placement required, the loop looks at every page, presets as fallback, and nothing switches on without beating today's engine on the judge and on the owner's eye.
- **Cost and time over the preview target.** Measured in Step 4; a decision then, not a surprise later.
- **Editor complexity.** Composed sections need slot-level editing. Step 5 keeps editing to text and photos per slot; layout changes go through chat or "Druga podoba".
- **Spec growth.** v19 is additive (a new section kind); old specs render unchanged. Migration with a test.
