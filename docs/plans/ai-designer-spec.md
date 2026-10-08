# AI designer: implementation spec

The engineering spec for `docs/plans/ai-designer.md` (why and what). Owner decision: HQ `sb-ai-designer` = designer (2026-10-08). HQ item: `it-ai-designer`. The handoff prompt for the implementing agent is `docs/plans/ai-designer-handoff.md`.

Read first: `CLAUDE.md`, `docs/PRODUCT.md` (banned patterns, mobile checklist, never invent facts), `docs/plans/ai-designer.md`, `docs/plans/variety-engine.md` ("Step 5 as built": the genome and section intents), `docs/design/templates/README.md`.

## 0. Invariants (every PR)

- Everything sits behind config `designer.agent` (default `false`). With it off, every model request and every rendered byte is identical to `main`: replay all ten fixtures on both branches (`pnpm eval --offline` and the recordings replay used for the variety switches) and diff.
- The spec stays the single source of truth. The designer only ever writes spec (JSON Patch or whole sections); nothing hand-edits HTML.
- One component library renders preview and published site.
- Spec change = version bump + migration + test.
- Facts only from the client's text (`checkFacts`); placeholders for anything missing.
- Banned patterns and the mobile checklist are enforced in code wherever the composition language makes it possible (§2.4); the loop's rubric catches the rest.
- Model ids, effort, caps and prices in `config/app.config.json`, never in code.
- Unit tests never call the API: recorded fixtures only. `pnpm eval` is the only path to real calls.
- Every real call logs tokens and € per stage (new stages: `artDirection`, `compose`, `designLoop`).
- Check the current Anthropic API docs (tool use, structured outputs, effort, prompt caching, images) before writing request code. Don't guess field names.

## 1. Pipeline with `designer.agent` on

```
classify ─▶ brief (concept on) ─▶ art direction ─▶ compose ─▶ assemble/repair/validate ─▶ save v1 (preview shows)
              │                      ▲                                                        │
              └─ photos, alt text ───┘ (vision JPEGs, alt, heroSuitable)                       ▼
                                                                         render ─▶ design loop (tools) ─▶ save v2
                                                                                                   │
                                                                                     checks incl. Lighthouse
```

- `chooseDesign` and `critique` are not called. Everything else in `generateSite` (`packages/engine/src/pipeline.ts`) stays: spend reservation, junk stop, pictures, owner facts and owner text on regeneration, versions, events.
- The art director needs the photos' alt texts and `heroSuitable`, so it waits for the alt-text branch (today the design call doesn't). Generated pictures (fal) start after the brief as today; the director is told which slots will be generated and their ideas.
- Homepage first (`scope: "home"`) is the target of v1. Other pages of a full site are composed by the same compose call in v1 only if Step 4 shows the homepage works; until then they use preset sections styled by the director's genome.

## 2. Spec v19: composed sections

### 2.1 Where it lives

- `packages/spec/src/sections/composed.ts`: a new section type `composed`, group `"composed"` (extend `SectionGroup`), variant enum `["free"]`, defined with `defineSection` so it joins `Section`, `SECTION_DEFS` and the catalogue.
- `packages/spec/src/composition/`: the element and placement schemas, guards (`validateComposition`, `repairComposition`), and the compact catalogue text for prompts (generated from the zod schemas, the way `compact-catalogue.ts` does it).
- `design.art` (optional, on `Design`): `{ idea: text(160), rationale: text(600), references: string[] (≤ 4 template ids), moments: { intent, purpose: text(200) }[] (≤ 10) }`. Metadata for regenerations, neighbours and the editor; it never changes rendering.
- `SPEC_VERSION` 18 → 19, migration 18 → 19 is the identity (both additions optional). Test: every golden migrates and renders byte-identical.

### 2.2 The section

```ts
composed: {
  id, type: "composed", variant: "free", tone?: Tone,
  props: {
    intent: Intent,                 // from packages/spec/src/intents.ts (never "system")
    width: "contained" | "wide" | "full",
    minHeight: "none" | "s" | "m" | "l" | "screen",   // screen = 100svh minus header, desktop only; phones cap at "l"
    rows: 1..8,                     // desktop grid rows; phone rows are implicit (order)
    gap: 0..6,                      // steps of the spacing scale
    surface: { texture: "none" | "grain" | "lines" | "dots", divider: "none" | "rule" | "motif" },
    elements: Element[]             // 1..12
  }
}
```

