# Design studio Phase 2: the studio

Architect's design for Phase 2 of `docs/plans/design-studio.md` (§6 runtime, §6.4 model roles, §8 taste, §9 gate, §11 S0–S7). Builders build against this file; where it and the plan differ, this file wins for Phase 2. Base: `origin/main` a7db9db (spec v21) plus #196, #197 and `claude/studio-guard-gaps`. The Phase 1 review it builds on: `docs/plans/studio-phase1-review.md` (findings B1–B5, D1–D7 referenced below).

## 0. Key decisions

1. **One orchestrator, `runStudio`, behind `designer.agent`.** It replaces design, content and critique for the homepage when on. Any failure falls back to today's pipeline; the page never fails because of the studio. With the switch off, every request and every rendered byte stays as on `main`.
2. **One spec bump for the whole phase (v22), first** (unit SV), so stage units never collide on `SPEC_VERSION`.
3. **The bake-off runs per stage, as each stage is built.** S0 builds the harness, adds the stage config and calibrates the judge against the owner. Each S unit then runs its own arms. Results change config only.
4. **Only approved assets at runtime.** Dev evals may run on drafts with an explicit `--catalogue drafts` (printed in every report); the exit run and anything a customer sees use approved assets only.
5. **Paintings only for concepts that survive the pre-screen** (≤ 4 per site), so fal spend follows quality.
6. **No per-site SVG drawn by Haiku in Phase 2.** The owner found line drawings basic; hero art is poster, linocut, painting, shapes or a hero-grade photo.
7. **A moodboard is one composite image per stance** plus text lines, not one image per asset (≈ 1,600 tokens per image on Opus).
8. **Runners-up live in a table**, not in the spec; switching to one makes a new version.
9. **Steps, FAQ and amenities are extracted verbatim** by the studio's Brief, never written.
10. **Vision requests replay by spec, not by pixels.** A rendered screenshot's recording key is the hash of what was rendered, so replays survive font rasterisation differences between machines.

## 1. The pipeline

```
runStudio(deps, siteId, jobId)                                      events (repo.addEvent, stage "studio")
 classify ─ brief (+ verbatim steps, faq, amenities) ──┬─ photoAnalyst (Haiku, vision)
                                                       └─ deal (code: seed → 6 stances, cards, 3 references,
                                                          shortlists, moodboard images)                   "moodboard"
 ─ director (Opus, vision) ─ validateConcepts + registry pre-gate (code)                                  "concepts"
 ─ resolveArt per concept (code: hero art reference, wordmark)
 ─ designers ×N in parallel (Haiku) ─ assemble ─ repair ─ validate ─ fallback ─ facts (code)              "concept n"
 ─ render all (360 + 1280; first screen + full page) + free checks (code, one Chromium)
 ─ prescreen (Haiku, vision): keep ≤ 4 ─ paint survivors (fal) ─ re-render survivors                       "kept"
 ─ tournament (Opus, vision): winner, scores, fixes ─ store runners-up                                    "winner"
 ─ polish (copy on the winner) ─ save version 1 (the editor shows it)
 ─ finisher loop (Opus, tools) ─ save version 2                                                           "finishing n"
 ─ kit (code) ─ kitPages (Haiku, full sites only) ─ gate: checks, registry post-render, Lighthouse         "done"
```

- **Failures.** A concept that fails validation is dropped; fewer than `studio.minConcepts` (3) valid concepts, or no concept surviving render and checks, ends the studio and today's pipeline runs with the same brief. A finisher that hits a cap keeps the last valid spec. Every abort logs its reason as an event.
- **Caps.** The run reserves `studio.perRunMaxEur` (€1.50) under the daily cap before it starts and books real cost per call (existing ledger); `studio.maxSeconds` (300) ends it with the best saved version.
- **Events** carry real run data only (stance names, pairings, palette swatches, chosen photos, concept ideas, first-screen thumbnail keys, the winner's reasons), for S7's progress screen.

## 2. Interfaces

### 2.1 Files

New under `packages/engine/src/studio/` (`deal.ts`, `look.ts`, `phash.ts` exist):

| File | Exports | Unit |
|---|---|---|
| `schemas.ts` | `PhotoAnalysis`, `Concept`, `DirectorOutput`, `DesignerOutput`, `Verdict`, `PrescreenOutput` (zod) | S1, S2, S4 |
| `moodboard.ts` | `buildMoodboards(registry, dealt, opts) → Moodboard[]` (text lines + one composite PNG per stance) | S1 |
| `analyst.ts` | `analysePhotos(client, photos, brief) → PhotoAnalysis` | S1 |
| `director.ts` | `directConcepts(client, input) → Concept[]`, `validateConcepts(raw, ctx) → { concepts, dropped, repairs }` | S1 |
| `art.ts` | `resolveArt(concept, ctx) → ArtPlan`, `paintSurvivors(plans, images) → Map<conceptIndex, ImageRef>`, `shapesArt(seed, colors) → DecorSvg` | S3 |
| `designer.ts` | `designConcept(client, concept, ctx) → DesignerOutput`, `assembleConcept(out, concept, base) → { spec, repairs, fallbacks }` | S2 |
| `polish.ts` | `polishCopy(client, spec, concept) → Operation[]` (text paths only) | S2 |
| `render-all.ts` | `renderConcepts(specs, browser) → ConceptShots[]` (first screen 360/1280, full page, check summary) | S4 |
| `prescreen.ts`, `tournament.ts` | `prescreen(...) → number[]`, `judgeConcepts(...) → Verdict` | S4 |
| `finisher.ts` | `finish(client, spec, verdict, tools) → { spec, log }` (on `runAgent`) | S5 |
| `kit.ts` | `kitOf(spec, concept) → Kit`, `composePages(client, kit, brief, home) → SiteSpec` | S6 |
| `run.ts` | `runStudio(deps, siteId, jobId) → GenerateResult` | S4 (S1–S3 grow it) |
| `prompts.ts` | the studio's system prompts (static, cached) | each stage |

`pipeline.ts` `generateSite` calls `runStudio` when `studioOn(config, account)` and falls back on its error. Eval: `tools/eval/src/studio-run.ts` (`pnpm eval --studio`) and `tools/eval/src/bakeoff.ts` (`pnpm eval:bakeoff`). Platform: one migration (§2.8). Web: S7 routes and screens.

### 2.2 Photo analyst (S1)

```ts
PhotoGrade = z.enum(["hero", "supporting", "detail", "dont-use"]);
PhotoAnalysis = z.strictObject({
  photos: z.array(z.strictObject({
    image: ImageId,
    subject: text(120),                  // English, for the director
    alt: text(150),                      // Slovene alt text: replaces the alt stage when the studio runs
    grade: PhotoGrade,
    light: z.enum(["bright", "even", "dim", "dark"]),
    focal: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
    crop: z.enum(["any", "tight", "wide-only"]),
    why: text(120).optional(),
  })).max(12),
  rank: z.array(ImageId),                // best first
});
```
Dominant colours come from code (`palette-photo` swatches), not the model. A photo below `hero` never carries a first screen or a full-bleed band (§6.6 of the plan); `dont-use` photos are never placed.

### 2.3 Concept, the director's output (S1)

```ts
HeroArtStyle = z.enum(["photo", "poster", "linocut", "painting", "shapes", "none"]);   // in @sb/spec (v22)
FirstScreen = z.enum(["type", "drawing", "fact", "colour", "wordmark", "photo"]);        // in @sb/spec (v22)
Concept = z.strictObject({
  stance: StanceId,                                   // one of the dealt six, each once
  card: z.strictObject({ id: CardId, kept: z.boolean(), why: text(160).optional() }),  // why when kept is false
  idea: text(160),
  firstScreen: FirstScreen,
  heroArt: z.strictObject({ style: HeroArtStyle, photo: ImageId.optional(), subject: text(160).optional() }),
  pairing: AssetId,                                   // pairing/…, from the moodboard
  palette: z.strictObject({ from: z.enum(["library", "logo", "photo"]), id: AssetId.optional() }),
  signature: z.strictObject({ asset: AssetId, use: text(140) }),
  picks: z.array(AssetId).max(12),
  shape: z.enum(SHAPES), rhythm: z.enum(RHYTHMS), density: Density, why: text(300),   // genome axes with reasons
  wordmark: Vocab("WORDMARK_STYLES").optional(),      // only without a logo
  motion: MotionLevel,
  moments: z.array(z.strictObject({ intent: z.enum(INTENTS), purpose: text(160), preset: AssetId.optional() })).min(4).max(9),
  voice: text(200),
});
DirectorOutput = z.strictObject({ concepts: z.array(Concept).min(1).max(6) });
```

`validateConcepts` (code), in order; each repair is logged:
1. Stance not dealt or repeated → drop the concept. Card not the one dealt to that stance → the dealt card, kept.
2. `pairing`, `palette.id`, `signature.asset`, `picks`, `moments[].preset` must be approved (`ctx.approved`) and of the right kind. Invalid picks are removed; an invalid pairing or palette becomes the stance's top-ranked approved one; an invalid signature becomes the first valid pick, or none.
3. `heroArt`: `photo` needs a photo graded `hero`, else the concept switches to the trade's approved poster or linocut, else shapes. `painting` needs `subject`, which must pass the generated-picture rule (no people or parts of people, no premises, signs, lettering or the client's own work; the brief's imageIdeas word check), else shapes.
4. At most 2 concepts with `firstScreen: "photo"`: the lowest-ranked extras switch to their drawing style (plan §6.6: ≥ 4 of 6 stand without a client photo).
5. `moments`: the first intent is `hero`; a local business has a `contact` or `hours` moment (appended when missing).
6. `wordmark` only when the site has no logo; without a logo and without one, code picks by the stance's tags.
7. Registry pre-gate: a provisional look per concept (stance, axes, palette, moment intents) through `studio/look.ts`. Closer than `sameTradeMin` to a same-trade site or `sameTownMin` to a same-town site → dropped; two concepts closer than `sameTradeMin` to each other → the later one dropped. Fewer than 3 left → one re-deal and one more director call (cap 1), then fallback.

### 2.4 Designer output and assembly (S2)

```ts
DesignerOutput = z.strictObject({
  sections: z.array(z.strictObject({ moment: z.number().int().min(0).max(8), tone: Tone, props: ComposedProps })).min(3).max(9),
  headlines: z.array(text(70)).length(3),           // h1 candidates, Slovene; the first is used
  seo: z.strictObject({ title: text(60), description: text(155) }),
});
```
- The request carries the concept, its moodboard text, ≤ 3 filled preset examples (the moments that name a preset), the brief's facts, the photo analysis (ids, grades, subjects), and the art plan (§4: what the hero art is and how to place it). Structured output with the composed props schema whose vocab enums are the site run's approved names; if the schema doesn't compile on the API, JSON mode with one repair retry (measured in S2).
- `assembleConcept` builds the homepage spec: sections from the output; chrome from the site's skeleton; `business` from the brief; `design.fontPair` from the pairing, `design.colors` from the palette (logo or photo per `palette.from`) through today's contrast enforcement; `design.direction` the closest general (non-template) direction by the stance's ground (the S2 scout confirms what the renderer reads from it); `design.art`, `seed`, `motion`, `wordmark` from the concept.
- Per section: `repairComposition(ctx with approved, colors, business, images, motionLevel, prev)` → `validateComposition` → on issues, `composedFallback`, else the moment's preset filled by `fillPreset` from the brief, else drop the moment (hero and contact never drop: their preset is mandatory). `composedFallback` learns steps (→ a list section) and qa (→ the FAQ section) (D2).
- Then `checkFacts` on the page (quotes, steps, qa verbatim; numbers; amenities), placeholders as today, banned copy, em dash replacement. A fact failure removes the element, or falls the section back.

### 2.5 Pre-screen and tournament (S4)

```ts
PrescreenOutput = z.strictObject({ keep: z.array(z.number().int()).max(4), drop: z.array(z.strictObject({ concept: z.number().int(), why: z.enum(["broken", "off-brief", "generic"]), note: text(120) })) });
Criterion = z.enum(["idea", "focus", "scale", "photos", "rhythm", "phone", "specific", "craft", "voice"]);
Verdict = z.strictObject({
  ranking: z.array(z.number().int()).min(1).max(4),                      // concept indices, best first
  scores: z.array(z.strictObject({ concept: z.number().int(), criteria: z.record(Criterion, z.number().int().min(1).max(5)), show: z.boolean(), reason: text(240) })),
  fixes: z.array(text(160)).max(6),                                        // for the finisher, on the winner
});
```
The pre-screen sees each concept's two first screens and its check summary; it drops, it never ranks. Concepts with a failed free check are dropped by code before it. The tournament sees the survivors' first screens at both widths and their full page at 1280 (downscaled), the rubric (§3) and 8–12 owner anchors chosen by code from Okus (spread over the scale, with the owner's score and note). Concepts get letters in a seed-shuffled order (no position bias); a stated photo is never a plus (plan §6.6).

### 2.6 Finisher tools (S5)

On `ModelClient.runAgent`; caps `studio.finisher` (`maxTurns` 10, `maxRenders` 4, `maxEur` 0.30, `maxSeconds` 150).

| Tool | Input | Returns |
|---|---|---|
| `render_page` | `{ width: 360 \| 1280, full: boolean }` | the screenshot and a check summary; counts toward `maxRenders` |
| `run_checks` | `{}` | guards, facts, banned, axe, overflow, tap targets, as a list |
| `patch_spec` | `{ ops: Operation[] }` (RFC 6902) | applied to `/pages/0` and `/design/colors` only, then repair, validate and facts; refused when it touches `/business` or adds a fact |
| `search_inventory` | `{ need: text(120), kinds?: AssetKind[], intent?: Intent }` | ≤ 10 approved assets (id and one line) |
| `done` | `{ reason: text(200) }` | ends the loop |

The finisher starts from the tournament's `fixes`. When the studio is on it replaces today's critique.

### 2.7 Spec v22 (unit SV)

```ts
Art += {                                        // metadata, never rendered
  card: z.string().regex(/^[a-z0-9-]+$/).max(40).optional(),
  firstScreen: FirstScreen.optional(),
  heroArt: HeroArtStyle.optional(),
  signature: z.string().max(80).optional(),     // asset id
  voice: text(200).optional(),
};
Kit = z.strictObject({
  pairing: z.string().max(80), palette: z.string().max(80).optional(), signature: z.string().max(80).optional(),
  presets: z.array(z.string().max(80)).max(24),  // composition presets the homepage used or adapted
  kinds: z.array(z.enum(ELEMENT_KINDS)).max(19),
  rhythm: z.array(Tone).max(12),
  heroArt: HeroArtStyle, motion: MotionLevel,
});
Design += { kit: Kit.meta({ [SYSTEM_ONLY]: true }).optional() };
steps.style: z.enum(["numbered", "line", "row"]);   // row: horizontal from 64 rem, the vertical rail on phones
```
Identity migration 21 → 22 with the usual test (every golden, m/s/j, kitchen sink, the references). Every new field is system-only: designer-off request snapshots stay byte-identical (if `Art` is in today's content schema, the new fields carry `SYSTEM_ONLY` too). `steps` `row` CSS goes into the kinds region within the page budget (review §6.1).

### 2.8 Runners-up (S4; database migration, reviewer required)

```sql
create table design_alternatives (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  generation int not null,
  rank int not null,                        -- 1 = the first runner-up
  stance text not null,
  idea text not null,
  spec jsonb not null,                      -- the homepage at spec v22
  verdict jsonb not null,                   -- its tournament scores and reason
  created_at timestamptz not null default now(),
  unique (site_id, generation, rank)
);
```
The last two generations are kept. Switching (S7) creates a version from the runner-up with the site's current business facts and the owner's own texts kept (the existing owner-text rule).

### 2.9 Config

```jsonc
"models": {                                   // starting points; the bake-off moves them
  "photoAnalyst": { "model": "claude-haiku-5-5", "effort": "medium", "maxTokens": 6000 },
  "director":     { "model": "claude-opus-5-5",  "effort": "high",   "maxTokens": 24000 },
  "designer":     { "model": "claude-haiku-5-5", "effort": "medium", "maxTokens": 24000 },
  "prescreen":    { "model": "claude-haiku-5-5", "effort": "medium", "maxTokens": 3000 },
  "tournament":   { "model": "claude-opus-5-5",  "effort": "medium", "maxTokens": 8000 },
  "polish":       { "model": "claude-haiku-5-5", "effort": "medium", "maxTokens": 8000 },
  "finisher":     { "model": "claude-opus-5-5",  "effort": "medium", "maxTokens": 8000 },
  "kitPages":     { "model": "claude-haiku-5-5", "effort": "medium", "maxTokens": 24000 }
},
"designer": { "agent": false },              // false | "admin" (S7, decision D2) | true
"studio": {
  "concepts": 6, "minConcepts": 3, "prescreenKeep": 4, "perRunMaxEur": 1.5, "maxSeconds": 300,
  "advisor": { "designer": null, "finisher": null },   // or { "model": "claude-opus-5-5", "maxUses": 2, "maxTokens": 2000 }
  "finisher": { "maxTurns": 10, "maxRenders": 4, "maxEur": 0.3, "maxSeconds": 150 },
  "paintings": { "model": "flux-2-pro", "maxPerSite": 4, "cropPct": 6, "style": "<painting style line, §4>" },
  "moodboard": { "assetsPerStance": 40, "imagesPerStance": 1 },
  "budgets": { "charsPerToken": 3, "catalogueTokens": 4500, "moodboardTokens": 3000, "examplesTokens": 6000, "designerRequestTokens": 16000 },
  "uniqueness": { "sameTradeMin": 0.35, "sameTownMin": 0.25, "weights": { … } }   // exists
}
```
Every new stage logs tokens and € per call (existing call records), and the eval report sums them per stage.

## 3. Prompts and the rubric

Static system prompts live in `studio/prompts.ts`, cached per model. Outlines (the builder writes the prose; the rules are fixed here):

- **Director** (≈ 1.5k tokens): the creative director of a small studio designing one homepage for one Slovenian business; six concepts, one per dealt stance, each an idea a designer could pitch in one sentence, not variations of one idea. Hard rules: direction comes from the business (trade, place, the client's words, the stance), never from the photos; at least four concepts stand without a client photo; only `hero`-graded photos may carry a first screen; facts only from the brief, and a stance never implies one (no "since 1920"); picks and signature only from the moodboard; follow the constraint card or reject it with a reason; the banned list (summary); a wordmark only without a logo; 4–9 moments, hero first, contact or hours present; voice in one sentence, formal vi. Anti-convergence: two concepts with the same first-screen carrier and palette temperature must change one. It is shown the neighbours' ideas as "already taken".
- **Designer**: the composition language's rules that guards don't explain (12-column grid, required phone placement, one display size per section, one call per screen, text spans), then the static catalogue; adapt the example presets or compose new arrangements; Slovene copy in the concept's voice, formal vi, the banned filler, no em dash, no invented facts, placeholders for missing facts, verbatim client text for quote, steps and qa; three headline candidates, never "Dobrodošli".
- **Pre-screen**: keep or drop each concept as broken (overlap, unreadable, empty or cut first screen), off-brief (wrong trade, invented content) or generic (reads as a template); never rank.
- **Tournament rubric** (from plan §8, scored 1–5 each): *idea* reads in the first screen at both widths; *focus*: one focal point per screen; *scale*: real contrast in size; *photos*: cropped on their subject and used large, or not needed; *rhythm* alternates; *phone*: the phone first screen is as strong as the desktop's; *specific*: the business could not be swapped for another of its trade; *craft*: alignment, spacing, nothing colliding; *voice*: the copy sounds like this business. Hard fails (out, whatever the scores): a banned pattern, a fact not in the brief, unreadable text. Plus `show`: would the owner show it to a customer.
- **Polish**: the winner's text fields as `{ path, text }`; returns replace operations on those paths only; code checks paths, limits and facts.

## 4. Art worker and the hero picture styles (S3)

`resolveArt` runs before the designers, so each designer knows exactly what it places:

| `heroArt.style` | Resolved to | How the designer places it |
|---|---|---|
| `photo` | the client's `hero`-graded photo | an `image` element or the photo layer, with the concept's treatment (CSS vocab) |
| `poster`, `linocut` | the trade's approved hero-art drawing (`motif/<trade>/<name>-solid`, tagged `hero-art` and its style; palette roles, so it recolours with the site); none approved → `painting` if pictures are allowed, else `shapes` | a `decor` element with `drawing` |
| `painting` | a reserved image id `img_art_<n>` whose file is the shapes art until the painting exists | an `image` element |
| `shapes` | `shapesArt(seed, colors)`: the bold-shapes generator (`packages/inventory/scripts/hero-art/shapes.mjs`) ported to a deterministic runtime function, ≤ 24 paths, palette roles | a `decor` element with `svg` |
| `none` | nothing (type, fact or wordmark carries it) | — |

- **Paintings** (decision `sb-hero-style`): after the pre-screen, only for survivors whose hero is a painting, at most `studio.paintings.maxPerSite`. Through the existing image path (`ImageGenerator`, fal `flux-2-pro`, 1536 × 1024, ≈ €0.04), each reserved under the live daily cap and the plan's monthly picture count. Prompt: the concept's `subject` (the trade's objects, ingredients or tools; never people, premises, signs or the client's work) plus `studio.paintings.style` (painterly, no people, no lettering, no signature, no frame). Then: crop `cropPct` from every edge (the pilot painted initials into a corner), the palette treatment from `tools/eval/src/hero-ai-picture.ts` (gradient map from the text colour through the primary to the paper) moved into `art.ts`, and a pre-screen-model check ("any letters, signature, person, shop front?"). A failing picture is generated once more, then the concept falls back to shapes. Labelled "Ustvarjeno z UI" with `origin: "generated"`, as every generated picture today. Survivors are re-rendered with their paintings before the tournament.
- **Hero art supply** (unit P5): poster and linocut for car repair and plumbing first (the bakery's exist), then restaurant, accountant and hairdresser for the exit run; ≈ 12 per style after the reset. Drawn offline with the generators, registered as drafts, approved in the gallery grid.
- **Wordmark**: code (`WORDMARK_STYLES` and the pairing); no model call.

## 5. Catalogue and shortlist budgets

Review §6.3 sets the numbers; here is where each lives:

| Budget | What | Cap (tokens at 3 characters each) | Checked by |
|---|---|---|---|
| static catalogue | `designerCatalogue({ compact: true, approved })`: types, props, one line per kind and per style value | 4,500 | `packages/engine/test/designer-catalogue.test.ts` (P2) |
| moodboard text | per stance: shortlisted ids, one line each (the asset's `note`, ≤ 15 words) | 3,000 | `studio/moodboard` test over 3 fixtures × 6 dealt stances (S1) |
| preset examples | ≤ 3 filled presets per designer request | 6,000 | designer request test (S2) |
| designer request | all text without images | 16,000 | same |

S0 measures the real ratio once with the free token-counting endpoint on Haiku 5.5 and Opus 5.5 and writes it to `studio.budgets.charsPerToken`. A note about one asset never goes into the static catalogue; it travels with the asset in the moodboard.

## 6. Approvals and the runtime catalogue

- The runtime catalogue is `registeredAssets()` with `decisions.json` applied, filtered to `approved` (`ctx.approved` for guards G8, `approvedVocabs` for the schema enums, the shortlist's `status` filter).
- `--catalogue drafts` (eval only) treats every non-rejected asset as approved and stamps `DRAFTS` on the report. Exit runs refuse it.
- The approval round (P4, review §6.5) must finish before the exit run (X). The preset composer it needs (P4a) is also the studio's no-model baseline: one concept per stance built from presets by seed, used as the tournament's control in S4 evals.

## 7. S0: the model bake-off

**Harness** (`pnpm eval:bakeoff`):
```
pnpm eval:bakeoff --stage designer --arms haiku:medium,haiku+opus:medium,sonnet:medium,opus:medium \
  --fixtures avtoservis-mrak,instalacije-rebernik,pekarna-kvas --concepts 2 --base <recordings dir> --max-eur 3
```
- Upstream stages replay from `--base` (free); only the stage under test is paid, with its own recordings under `tools/eval/recordings-studio/bakeoff/<stage>/<arm>/` (`--record-missing`, so an arm never pays twice).
- An arm is `<model>[+<advisor model>]:<effort>`; `+opus` sets `studio.advisor.<stage>` for the run (Haiku executor, Opus advisor, `max_uses` 2).
- Per arm the report gives **€ per finished stage** (input, output, cache, thinking, retries, repairs, refusal retries and advisor tokens included), failures (invalid output, dropped concepts, fallbacks), seconds, and the judge's verdicts. Outputs that render are judged pairwise against the expected default by the calibrated judge through Message Batches (half price), and a one-page contact sheet goes to the owner.
- **Decision rule:** keep the cheapest arm that is not worse than the best (pairwise losses ≤ 1 more of 6 than the best arm's) and fails no more than one more time in 6. Ties keep the expected default (Opus decides, Haiku produces). The result is a config change with the report linked in its HQ note.
- **Replay keys** (decision 0.10): `ModelRequest` gains `imageKeys?: (string | undefined)[]`, one per base64 image in order; `requestHash` uses the key instead of the bytes when given. Studio screenshots pass `sha256(rendered spec JSON + viewport + @sb/render version)`.

**S0's own paid part:**
1. **Judge calibration** on Okus round 1 (32 rated items with their 360 and 1280 shots, 30 answered pairs): arms Sonnet medium (today's `judge`), Opus medium, Haiku medium, through Batches. Metric: pairwise agreement with the owner (ties excluded) and agreement on "pokazal bi". The cheapest arm at ≥ 75 % pairwise agreement becomes the eval judge; if none reaches it, the owner's A/B is the only gate (plan §8) and the report says so. The same run picks the tournament's anchors.
2. **Photo analyst**: Haiku medium vs Sonnet medium on the 3 fixtures' photos (instalacije-rebernik has none, so 2 fixtures): grade agreement, alt text through the existing Slovene judge.

Where each stage's arms run (3 fixtures each):

| Stage | Arms | Judged by | In unit |
|---|---|---|---|
| photoAnalyst | haiku:medium, sonnet:medium | grade agreement, Slovene judge | S0 |
| director | opus:high, opus:medium, sonnet:medium | valid and distinct concepts (free), then 2 concepts each through Haiku designers, judged | S1 |
| designer | haiku:medium, haiku+opus:medium, sonnet:medium, opus:medium | judge on renders, repairs, fallbacks | S2 |
| polish | haiku:medium, opus:medium | Slovene judge and lint | S2 |
| prescreen | haiku:medium, sonnet:medium | agreement with the tournament's top 3 | S4 |
| tournament | opus:medium, opus:high, sonnet:medium | agreement with the owner's pairs | S4 |
| finisher | opus:medium, haiku+opus:medium | judge before/after, checks fixed, renders, € | S5 |
| kitPages | haiku:medium (sonnet:medium only if it fails) | checks, consistency with the homepage | S6 |

## 8. Money, fixtures and test discipline

**Per full studio run** (6 concepts, estimate from the price list; measured in S4): director ≈ €0.34 (≈ 16 images and 12k output tokens with thinking), designers ×6 ≈ €0.05, pre-screen ≈ €0.01, tournament ≈ €0.17, polish ≈ €0.01, finisher ≈ €0.30 (its cap), kit pages ≈ €0.05, paintings ≤ €0.16 (fal, only painting-led survivors). **≈ €0.9 for a homepage, ≈ €1.05 with paintings**, hard stop €1.50. Plan §6.3's €0.5–0.8 was low; reported, not optimised (owner).

**Fixtures:** first `avtoservis-mrak` (3 photos; its golden rated 2 by the owner), `instalacije-rebernik` (no photos; golden 2), `pekarna-kvas` (photos; the one fixture with steps and FAQ; golden 4). Exit run adds `gostilna-zlata-zlica` (restaurant, menu, photos), `racunovodstvo-seliskar` (no photos) and `frizerstvo-lana` (a people trade). Classify and brief replay from `tools/eval/recordings/<fixture>/home`; the studio's Brief (steps, FAQ, amenities) is re-recorded once per fixture (≈ €0.03 each).

**Every paid run** follows plan §11's test discipline: one question written in the HQ item before it runs, with its estimate and `--max-eur`; 1 fixture to debug, 3 to compare, 6 only for the exit; free checks (render, guards, facts, contact sheet) before any paid judge; recordings per run and `--reuse-pictures`; two strikes, then stop and think. Each `spend/<id>` entry carries `provider`.

| Unit | The one question | Sample | Anthropic € | fal € |
|---|---|---|---:|---:|
| S0 | Which judge agrees with the owner? Is Haiku good enough for photos? | 32 items + 30 pairs × 3 arms (Batches); 2 fixtures × 2 analyst arms | 2.5 | — |
| S1 | Does the director give ≥ 4 valid, distinct, photo-independent concepts; which setup? | 1 fixture ≤ 3 debug runs; 3 fixtures × 3 arms, 2 concepts each through Haiku designers | 3.0 | — |
| S2 | Which designer and polish setup holds quality cheapest? | 2 concepts × 3 fixtures × 4 arms; polish 2 arms | 3.5 | — |
| S3 | Do paintings pass the picture rule and the treatment, and does the fallback hold? | 3 fixtures × 2 paintings | 0.3 | 0.5 |
| S4 | Does the pre-screen keep what the tournament wants, and does the tournament agree with the owner? | 3 fixtures to the winner; tournament 3 arms on the same survivors | 4.0 | — |
| S5 | Does the finisher improve the winner within its caps; Opus or Haiku + advisor? | 1 fixture ≤ 3 debug; 3 fixtures × 2 arms | 4.5 | — |
| S6 | Do the other pages read as one design with the homepage? | 3 fixtures, full site | 1.5 | — |
| X | Phase 2 exit (§9) | 6 fixtures × 1 run (+ one re-run after fixes), judge via Batches | 7.0 | 0.5 |
| reserve | two-strikes iterations | — | 1.0 | — |
| **Total** | | | **≈ 27** | **≈ 1** |

Fits HQ `meta/budget` (`within`): October has ≈ €67 of the €77 left after ≈ €10 logged; every run's hard stop is ≤ €4 (under `askOver` €8); no session needs more than ≈ €10 of the €45 `perSession`; fal ≈ €1 of €8.60. Owner time: ≈ 20 min for the approval round (P4), ≈ 10 min for the exit A/B.

## 9. Gates

- **Phase 2 exit** (before Phase 3 spends ≈ €30): on the 6 exit fixtures, (1) each produces a studio homepage without falling back; (2) every free check passes at 360 and 1280 (axe, guards with 0 issues after repair, facts, banned list, placeholders flagged, no horizontal scroll, tap targets, Lighthouse mobile LCP ≤ 2.5 s, the page CSS rule); (3) the calibrated judge's median ≥ 3.8, and each fixture ≥ its golden + 0.4; (4) the owner's blind A/B in Okus round 3 (6 pairs, studio vs today): studio preferred on ≥ 5 and "pokazal bi" on ≥ 5; (5) the concepts kept per site are pairwise ≥ 0.35 apart (look distance); (6) € and seconds per stage reported, every run under its hard stop. A target missed is reported as measured; the threshold stays.
- **Switching on** stays plan §9: Phase 3's 40 fixtures, the owner prefers the studio on ≥ 16 of 20, calibrated judge median ≥ 4.0 with none below 3.5, uniqueness, the photo conditions, every check.
- **Admin trial** (decision D2, S7): `designer.agent: "admin"` runs the studio only for the admin's own sites; everyone else gets today's pipeline. Each run is reserved under the live daily cap.

## 10. Units

Roles per `docs/dev/agent-team.md` and the owner's usage rules: Sonnet medium is the default builder for specified units; Opus medium only for design-heavy or debugging units; asset makers medium; a Haiku scout before every builder or implementer; at most 2 building agents at once; only the director runs paid evals. Sizes: S ≤ 1 h, M 1–3 h, L 3–6 h of agent time.

| Id | Title | Depends on | Mode | Team | Size | Starts | Checks | € |
|---|---|---|---|---|---|---|---|---:|
| P1 | CI: vitest `pool: "forks"` (review §6.6) | — | S 1/5 | implementer · Sonnet · medium | S | **before 17 Oct** | full suite green in CI twice; shard times before/after in the PR; 10 runs without exit 132 tracked in HQ | 0 |
| P2 | Budgets: page CSS in gzip + LCP check, per-sheet raw caps kept, decor height cap back; catalogue budget split (review §6.1, §6.3) | — | S 2/5 | implementer · Sonnet · medium | S | **before 17 Oct** | `composed-css-weight`, `composed-v2`, `assets`, `designer-catalogue` tests; offline eval Lighthouse on the kitchen sink and the heaviest reference | 0 |
| P4a | Preset composer: a homepage per (fixture, stance) from presets, palettes and pairings by seed, no model | — | S 2/5 | implementer · Sonnet · medium | M | **before 17 Oct** | deterministic per seed; 0 guard issues; axe at 360/1280 on 9 pages | 0 |
| P4b | Approval round: Okus round 2 (24 references, 9 composer pages, 15 pairs, tap-to-flag), family grids, propagation to `decisions.json` | P4a | S 2/5 | implementer · Sonnet · medium; director publishes the artifact | M | **before 17 Oct** | propagation tests (approve, reject, untouched); export round-trip through `inventory:decide` | 0 |
| P3a | Guards = browser: preset × tone × palette axe agreement test in CI; secondary-ink table in `roles.ts` | guard-gaps merged | S 3/5 | builder · Opus · medium | M | after 17 Oct (before if usage allows) | the test, sharded; 0 mismatches or each one fixed | 0 |
| P3b | Language gaps (review §6.4): marker drawing, plate and list scale, contact alignment, tall sections, band-split e-mail, steps `row` CSS | P2, SV | S 2/5 | builder · Opus · medium | M | after | a browser test per gap at 360/1280; page CSS rule | 0 |
| P5 | Hero art: poster + linocut for car repair and plumbing, then restaurant, accountant, hairdresser | — | S | asset maker · Opus · medium | M | after | drawing schema, 25 KiB hero-art budget, palette roles only, axe on the renders; owner grid | 0 |
| SV | Spec v22 (§2.7) and the `design_alternatives` migration (§2.8) | — | S 2/5 | implementer · Sonnet · medium; reviewer · Opus · high | S | after | identity migration on goldens, m/s/j, kitchen sink, references; designer-off request snapshots unchanged; migrate and migrate-check in CI | 0 |
| S0 | Bake-off harness, studio stage config, `imageKeys` replay, judge calibration, analyst arms | SV | S 2/5 | implementer · Sonnet · medium; director runs the paid part | M | after | harness tests on scripted transports (cost per finished stage, arms, replay by key); calibration report | 2.5 |
| S1 | Photo analyst; moodboards; director, `validateConcepts`, registry pre-gate | S0 | D 4/5 | builder · Opus · medium (director, validation); implementer · Sonnet · medium (analyst, moodboards) | L | after | unit tests per rule on recorded outputs; budgets; ≥ 4 photo-free concepts on the 3 fixtures | 3.0 |
| S2 | Designers, assembly, repair → validate → fallback, facts; polish; studio Brief extraction | S1 | D 3/5 | builder · Opus · medium (designer, assembly); implementer · Sonnet · medium (polish, Brief) | L | after | assembly and fallback tests; designer-off snapshots unchanged; 0 guard issues after repair on the 3 fixtures | 3.5 |
| S3 | Art worker: `resolveArt`, `shapesArt`, paintings for survivors, treatment, lettering check | S1, P5 | S 3/5 | implementer · Sonnet · medium | M | after, beside S2 | resolve table tests; painting path on a scripted fal transport; cap and label tests | 0.3 + 0.5 fal |
| S4 | Render all, pre-screen, tournament, runners-up stored; `runStudio` end to end | S2, S3, SV | D 4/5 | builder · Opus · medium | L | after | end-to-end replay on the 3 fixtures (free after recording); fallback on every abort path; events | 4.0 |
| S5 | Finisher loop with its tools and caps; critique replaced when on | S4 | S 2/5 | builder · Opus · medium | M | after | tool tests, cap tests, last valid spec kept, replay of a loop | 4.5 |
| S6 | Kit and the other pages | S4 | S 2/5 | implementer · Sonnet · medium | M | after, beside S5 | kit extraction tests; full-site checks on 3 fixtures | 1.5 |
| S7 | Owner screens: "Oblikovalec dela" progress, "Druge zamisli", "Predlagaj drugačno", editor slots for composed sections (incl. steps and FAQ forms), `designer.agent: "admin"` | S4 | D 4/5 | builder · Opus · medium (progress, alternatives); implementer · Sonnet · medium (editor slots) | L | after, beside S5/S6 | browser tests at 360 and 1280; preview = published unchanged; allowance counted for "Predlagaj drugačno" | 0 |
| X | Exit run, Okus round 3 A/B, report in `eval/` | all, P4b approved | S | director | S | after | §9 | 7.0 + 0.5 fal |
| R | Phase 2 review | X | — | architect · Opus · xhigh | — | after | report | 0 |

**Scout first** (Haiku, medium; one map each): S2 — how a composed homepage becomes a page spec (direction, skeleton, chrome, `enforceDesign`), and the content step's repair and retry path; S4 — the check browser, screenshots and the progress events; S5 — `runAgent`, its recording and caps; S7 — the editor's section slots, versions, the job events stream; P3a — the side-by-side script's axe matrix in #197.

## 11. Order and parallelism

```
before 17 Oct:  P1 ─ P2                    P4a ─ P4b ─ (owner approves, ≈ 20 min) ─────────────────────┐
after 17 Oct:   SV ─ S0 ─ S1 ─┬─ S2 ─┬─ S4 ─┬─ S5 ─┐                                                   │
                P5 ───────────┴─ S3 ─┘      ├─ S6 ─┼─ X ◄────────────────────────────────────────────────┘
                P3a ─ P3b                   └─ S7 ─┘   └─ R
```

| Wave | Agents (≤ 2) | Director |
|---|---|---|
| 1 (now) | P1 ∥ P4a | merge #196, #197, `claude/studio-guard-gaps` |
| 2 | P2 ∥ P4b | publish the approval round |
| 3 (17 Oct) | SV ∥ P5 | reviewer on SV |
| 4 | S0 ∥ P3a | S0 calibration (€2.5) |
| 5 | S1 builder ∥ S1 implementer | S1 runs (€3) |
| 6 | S2 builder ∥ S3 | S2, S3 runs (€3.8 + fal) |
| 7 | S4 ∥ P3b | S4 runs (€4); reviewer on the migration if not done in SV |
| 8 | S5 ∥ S6 | S5, S6 runs (€6) |
| 9 | S7 builder ∥ S7 implementer | — |
| 10 | — | X (€7.5), Okus round 3, then R |

Units that touch the same files never run together: S2 and S3 meet only at `ArtPlan` (S3 owns `art.ts`, S2 reads it); S5 and S6 meet at `run.ts`, which the director merges.

## 12. Risks

- **Approvals lag.** Engineering runs on `--catalogue drafts`; X waits. A rejected asset just leaves the catalogue.
- **Haiku can't hold the language.** Structured output may not compile for the full composed schema, or Haiku may produce many repairs and fallbacks. S2 measures both and has the JSON-mode path and the Sonnet and advisor arms.
- **The judge can't be calibrated** (the owner gave 22 of 32 items a 4). Pairs carry the calibration; if agreement stays under 75 %, the owner's A/B decides (plan §8) and Phase 2's exit leans on it.
- **Concepts converge.** The pre-gate drops near-duplicates; the director prompt's anti-convergence rule; S1 reports the pairwise distances.
- **Paintings with lettering or people.** Crop, the check, one retry, then shapes. Labelled as every generated picture.
- **Cost or time above estimate.** Reported per stage; the plan §12 levers (fewer concepts, Sonnet for the finisher, one finisher round) wait for the owner's decision with numbers.
- **Replays break across machines.** Image keys by rendered spec (decision 0.10).
- **Preview = published.** The studio writes a spec and nothing else; the existing preview = published test covers studio output (S4 adds one studio spec to it).
- **Prompt injection through the client's text.** The director and designers see the brief, not raw HTML; facts and banned-copy checks run in code after every model step.

## 13. Deferred Phase 1 work

As in review §7: hero art beyond the Phase 2 trades before Phase 3; references 24 → 40 in Phase 3 prep, aimed at what loses in the tournament; ornaments, edges, icon styles, motion 20, fact objects 20 in Phase 4.

## 14. Decisions for the owner (HQ)

- **D1 `sb-studio-approvals`.** "Before the new designer can use the new fonts, colours, layouts and pictures, you need to OK them. How?" (a) Look at about 30 example pages and tap anything you don't like; everything else on a page you'd show a customer is approved (≈ 20 minutes). (b) Approve everything that passed our automatic checks now and reject things later when you see them on a real page (0 minutes now; you may meet things you dislike in your tests). (c) Go through all ≈ 600 pieces one by one (2–3 hours). *Recommendation: (a).*
- **D2 `sb-studio-admin-trial`.** "Do you want to try the new designer on your own test sites before the big test in November? Each try costs about €1 of the daily AI limit and takes about 4 minutes." (a) Yes, only on my account (recommended); (b) No, wait for the November test.