Every element: `{ id: /^e_[a-z0-9_-]+$/, kind, desk: Place, phone: PhonePlace, ...kind props }`.

```ts
Place      = { col: 1..12, span: 1..12, row: 1..8, rowSpan: 1..8, z: 0..3,
               alignX: "start"|"center"|"end"|"stretch", alignY: "start"|"center"|"end"|"stretch",
               shiftX: -2..2, shiftY: -3..3 }          // shifts in spacing steps, for controlled overlap
PhonePlace = { order: 0..20, span: "full" | "inset" | "half", alignX: "start"|"center"|"end", hidden?: boolean }
```

`col + span - 1 ≤ 12`, `row + rowSpan - 1 ≤ rows`. Desktop grid applies from 64 rem (the site's desktop breakpoint); below it elements stack by `phone.order` on a 4-column grid (`half` = 2 columns, two consecutive `half` elements share a row). `hidden` is allowed only on `decor` and on a second `image`.

Element kinds:

| kind | props | renders with |
|---|---|---|
| `heading` | `text: text(90)`, `level: 1\|2\|3`, `size: -1..8` (type-scale step; 6–8 are display sizes clamped to ≤ 12vw desktop, ≤ 15vw phone), `weight?: 400..900`, `case?: "normal"\|"uppercase"`, `rotate?: 0\|90\|-90` (desktop only), `measure: "s"\|"m"\|"l"` | existing heading primitive |
| `text` | `paragraphs: text(600)[] 1..4`, `size: 0\|1` | `<p>`, max-width 65ch |
| `list` | `items: text(120)[] 1..8`, `marker: "none"\|"rule"\|"dot"` | `<ul>` |
| `fact` | `value: text(24)`, `label: text(60)`, `treatment: "numeral"\|"plate"\|"stamp"\|"ticket"\|"seal"\|"tag"`, `size: 2..8` | new, CSS per treatment (re-use the plate/seal/receipt CSS from the templates) |
| `image` | `image: ImageRef`, `ratio: "1:1"\|"4:5"\|"3:4"\|"4:3"\|"3:2"\|"16:9"\|"21:9"\|"fill"`, `mask: "none"\|"arch"\|"circle"\|"cut"\|"stamp"\|"ticket"`, `treatment: "none"\|"duotone"\|"tint"\|"grain"` | existing `Picture` primitive (srcset, focal point) |
| `action` | `action: "call"\|"book"\|"directions"\|"link"`, `label: text(32)`, `href?` (link only, `Link` schema), `style: "primary"\|"secondary"\|"text"` | existing button primitives |
| `hours` | `style: "table"\|"compact"\|"week"` | existing hours renderers, data from `business.hours` |
| `contact` | `show: ("phone"\|"email"\|"address"\|"map")[]` | existing contact parts, data from `business` |
| `prices` | `items` in the existing price item schema (owner on-request rules apply), `style: "rows"\|"plates"\|"tags"` | existing price item renderer |
| `decor` | `{ motif: MotifId }` or `{ svg: { viewBox: "0 0 W H" (W,H ≤ 400), paths: { d, fill: Role\|"none", stroke: Role\|"none", width: 0..8 }[] ≤ 24 } }` | inline `<svg aria-hidden="true" focusable="false">` |

`Role` = a colour role from `design.colors` (`background`, `surface`, `text`, `muted`, `primary`, `onPrimary`, `accent`, `border`, `inverse`, `onInverse`, `band`, `onBand`), never a hex. `d` must match `^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-]{1,2000}$`.

Not in v1 (on purpose): quotes or testimonials (invented-fact risk), video, forms (use the preset `contact-form` section), arbitrary CSS, raw HTML, free colours, free fonts.

### 2.3 Rendering

- `packages/components/src/groups/composed/Composed.tsx` and `packages/components/styles/composed.css`; registered in `registry.ts` (`satisfies SectionRenderers` forces it).
- One static stylesheet; per-element placement goes in CSS custom properties in the `style` attribute (`--c`, `--s`, `--r`, `--rs`, `--z`, `--sx`, `--sy`, `--po` …), the pattern `Footer.tsx` and `Header.tsx` already use. The site CSP allows inline styles (`apps/web/src/app.ts`). No `<style>` per section.
- Masks: a fixed set of `clip-path`/`mask` classes in `composed.css`. Treatments: CSS filters/blend with the palette's vars; duotone via an SVG filter defined once per page when used.
- Text over an image (overlap by placement) gets a scrim so contrast holds. Nothing computes this today (the photo heroes use fixed overlays in CSS): add a code step that reads the image's luminance under the text box from the processed variant at assemble time and sets the scrim strength; if no scrim reaches 4.5:1, validation moves the text off the image (§2.4).
- Editor hooks: every text node carries the same `data-path` JSON pointer convention the other sections use, so `apps/web/src/client/editor.ts`'s contenteditable, photo replace and translation fields work without a new editor (check against `Text.tsx` / `ImageText.tsx`).
- LCP: `lcpImageFor` returns the first `image` element of a composed section that opens the page.
- Islands: none in v1.

### 2.4 Guards in code

`validateComposition` (errors) and `repairComposition` (safe fixes, logged as repairs like `repairSiteCopy`). Run in `validateSite`, so content, chat edits, critique patches and the loop's patches all pass through them.

| Rule | Source | Check / repair |
|---|---|---|
| Grid bounds, unique element ids, ≤ 12 elements | schema | reject |
| One `h1` per page, first in reading order | `oneHero` | repair: demote later h1 to h2 |
| Every text element has a phone place; nothing rotated, shifted or overlapping text on phones | mobile checklist | repair: zero rotate/shift on phone; reject text–text overlap |
| Text overlaps only image or decor on desktop, never other text | legibility | reject |
| Contrast ≥ 4.5:1 body, ≥ 3:1 large, incl. over images (scrim) | WCAG, PRODUCT.md | repair: scrim, else move text off the image |
| Body ≥ 16 px; text measure 45–75 characters at 1280 px (span × column width ÷ char width from the font metrics we ship) | mobile checklist | repair: widen span or set measure |
| At most one section on the page centred as a whole (all text `alignX: center`) | banned "everything centred", `design.skeleton.centred` | reject the second |
| No row of three or more equal-span blocks each `decor`/`fact` + `heading` + `text` | banned "row of three icon cards" | reject |
| Action styles: one `primary` per screen; at most one call action per section; the page's call-button rule (`callButtonsPerScreen`) | banned list, PR #145 | reject |
| No numbered labels ("01", "02") in headings or facts used as section labels | banned | reject (regex on `heading`/`fact.label`) |
| `fact.value` and every number in text appear in the client's corpus | never invent facts | `checkFacts` covers composed text |
| `hours`, `contact`, `prices` render business facts only; missing → placeholder rules as today | never invent facts | existing publish checklist sees them |
| Each `image` id exists in assets, each photo ≤ 2 times per page | today's rule | reject |
| `decor.svg` sanitised: allowed chars only, roles only, ≤ 24 paths, viewBox ≤ 400 | safety | reject |
| Display sizes (6–8) at most once per screen height | hierarchy | reject |

A composed section that still fails after repair is replaced by a preset layout of the same intent (`asLayout` / `layoutsFor` in `packages/spec/src/intents.ts`) filled from its texts when the props map, otherwise dropped with a logged event. The page never fails because of a composed section.

### 2.5 Proof of expressiveness (Step 1, free)

Re-express the signature parts of three hand-made templates as composed sections, as fixtures in `tools/eval/composed/`: M Tablica (plate hero with the phone as a registration plate), S Cevi (drawn pipes, call block), J Skorja (product photo, price plates, opening-time seal), from `docs/design/templates/`. A script (`pnpm designer:compose-sheet`) renders each at 360 and 1280 px beside the hand-made page and reports pixel difference, axe, horizontal scroll and the guards. Target: the owner can't pick which is which at a glance; numbers are reported, not forced to zero. If a template part can't be expressed, extend the language or record why in the plan.

## 3. Art director (stage `artDirection`)

- Config: `models.artDirection = { model: "claude-opus-5-5", effort: "high", maxTokens: 12000 }`; `designer.references` (count, default 3).
- Code: `packages/engine/src/designer/art-direction.ts`.
- System blocks (cached, byte-stable): design principles (written for this product: one idea per site, hierarchy, rhythm, photo use, phone first-screen, Slovene small-business audience, owner's taste from HQ notes: characterful and trade-specific over tasteful-generic), the banned list and mobile checklist verbatim from PRODUCT.md, the genome axis catalogue with each value described, the composition language catalogue (compact notation), the motif library.
- User message: brief (with concept), classification, swatches, the photos (vision JPEGs via `visionJpeg`, ≤ 6, with ids, alt text, `heroSuitable`), the logo, generated picture slots and their ideas, the neighbours' `art.idea` and genome (extend `repo.neighbourLooks`), on "Ustvari znova" the previous `art` and genome ("make another idea"), and 3 reference templates picked by code by trade and goal: each as a 1280 px and a 360 px first-screen JPEG plus 3 lines on why it works.
- References: rendered once, offline, by `pnpm designer:references` from `docs/design/templates/` and `docs/design/swim-landing/` into `packages/engine/assets/references/` (JPEG, committed; free). They are examples of the bar, never layouts to copy: the prompt says so and the loop's rubric checks the idea isn't a template's.
- Output (structured output; zod → JSON Schema through the existing `toModelJsonSchema`):
  ```ts
  { idea: text(160), rationale: text(600),
    genome: { [axis]: { value, reason: text(160) } },   // all 11 axes of genomeOf
    colours: { primary, accent, band, background } each as a swatch index or "fallback" (the genome palette's own),
    moments: { intent, purpose: text(200), emphasis: text(200), images: string[], facts: string[] }[] 4..9,
    references: string[] }
  ```
- Code after the call: the genome through `GENOME_RULES` and `enforceDesign` (repairs logged); colours through contrast enforcement; distance from every neighbour's genome with the genome's own distance (≥ 4 axes, as `pickGenome`), else the seed moves the closest axes and the event is logged; `design.art` written.

## 4. Compose (stage `compose`)

- Config: `models.compose` (start `claude-sonnet-5-5`, effort `high`; Step 4 also runs Opus to compare quality per €).
- Code: `packages/engine/src/designer/compose.ts`, re-using `generateContent`'s evaluate/patch loop (`evaluate`, `PatchLoopDeps`), so validation, repairs, fact check and placeholder rules are the same code.
- Input: the brief, the art direction, the pages, the photos list, the facts line (as `contentMessageParts`), the composition catalogue (cached block), and the preset section catalogue (also allowed).
- Output: the same content output shape, where a homepage section may be `composed` or any preset. The prompt asks for one composed section per moment unless a preset expresses the moment exactly; the hero moment is always composed.
- The Slovene style block (`promptFixes.sloveneStyle`) and the catalogue wording fixes apply as in content.

## 5. Design loop (stage `designLoop`)

### 5.1 Tool use in the client

`ModelRequest` has no tools today and `ModelResponse` is text only (`packages/engine/src/llm/client.ts`). Add, after checking the current Messages API docs for tool use:

- `tools?: { name, description, input_schema }[]`, `tool_choice?`, and responses that carry `tool_use` blocks (`ModelResponse.toolUses`), with `stopReason` passed through;
- `ModelClient.runAgent({ stage, system, messages, tools, handlers, maxTurns, maxEur })`: calls, runs handlers for each `tool_use`, appends `tool_result` blocks (images allowed in results), repeats until `done` or a cap. Every turn goes through `call` so the spend ledger, reservation, per-stage logging and the daily cap apply per turn;
- the recording transport (`packages/engine/src/llm/recording.ts`) records and replays each turn by `requestHash`, so a loop replays deterministically in tests; `requestHash` must include tools and tool results (images by content hash).

### 5.2 Tools

| tool | input | returns |
|---|---|---|
| `render_page` | `{ width: 360 \| 1280, part: "first-screen" \| "full" }` | screenshot slices (`fitImageForModel`, `sliceScreenshot`) of the homepage as it is now |
| `run_checks` | `{}` | `checkSite` failures without Lighthouse (axe, mobile report, composition numbers, call buttons, banned) |
| `patch_spec` | `{ ops: JSON Patch[], why: text(200) }` | `applyPatches` result: applied, or the issues (validation, guards, fact check, owner edits kept) |
| `done` | `{ verdict: text(300), unresolved: text(160)[] }` | ends the loop |

Patches may touch homepage sections, `design` (through `enforceDesign`), `design.art`, page order and copy. They may not touch business facts, owner-edited paths (`keepUnchangedOwnerEdits`), legal pages or assets.

### 5.3 Rubric (system prompt) and caps

Rubric: the idea reads in the first screen at both widths; one focal point per screen; a clear order of reading; rhythm alternates (no two neighbouring sections the same weight and tone); photos cropped on their subject; the phone first screen as strong as the desktop's; nothing from the banned list; every fact from the client.

Config `designer.loop`: `model` (start `claude-opus-5-5`, effort `medium`), `maxRenders` (4), `maxTurns` (10), `maxEurPerSite` (0.25), `timeoutMs` (90000). On any cap: keep the last valid spec, log which cap. On `SpendCapError`: stop the loop, keep the version (as `CRITIQUE_SKIPPED_NOTE` does today).

Saving: v1 is saved after compose (the editor shows it, per decision `sb-preview-time`), the loop's result is saved as the next version when it changed anything; Lighthouse runs once after the loop.

## 6. Regeneration, looks, edits

- "Ustvari znova": the director gets the previous `art` and genome and must change the idea; neighbours as above.
- "Druga podoba" with the designer on: a new art direction and compose that keep the texts the owner sees (same words, new design). It is a paid call, unlike today's free look switch. Before building it, put the choice in HQ (decision: paid AI look vs. free genome look vs. both).
- Chat edits (`editSpec`): the edit catalogue includes the composition language; an edit may change placements and elements under the same guards.
- Owner edits: `keepOwnerText` and `keepOwnerFacts` cover composed element paths; regeneration keeps typed text in composed sections the way it does in presets (tests).

## 7. Measuring

- `pnpm eval --designer` turns `designer.agent` on for the run; use its own `--recordings tools/eval/recordings-designer/` (memory: paid runs need their own recordings dir; `--max-eur` covers regenerations and the judge).
- Step 2 and 3 runs: `avtoservis-mrak`, `instalacije-rebernik`, `pekarna-kvas` (the M, S, J trades), `--scope home --no-edits --judge`.
- Step 4: `--twins --scope home --no-edits --judge --designer` over the 10 fixtures and 12 twins. The baseline is the 2026-10-08 switches-on run (`eval/variety-2026-10-08.md`, its recordings): don't pay for it again.
- Build the pairwise judge question (“Would a visitor take these two for the same template?”), noted as not built in TASKS.md; it runs in the same judge batch.
- `pnpm designer:compare` (free, from recordings): a contact sheet per fixture, today vs designer, at 360 and 1280 px, for the owner; publish it and link it in HQ.
- Report: judge medians per criterion, distinctiveness, pairwise "same template" count, look distance within and across trades, check failures, € and seconds per homepage per stage, loop rounds and caps hit.

Targets to propose switching on (the owner decides): judge median ≥ 3.7 on every fixture, distinctiveness ≥ 4 everywhere, 0 twin pairs judged the same template, every automated check passing, and the owner prefers the designer's sheet. Cost and time per homepage are reported against €0.30 and 60 s; if they miss, that is an HQ decision with options (Sonnet loop, one round on free previews, designer after sign-in), never a quietly lowered target.

## 8. PRs

| PR | Contents | Paid | Checks |
|---|---|---|---|
| A | Spec v19, composition schemas, guards, migration; renderer and CSS; M/S/J composed fixtures and `designer:compose-sheet` | none | spec + render tests at 360/1280 for every element kind and the placement extremes, axe, no horizontal scroll, guard tests per rule, goldens byte-identical, contact sheet looked at |
| B | Tool use in `ModelClient`, `runAgent`, recording/replay of turns, `requestHash` with tools | none | unit tests with scripted transports; existing recordings replay unchanged |
| C | Art director, references script and assets, compose stage, pipeline wiring behind the switch, config | ≈ €1.5 | recorded-fixture tests; the 3-fixture run; switch-off replay identical |
| D | Design loop, critique replaced when on, caps | ≈ €2 | recorded loop tests (caps, spend cap, invalid patch, owner edits kept); the 3-fixture run |
| E | Pairwise judge, `designer:compare`, the Step 4 run and report | ≈ €6–8 | report committed in `eval/`, sheet published |
| F | Editor and regeneration for composed sections; the Druga podoba decision in HQ first | none | browser tests at 360 and 1280 px |

A and B are independent and free (they can run in parallel or overnight). C waits for A and B. Paid steps follow HQ `meta/budget` exactly (weekly €10, Monday to Sunday; on 2026-10-08 €1.21 was left for that week).

## 9. Done means

- With the switch off: identical requests and output on all ten fixtures.
- With it on: every fixture and twin homepage generates, passes every automated check, and has a composed hero; the report in `eval/` with the numbers in §7; the owner's side-by-side sheet published and linked in HQ; HQ items and decisions current.
