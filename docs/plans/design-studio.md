# Design studio: every site designed, distinctive and impressive

Status: plan, 2026-10-09. Nothing built. **Priority #1** (owner, 2026-10-09). This plan takes over the scope of `docs/plans/ai-designer.md` (PR #158). That plan's composition language and agent loop (spec PRs A and B) stay as the foundations here (Phase 0); everything else is bigger.

The owner (2026-10-09): "We have to significantly increase the quality and variety of sites we generate … an AI design layer builds something high standard and unique … upgrade it by a TON … we should also expand our inventory of assets, shapes, elements … Until now, I haven't seen an impressive output generated." And: "ambitious, the exact right word. Let's push the ambitious as much as we can." Production cost per site is not a constraint for now ("let's worry about it later"). It is measured and reported, and decided later.

## 1. Where we are

### What the output looks like

`eval/offline-contact-sheet.png` (the 10 goldens at 360 px, families + skeleton + concept on) shows that **all ten phone first screens are the same page**:

- a logo or name, with a boxed "Meni" button on the right;
- the street address as the eyebrow (9 of 10);
- a text-first hero (headline, paragraph, text link) with the photo pushed below the fold;
- the same "Klic / Navodila za pot" bar at the bottom.

Fonts and colours differ. The structure, the scale contrast and the use of photos don't. The judge gives 3.17–3.42 out of 5 (`eval/variety-2026-10-08.md`). The owner has never seen an impressive one.

### Why

1. **Nobody designs.** The design call returns a direction id and ten numbers: about 200 output tokens and €0.003. It never sees the photos, the logo or the page.
2. **Nobody looks.** The critique sees screenshots but mostly fixes copy, at most two rounds.
3. **There is one attempt.** A designer explores several ideas and keeps the best. We generate one and ship it.
4. **The model converges.** Asked for "a design", a model drifts to tasteful-generic. Nothing forces it somewhere specific.
5. **The materials are few.** Inventory today (counted 2026-10-09, read from the code):

| Material | Today |
|---|---|
| Section types / variants | 30 / 81 (hero options 16) |
| Directions (visual systems) | 20 (10 general, 10 trade templates) |
| Font families / pairs | 19 / 20 |
| Palettes | 20 direction fallbacks + 30 family palettes + logo extraction |
| Motifs (trade drawings) | 10 + 6 sub-trade |
| Picture treatments / shapes | 8 / 4 |
| Headers / footers | 8 / 4 |
| Icons | 5 (phone, pin, clock, mail, calendar) |
| Motion on generated sites | none (one scroll-driven call-bar entrance) |
| Hand-made reference homepages | 19 (10 trades + 9 swim-school variations) |

6. **The bar is the judge's, not the owner's.** The judge has never been checked against the owner's eye. A 3.4 from the judge and "not impressive" from the owner are the same fact.

## 2. The target

North star: **every homepage looks as if a good small studio designed it for that one business**: one clear idea, built from the business's own photos, facts and place, and unlike any other site we have made for its trade.

Measured, and the gate for switching it on (§9):

- **The owner's eye first.** In a blind side-by-side on 20 businesses, the owner prefers the studio's site on ≥ 16 of them and would show ≥ 16 of the studio's sites to a customer as they are.
- **A judge that agrees with the owner.** A judge calibrated on the owner's ratings, median ≥ 4.0 and none below 3.5, at 360 and 1280 px.
- **Unique.** 0 same-trade pairs judged "same template". Look distance within a trade ≥ today's across-trade distance (0.61).
- **Not dependent on the client's photos.** On the fixtures with no photos, one photo or poor phone photos, the judge's median is within 0.3 of the fixtures with good photos, and the owner's blind preference holds on them too (§6.6).
- **Safe.** Every automated check passes (banned list, contrast, facts, mobile checklist, axe, Lighthouse) at both widths.

## 3. Architecture

```
            ┌──────────────────────── TASTE & MEASUREMENT ────────────────────────┐
            │ owner ratings (Okus) → calibrated critic · 40 fixtures · blind A/B   │
            └──────────────────────────────────────────────────────────────────────┘
 INVENTORY (×5–10, tagged, owner-approved)          SEED & STANCES (divergence)
 fonts · palettes · compositions · masks ·          design.seed deals stances, constraint
 treatments · motifs · ornaments · type and         cards and references; the uniqueness
 fact objects · motion · wordmarks · references     registry rejects look-alikes
            │                                                  │
            └──────────── retrieval: a shortlist per stance ───┘
                                     ▼
 THE STUDIO (runtime agents)
 understand → creative director, Opus (6 concepts) → designers ×6 in parallel, Haiku → art worker, Haiku
   → render all → Haiku pre-screen → Opus tournament critic → copy polish → finisher loop → site kit → gate
                                     ▼
 GUARDS IN CODE: spec is the source of truth · banned list · contrast · facts · phone layout
                                     ▲
 THE LAB (flywheel): free-form sketches → owner rates → distilled into inventory and language
```

Six layers. Each is a set of PRs (§11).

1. **Inventory**: the materials, five to ten times today's, machine-readable, tagged, each piece render-tested and approved by the owner.
2. **Seed and stances**: what makes each site start somewhere different, and the registry that makes sure it ends somewhere different.
3. **The studio**: the runtime agents that design, compare and refine.
4. **Guards**: everything that must hold, held in code, as today.
5. **Taste and measurement**: the owner's eye turned into numbers the agents and the gate can use.
6. **The lab**: how the inventory and the language keep growing from evidence.

The agents compose from the inventory and never build a site from scratch. The spec stays the single source of truth, the preview stays equal to the published site, and owner edits, translations, "Druga podoba", fact checks and publishing rules keep working.

## 4. Inventory

### 4.1 Targets

| Material | Today | Target | Notes |
|---|---|---|---|
| Font families | 19 | **60** | OFL only, full Slovene coverage (č š ž ć đ, tested by a glyph check), variable where possible, subset woff2. Roles: display, text, utility |
| Font pairings | 20 | **120** | tagged by stance, voice (warm, exact, loud, quiet, old, new), trade fit |
| Palettes | 50 + logo | **200** curated + logo and photo extraction | roles as today (incl. band); tagged by stance, ground and temperature; contrast pre-checked |
| Composition presets | 81 section variants | **300** (first wave 120) | written in the composition language (§7), per intent: opener 60, story, offer, prices/menu, proof-by-fact, place, hours, team, gallery, process, FAQ, close |
| Element kinds | 10 (spec v19) | **24** | §7.2 |
| Masks and frames | 8 treatments + 4 shapes | **30** | arch, circle, cut corner, stamp, ticket, window, polaroid, torn edge, scallop, tab, lozenge, shield, leaf, keyhole … |
| Photo treatments | 8 | **16** | duotone, tritone, tint, grain, B&W with spot colour, riso, high-key, low-key, cut-out on a colour field … (no dot or grid screens: give-away list) |
| Textures | 0 | **12** | paper, linen, concrete, wood grain, plaster, felt, kraft … (no dot or grid patterns) |
| Trade motifs and spot drawings | 16 | **150** | ≈ 40 trades and sub-trades × 3–4, drawn in 3 styles (line, solid, cut-paper) |
| Slovene ornaments | 0 | **24** | from Slovene visual culture: beehive panels, lace, folk carving, alpine trail marks, Plečnik-era lettering, Yugoslav-era signage. Drawn new, not traced |
| Dividers and section transitions | 3 | **20** | rule, motif, cut, overlap, torn edge, oversized motif crossing two sections |
| Type treatments | ~3 | **15** | giant numeral, stacked display, circular text, vertical label, drop cap, wordmark lockup, photo-filled text (swim templates), knockout over photo … (no italic accent words, no tracked uppercase eyebrows: banned list) |
| Fact objects | plate, seal, receipt | **20** | registration plate, stamp, ticket, tag, seal, receipt, docket, label, timetable, trail sign, price tag, calendar leaf … Every value comes from the client's facts |
| Icons | 5 | **3 styles × 40** | for practical facts only (parking, card payment, wheelchair access, Wi-Fi …); feature-card icons stay banned |
| Motion presets | 0 | **20** | on `@sb/morph` and CSS scroll-driven animation: headline reveal, photo unmask, stagger, marquee, counter, sticky stack, parallax-lite … All behind `prefers-reduced-motion`, a JS budget, no layout shift |
| Wordmarks | 0 | generator | for businesses without a logo (§6.5) |
| Stances | 0 | **80** | §5.2 |
| Constraint cards | 0 | **50** | §5.3 |
| Reference homepages | 19 | **60** | 40 new hand-made ones across stances and trades, rated by the owner |

### 4.2 The registry

New package `packages/inventory`: one typed record per asset, and the code that renders it.

```ts
Asset = {
  id: string,                         // "mask/arch", "motif/bakery/peel-line", "comp/opener/plate-poster"
  kind: AssetKind,                    // font, pairing, palette, composition, mask, treatment, texture, motif,
                                      // ornament, divider, typeTreatment, factObject, icon, motion, stance, constraint, reference
  tags: { trades: string[], stances: string[], intents: Intent[], mood: string[],
          ground: ("white"|"tint"|"dark")[], density: ("compact"|"regular"|"airy")[] },
  phone: "ok" | "desktop-only" | "adapted",   // a phone rendering is required unless desktop-only (decor)
  bytes: number,                      // what it adds to a page
  license: "own" | "OFL-1.1" | "ISC" | …,
  status: "draft" | "approved" | "rejected",  // only approved assets reach the runtime catalogue
  note?: string,
}
```

- **Gallery**: `pnpm inventory:sheet` renders every asset at 360 and 1280 px, in three grounds and two palettes, into contact sheets. They are published as a private artifact with an approve/reject button per asset (artifact database). The owner can sample it or approve all of it. Their rejections are the first taste data.
- **Checks per asset (CI)**: render at both widths, axe, no horizontal scroll, the banned-pattern checks, contrast in every palette it's tagged for, byte budget, licence present.
- **Retrieval, not the whole catalogue.** 300 compositions and 150 motifs don't fit a prompt and would drown the model. Code builds a **shortlist** per dealt stance: about 40 assets ranked by tag match, trade fit and the registry (things neighbours used rank lower). The director sees each shortlist as a moodboard: ids, one line each, and thumbnails for the visual ones.

### 4.3 How the inventory gets made

Free, in overnight Claude Code sessions, not in API calls. Each session builds one material family to the targets above, with its tests and contact sheet. A session hand-making reference homepages works the way the 19 we have were made. Sources: our own drawing and writing; fonts and icons under open licences. Nothing traced or copied from third-party sites.

## 5. Seed, stances and uniqueness

### 5.1 The seed

`design.seed` (spec): a short string stored on the site, derived from the site id and the generation number (today's `siteSeed` in `packages/engine/src/variety.ts`). "Ustvari znova" advances it. The seed decides, deterministically:

- which **stances** the director is dealt (6, one per concept);
- one **constraint card** per concept;
- which **references** the director is shown;
- tie-breaks everywhere code picks (shortlist order, palette candidates).

The same seed with the same recordings replays the same run, so evals and bug reports are reproducible. The owner never sees the seed. `/admin` shows it.

### 5.2 Stances

A stance is a named visual language a designer could pitch in a sentence, with enough structure for code to retrieve materials. It is the main tool against convergence: the model is told *where* to go, not just *to design*.

```ts
Stance = {
  id: "workshop-docket",
  name: "Workshop docket",
  pitch: "The page reads like the job ticket you get with your car: carbon-copy blue, stamped numbers, typed lines.",
  trades: { fit: string[], never: string[] },
  axes: { ground, type: pairingTags[], palette: paletteTags[], imagery: treatmentIds[], shape, density, motion: "still"|"calm"|"lively" },
  signatures: assetId[],            // fact objects, type treatments, ornaments typical of it
  references: referenceId[],        // 1–3 reference homepages showing it done well
  avoid: string,                    // what it turns into when done badly
}
```

There are 80 of them, across families of language:

- **Print and paper**: docket, receipt, seed packet, recipe card, pharmacy label, timetable, broadsheet, postcard.
- **Signage**: enamel sign, shopfront lettering, trail marker, street plate.
- **Craft**: cut paper, letterpress, stencil, embroidery, ceramic tile.
- **Modernist**: Swiss grid, Bauhaus geometry, Plečnik-era classicism, Yugoslav modernism.
- **Nature and place**: alpine, karst stone, vineyard rows, river.
- **Contemporary**: editorial magazine, oversized type, monochrome photo, colour block.

Stances rooted in Slovene visual culture are what no foreign builder will have. Stances are visual only: they never imply a fact (no "since 1920", no heritage the client didn't give).

**Dealing**: filter by trade fit, weight by fit to the brief's concept (goal, angle, materials, local anchor), down-weight stances used by same-trade sites (registry) and by this site's previous generations, then draw 6 by seed, at most two from the same family.

### 5.3 Constraint cards

One per concept, drawn by seed. They push a concept away from the safe middle the way a creative brief does. Examples:

- "the headline is the largest thing on the page";
- "one photo only, full bleed";
- "the first screen has no photo; a drawn object carries it";
- "a 5/7 asymmetric grid";
- "the strongest fact is an object";
- "two colours and paper";
- "the phone number is the hero".

The director may reject a card with a written reason. The critic sees the cards.

### 5.4 The uniqueness registry

A new table `look_fingerprints`, one row per generated look (also unpublished previews; deleted with the site):

- site, trade, town, stance, seed;
- the genome vector (11 axes);
- the composition signature: the homepage's sequence of intents plus layout classes;
- the palette in Lab;
- a perceptual hash of the first screen at 360 and 1280 px (computed locally, free).

Distance is today's look distance extended with the composition signature and the perceptual hash. **Gate**: a concept too close to any site of the same trade (anywhere) or any site in the same town is re-dealt before compose, and checked again after render. Thresholds live in config, calibrated on the twins. This replaces today's neighbour check (`repo.neighbourLooks`), which looks only at a few neighbours' design fields.

## 6. The studio (runtime)

### 6.1 Pipeline with `designer.agent` on

```
classify ─▶ brief + concept ─▶ photo analyst ─▶ creative director ─▶ designers A–F (parallel)
 Haiku      Sonnet or Haiku    Haiku, vision    Opus, 6 concepts       Haiku
     ─▶ art worker, Haiku (wordmark, drawings, photo treatments, generated pictures per concept)
     ─▶ render all at 360 + 1280 ─▶ pre-screen, Haiku (drops broken or off-brief concepts)
     ─▶ tournament critic, Opus (the best 3–4) ─▶ copy polish on the winner ─▶ save v1 (preview shows it)
     ─▶ finisher loop on the winner (render · check · patch · search inventory) ─▶ save v2
     ─▶ site kit ─▶ other pages composed with the kit ─▶ gate (guards, checks, registry, Lighthouse)
```

Models are per-stage config values and start as listed; the bake-off in §6.4 confirms or moves each one.

| Stage | Model (config) | What it does |
|---|---|---|
| **Photo analyst** | Haiku, vision | Per photo: subject, quality, light, focal point, dominant colours, whether it can be the hero, cut out or cropped tight, and photos not to use. Ranks the photos. Replaces the alt-text call's vision work and writes alt text too |
| **Creative director** | Opus, high, vision | Sees the brief, the photos with their analysis, the logo, the dealt stances with their moodboards, the references, and the neighbours' ideas. Writes 6 **concepts**, one per stance, each with: idea (one sentence), stance, constraint card, picks from the moodboard, genome with a reason per axis, type pairing, palette roles (from logo, photos or library), signature device, wordmark plan, the homepage as 4–9 moments, and the voice for the copy. Code validates and repairs the genome and contrast, and checks the registry |
| **Designers ×6** | Haiku, high (Haiku with an Opus advisor, and Opus at low effort, compared in the bake-off) | One per concept, in parallel. Composes the homepage in the composition language (§7), adapting presets from the shortlist or composing new ones, and drafts the Slovene copy in the concept's voice, with 3 headline candidates for the hero. Same validation, repair, fact check and placeholder rules as today's content step |
| **Art worker** | Haiku + code + fal | Wordmark (§6.5); per-site spot drawings and ornaments in the stance's drawing style (constrained SVG, sanitised, palette roles only); photo crops and treatments (code: sharp); cut-outs and generated pictures in the concept's art direction, within decision `sb-studio-imagery` |
| **Pre-screen** | Haiku, vision | Looks at every concept's first screens and check results and drops the broken or off-brief ones, so Opus judges only the best 3–4. Never picks the winner |
| **Tournament critic** | Opus, vision | Sees the surviving concepts rendered at both widths (first screen and full page), the rubric, and owner-rated anchors (§8). Compares pairwise, picks a winner with reasons, and scores each against the bar. Losing concepts are kept as stored alternatives |
| **Copy polish** | Opus (low effort) or Haiku (bake-off) | The winner's Slovene copy only, one call: voice, rhythm, the banned filler list, headlines. Concepts compete on design with draft copy; the copy budget goes to the one that wins |
| **Finisher loop** | Opus, medium, tools; or Haiku with an Opus advisor (bake-off) | On the winner: `render_page`, `run_checks`, `patch_spec`, `search_inventory` (a shortlist for a new need), `done`. Works until the rubric and the checks pass, or a cap (renders, turns, € per site, time). Replaces today's critique when on |
| **Site kit** | code + Haiku | The winner's system (type, palette, components used, signature device, section rhythm, motion level) saved as `design.kit`. The other pages are composed with the kit so the whole site is one design. Full sites only |

Runs that fail stay safe. A concept that fails validation is dropped (the others go on). If all fail, today's pipeline runs. A finisher that hits a cap keeps the last valid spec. The page never fails because of the studio.

### 6.2 What the owner sees

- **"Oblikovalec dela"**: the wait becomes the show. The progress screen shows the real moodboard (fonts, colours, the photos chosen), then the concepts arriving as sketches, then the winner building itself (`@sb/morph`, as on the landing page). Each step shows real data from the run, never a fake animation.
- **"Druge zamisli"**: the 2–3 runners-up from the tournament are already designed and paid for. Switching to one is free and instant, and each is a version. This replaces the planned paid "Druga podoba" under the designer (spec §6).
- **"Predlagaj drugačno"** on a section: the designer recomposes that one section within the kit (a small paid call, counted in the AI allowance).
- **"Ustvari znova"**: a new seed, so new stances and new concepts. The previous ideas are passed so they aren't repeated.

### 6.3 Cost and time (estimate, to be measured)

From the Anthropic price list (Haiku 5.5 $0.10/$0.50 for prompts ≤ 100K tokens, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20 per MTok, cache reads 0.1×; €0.86 per $), with cached system blocks:

| Stage | € per homepage | Time |
|---|---|---|
| Classify (Haiku), brief and concept (Sonnet or Haiku) | 0.01–0.04 | 10 s |
| Photo analyst (Haiku) | < 0.01 | 8 s (parallel with brief) |
| Creative director, 6 concepts (Opus) | 0.20 | 35–50 s |
| Designers ×6 (Haiku, parallel) | 0.03 | 30–50 s |
| Art worker (Haiku, without generated pictures) | < 0.01 | 10 s |
| Render, pre-screen (Haiku), tournament over 3–4 (Opus) | 0.10 | 30 s |
| Copy polish on the winner (Sonnet; Haiku < 0.01) | 0.02 | 10 s |
| Finisher loop, ≤ 4 renders (Opus; Haiku + Opus advisor ≈ 0.10) | 0.10–0.30 | 40–80 s |
| Generated pictures (when photos are missing) | 0.05–0.20 | parallel |
| **Homepage** | **≈ €0.5–0.8** (today €0.15; with Sonnet designers ×3 it was ≈ €0.9–1.1) | **≈ 2½–4 min** to the final; the winner shows at ≈ 2 min |
| Other pages of a full site (site kit, Haiku) | + €0.05–0.1 | + 1 min |

With Haiku doing the production work, Opus's two calls (the idea and the pick) are most of the model cost, and generated pictures become the largest single line on photo-less sites.

As the owner asked, this is reported, not optimised, until the studio is good. The levers for later are listed in §12. Which tiers get the studio is a later decision with real numbers.

### 6.4 Model roles: Opus decides, Haiku produces, code orchestrates

The owner's direction (2026-10-09, HQ `sb-model-roles`): use the 5.5 family as a team. Opus 5.5 makes the decisions that set quality (the idea, the pick, what to fix); Haiku 5.5 does the volume work. Haiku 5.5 is 20× cheaper than Sonnet 5.5 and 40× cheaper than Opus 5.5, has a 1M context, sees images, has effort levels, and Anthropic describes it as substantially better at instruction following and at running as a sub-agent. Its price buys **breadth**: twice the concepts for less money.

**Three ways to combine them, and where each is used:**

1. **Code orchestrates (the backbone).** The pipeline calls Opus for decisions, fans out Haiku calls in parallel for production, then calls Opus to judge. Deterministic, recorded per call for replay tests, capped by the spend ledger. Used for every stage above.
2. **Haiku executes, Opus advises** (the advisor tool, beta `advisor-tool-2026-03-01`; a Haiku 5.5 executor with an Opus 5.5 advisor is a valid pair). Haiku does the long generation and consults Opus partway, with `max_uses` and `max_tokens` caps. Tested for the designers and the finisher in the bake-off. Catch: Opus 5.5's advice comes back encrypted, so it can be replayed but not logged or read.
3. **Opus runs a loop and spawns Haiku helpers as tools.** The most autonomous, and the hardest to cap and replay. Only considered for the finisher if 1 and 2 fall short. Anthropic's hosted Managed Agents don't fit: rendering, checks and the spec must run on our side.

**What our code must handle for Haiku 5.5** (Anthropic's migration notes; our client already sends no temperature, top_p, prefill or thinking budget):

- Thinking is on by default and counts toward `max_tokens`: every Haiku stage gets headroom (classify's 1024 is too tight), content blocks are read by type, and `effort` is set explicitly (default `medium`; `low` for classify and the pre-screen).
- No server-side refusal fallback: on `stop_reason: "refusal"` the client retries the call once on Opus 5.5 (with its server-side fallback) and logs it.
- The newer tokenizer counts the same text as about 30 % more tokens than Haiku 4.5, and prompts over 100K tokens use a second price card ($0.50/$2.50). Both go into config prices; cost baselines are redone.
- Prompt caches are per model: each stage stays on one model, with no per-request cascades between models.

**The bake-off (Phase 2, ≈ €3):** each stage on Haiku, Haiku with an Opus advisor where it applies, Opus at low or medium effort, and Sonnet as a comparison arm, on 3 fixtures, judged and looked at by the owner. Cost is compared **per finished stage** (tokens, retries and repairs included), not per token: Sonnet 5.5's lower price can be eaten by its higher token use. Each stage keeps the cheapest setup that holds the quality; the expected default is Opus + Haiku only (owner, 2026-10-10). Nothing moves without a number.

**Development work too:** in Claude Code sessions, search and log-reading subagents run on Haiku; code writing stays on the main model (CLAUDE.md). Bulk inventory drafting that needs API calls (for example many SVG drawing variants to curate) uses Haiku through the eval tooling, with Opus or the owner curating.

### 6.5 Wordmarks for businesses without a logo

Many small businesses have none. The art worker proposes a typographic wordmark: the business name set in a fitting font from the inventory, with a treatment (lockup, stamp, plate, circular text, a monogram of the initials). It is never a drawn symbol pretending to be a brand mark. The wordmark is stored in the spec, the owner can replace it with their own logo, and it is used in the header, the footer and the share image.

### 6.6 Photos help; they never lead

Owner (2026-10-11): customer photos can help the design, but the studio must not rely on them. Most small businesses have a few dark phone photos or none. So:

- **Direction comes from the business, not the pictures.** The stance deal, the brief (trade, sub-trade, place, voice, the client's own words) and the references set the direction. The creative director reads the photo analysis as *evidence of what exists*, never as the idea. At least 4 of the 6 concepts must stand without any client photo: their first screen is carried by type, a drawn object, a fact object, colour fields or the wordmark, and photos only fill slots further down.
- **Photos are graded before they are used.** The photo analyst marks each photo hero, supporting, detail-only or don't-use. Only "hero" photos may carry a first screen or a full-bleed band; below that grade a concept places the photo small, cropped tight, treated (duotone, tint, cut-out) or not at all. Placeholders are never padded with photos the analyst rejected.
- **Palette from the library first.** The palette comes from the curated library by stance and trade; the logo may steer it; photo-extracted colours are one candidate among them, never the default, and only from photos graded supporting or better.
- **Generated pictures stay within today's rule** (decision sb-studio-imagery): drawings, cut-outs of the client's own product photos and up to 3 labelled illustrations; never a fake photo of the business, its people or its premises.
- **Measured.** The eval reports every target split by photo condition (good, poor, one, none), and the no-photo fixtures carry the same gate (§2). The tournament judge never scores a concept higher for having photos.

## 7. Composition language v2

The base is spec v19 from `docs/plans/ai-designer-spec.md` §2: composed sections on a 12-column grid with a required phone placement, guards in code, and presets as fallback. v2 adds the following. It comes as a follow-up PR (F1b) so PR A stays shippable.

### 7.1 Section level

- **Background layers**: a colour field, a texture, an oversized motif or ornament, or a photo with treatment and scrim.
- **Transitions between sections**: a cut, an overlap (the next section rises over this one), a torn edge, or a motif divider crossing both.
- **Motion preset per section** (from the inventory), with a page-level motion level from the kit (still, calm, lively).
- **Sticky behaviour** (desktop only): a pinned column while the other scrolls.

### 7.2 New element kinds (10 → 24)

| Kind | What | Fact rule |
|---|---|---|
| `collage` | 2–4 photos layered with masks and offsets | owner or labelled generated photos only |
| `wordmark` | the site's wordmark or logo at any size | none |
| `factObject` | the 20 fact objects (replaces `fact`'s treatments) | value from the client's facts |
| `typeTreatment` | circular text, vertical label, giant numeral, stacked display, photo-filled text | text from the copy |
| `marquee` | a slow moving line of short phrases (motion off on reduced motion) | from the copy |
| `sticker` | a small rotated label | from the copy or facts; never a rating or award |
| `ribbon` | a band of text across a section edge | same |
| `map` | a drawn map of the business's place: the street and a pin, no tiles | address from the client |
| `timeline` | dated steps | dates from the client only |
| `menuBoard` | prices or a menu as a board, docket or label sheet | prices from the client, or "po dogovoru" |
| `galleryStrip` | a horizontal strip of photos with scroll snap | owner photos |
| `beforeAfter` | two owner photos with a divider | owner photos only, labelled by the owner |
| `iconFacts` | practical facts with inventory icons (parking, cards, access) | from the client's facts; never as feature cards |
| `quote` | a quotation | only verbatim from the client's own input, attributed as given; otherwise not available |

### 7.3 Later, and only on evidence: scoped CSS (Phase 4)

If the lab shows (§10) that the best sketches keep needing things the language can't say, the next step is a scoped style block per composed section, written by the designer and stored in the spec. It would be filtered through a CSS allow-list (properties, values only from design tokens, no `url()`, no positioning outside the section, animation only from presets), and rendering would check contrast and the banned list. This is the biggest jump in freedom that still keeps the spec as the source of truth. It needs its own decision (§13).

## 8. Taste: making the owner's eye measurable

- **Okus** (a private artifact with a database, like HQ): the owner rates homepages at 360 and 1280 px, 1–5, plus "would I show this to a customer" and an optional note, and answers pairwise "which is better" questions. Round 1 has about 60 items: the 19 hand-made references, the 10 current goldens, and 30 lab sketches across stances. It takes about 20 minutes. There is a round per phase.
- **Calibrated critic**: the critic's and the judge's prompts carry the owner's anchors (8–12 rated first screens with scores and notes, chosen by code to cover the scale). The harness measures agreement on held-out owner ratings: pairwise agreement must be ≥ 75 % before the critic is trusted as a gate. If it can't get there, the gate is the owner's A/B alone.
- **Rubric** (critic, finisher, judge), written from the owner's notes:
  - the idea reads in the first screen at both widths;
  - one focal point per screen;
  - real scale contrast;
  - photos cropped on their subject and used large;
  - rhythm alternates;
  - the phone first screen is as strong as the desktop's;
  - the business could not be swapped for another of its trade;
  - nothing from the banned list;
  - every fact is the client's.
- **Fixtures**: the 10 goldens and 12 twins, plus 18 hard ones: no logo; no photos; dark phone photos; one photo; a long name; 20 services; tourism with English; and new trades (florist, yoga, photographer, vet, driving school, cleaning, locksmith, tutor). That makes 40. Text is free; their photos are generated once and committed (≈ €1.5).

## 9. The gate to switch it on

`designer.agent` stays off for new sites until a full run on the 40 fixtures meets every target in §2. The owner's blind A/B in Okus is the deciding one. The report goes in `eval/` with judge medians per criterion, the owner's results, the uniqueness numbers, check failures, and € and seconds per stage. If a target isn't met, the number is reported and the threshold stays.

## 10. The lab (how it keeps getting better)

- **Sketch lab** (`pnpm lab:sketch`, offline, paid per run, small): Opus writes a homepage as free HTML and CSS, with no language limits, for a fixture and a dealt stance. It is rendered at both widths and goes into Okus. Sketches are a research tool, never shipped.
- **Distilling**: the owner's top-rated sketches are turned into inventory by a free Claude Code session (new compositions, element kinds, treatments, motion) and become references. A **gap report** lists what the sketches do that the language can't express. It decides what F1b, Phase 1 waves and §7.3 build next.
- **Weekly inventory session** (free, overnight): grows the inventory where the gap report and the tournament's losing reasons point.

## 11. Roadmap

Every PR sits behind config `designer.agent` (off): with it off, requests and output stay byte-identical to `main`. Hours are halved from first guesses (real runs have been faster than estimates).

### Phase 0: foundations (free)

| PR | Contents | Checks |
|---|---|---|
| **F1** | Composition language v1 = spec PR A (`ai-designer-spec.md` §2, §8 A) | as specified there |
| **F2** | Tool use and `runAgent` in the model client = spec PR B, plus the advisor tool (Haiku executor, Opus advisor; encrypted advice replayed unchanged) | as specified there; advisor replay test |
| **M1** | Haiku 5.5 in the client and config (§6.4): both price cards, effort set per stage, thinking headroom, blocks read by type, refusal retry on Sonnet; `pnpm eval --stage-model <stage>=<model>` to run any stage on any model | unit tests on recorded and scripted responses (refusal, thinking-only reply, long-prompt price card); switch-off replay identical |
| **F3** | `packages/inventory`: registry, asset schema, contact-sheet generator, the gallery artifact with approve/reject, CI checks per asset. Today's assets registered (fonts, palettes, motifs, treatments, sections as presets) | every registered asset renders at 360/1280, axe, banned, contrast, licence |
| **F4** | Okus: rating artifact and database, calibration harness (agreement metric on stored ratings), round-1 item set rendered from what exists | harness tests on synthetic ratings; artifact published, owner asked to rate |
| **F5** | Seed and registry: `design.seed`, stance and constraint deck schemas (decks filled in Phase 1), dealing, `look_fingerprints` table and migration, perceptual hash, distance and gate, wired behind the switch | dealing determinism tests; registry tests on the twins' renders; DB migration test |
| **F6** | 18 hard fixtures (text, facts, logos where they have one) | eval offline loads them; photos wait for ≈ €1.5 |

### Phase 1: inventory (free, overnight, run in parallel)

| PR | Contents |
|---|---|
| **I1** | Type: 41 new families (60), 100 new pairings (120), Slovene glyph check, subsetting, per-site font byte budget |
| **I2** | Colour: 150 new curated palettes (200), palette extraction from photos as well as the logo, palette tagging |
| **I3** | Compositions wave 1: 120 presets across the 12 intents in the composition language, incl. today's 81 variants re-expressed and the 19 references' signature parts (also covers `it-templates-rest`: the swim-school ideas become compositions instead of new directions) |
| **I4** | Imagery: 22 new masks and frames (30), 8 new treatments (16), 12 textures |
| **I5** | Drawings: 134 new motifs and spot drawings (150) in three styles, 24 Slovene ornaments, 17 new dividers (20) |
| **I6** | Type treatments (15) and fact objects (20) |
| **I7** | Motion: 20 presets on `@sb/morph` and CSS, reduced-motion, JS and layout-shift budget, Lighthouse unchanged |
| **I8** | Stance deck (80, each with signatures and references) and constraint deck (50) |
| **I9** | Wordmark generator (§6.5) and icons (3 styles × 40, practical facts only) |
| **I10** | References: 40 new hand-made homepages across stances and trades at 360 and 1280 px, into Okus round 1 |
| **F1b** | Composition language v2 (§7.1, §7.2), spec bump and migration |

Each of these PRs ends with its contact sheet in the gallery. Only approved assets reach the runtime catalogue.

### Phase 2: the studio (paid, ≈ €27 in evals, October)

| PR | Contents | Eval € |
|---|---|---|
| **S0** | Model bake-off (§6.4): each stage on Haiku, Haiku + Opus advisor, Sonnet, Opus, on 3 fixtures; per-stage model chosen in config | ≈ 3 |
| **S1** | Photo analyst (Haiku), creative director (Opus, 6 concepts, dealing, shortlists, registry gate), `design.art` with concepts | ≈ 3 |
| **S2** | Designers ×6 (Haiku) in parallel, draft copy in the concept's voice, headline candidates; copy polish on the winner | ≈ 3 |
| **S3** | Art worker: wordmark, constrained SVG drawings, photo treatments; cut-outs and generated pictures per `sb-studio-imagery` | ≈ 4 |
| **S4** | Render all, Haiku pre-screen, Opus tournament critic with owner anchors, alternatives stored | ≈ 4 |
| **S5** | Finisher loop with tools, caps, critique replaced when on | ≈ 5 |
| **S6** | Site kit and other pages composed with it | ≈ 3 |
| **S7** | Owner UX (free): "Oblikovalec dela" progress, "Druge zamisli", "Predlagaj drugačno"; editor slots for composed sections (spec PR F) | 0 |

Runs use 3 fixtures (`avtoservis-mrak`, `instalacije-rebernik`, `pekarna-kvas`) with their own `--recordings` directory, then the next three.

### Phase 3: measure and ship (paid, ≈ €15–20 + ≈ €15 reserve for iterations, November)

The full run on 40 fixtures with twins and the pairwise "same template?" question; the owner's blind A/B in Okus; the report; iterations where the numbers point; then the HQ decision on switching on and for which tiers.

### Phase 4: beyond

Scoped CSS (§7.3, own decision). The sketch lab weekly. Inventory waves 2 and 3 (compositions to 300). A whole-site "redesign" in the editor that keeps every owner text. A photo shot list from the photo analyst ("for this design, take these three photos").

### Totals

- **Development spend**: ≈ €60–70 in evals plus ≈ €3–5 in pictures over the program.
- **Budget** (owner, 2026-10-10): **$90 a month for the Anthropic API (≈ €77) and $10 a month for fal.ai (≈ €8.60)**, in HQ `meta/budget`. October has ≈ €67 of API budget left after €10 logged by 10 Oct. Planned split: Phase 2 including the bake-off (≈ €27) in October, Phase 3 and its reserve (≈ €30–35) in November. A weekly pace of ≈ €25 stops one week from using the month.
- **Free work**: Phases 0 and 1 are about 17 PRs that can run in overnight sessions now, several at a time.

### Test discipline (more budget is not more testing)

The owner raised the budget to spend more on page generation, not on testing. Every paid run follows these rules:

1. **One question per run**, written down before it runs (HQ item note), with an estimate and a hard stop (`--max-eur`). No run "to see what happens", and no re-run of a configuration that already ran.
2. **The smallest sample that answers it**: 1 fixture to debug, 3 to compare options, the full 40 only for the Phase 3 gate (once, and at most one re-run after fixes).
3. **Free checks first**: render tests, guards, offline replay, contact sheets and Haiku's pre-screen before any paid judge. A run that fails a free check is not judged.
4. **Never pay twice for an unchanged stage**: `--record-missing` with a recordings directory per run, the fal cache and `--reuse-pictures` on every run. New pictures only for new fixtures or a picture change being tested.
5. **The cheapest judge that answers it**: Message Batches for the judge (half price), Haiku for pass/fail checks, Opus only where the pick matters.
6. **Two strikes**: after two paid iterations on the same question without the number moving, stop, write down why, and think before spending again.
7. **Logged by provider**: each `spend/<id>` entry carries `provider` (`anthropic` or `fal`), so both monthly limits can be checked. fal is the tighter one: ≈ €8.60 is about 125 pictures a month.

## 12. Risks and answers

- **Ugly freedom.** More materials and a freer language can make worse pages. Answers: the guards in code, the tournament, the finisher loop, owner-approved assets only, and nothing switches on without the owner's A/B.
- **Quantity over quality in the inventory.** 150 mediocre motifs are worse than 16 good ones. Answers: every asset is reviewable in the gallery, and the owner's rejections and the tournament's losing reasons prune it. Targets are ceilings to aim at, not quotas to fill.
- **Cost and time.** About 3–5× today's per homepage (estimate). Deliberately unconstrained for now. Haiku workers already take it from ≈ €0.9–1.1 to ≈ €0.5–0.8 (§6.3). The levers, once it is good: Sonnet for the director, critic or finisher; 4 concepts instead of 6; one finisher round on free previews; the studio after sign-in only; caching the director's system blocks across sites (already planned); and Message Batches for the non-interactive "Druge zamisli".
- **Page weight.** More fonts, textures and motion. Answers: the per-site byte budgets in the registry, Lighthouse in the gate, at most 2 font families per site, and motion as CSS first.
- **Editor complexity.** Composed sections edit by slots (text, photo, fact). Layout changes go through "Predlagaj drugačno" and "Druge zamisli".
- **Legal.** Fonts and icons are open-licence only, with the licences listed. AI pictures are labelled, as today. Nothing in the inventory is traced from someone else's design. Ornaments are drawn new. The lab doesn't feed on scraped sites.
- **Haiku quality.** Haiku 5.5 is unmeasured on our work, especially Slovene copy and reading owner photos. Answers: the bake-off before anything relies on it, the copy polish on the winner, Opus for every decision that sets quality, and a Sonnet retry on refusals.
- **Run-to-run variance.** Seeds, recordings and per-stage logs make every run reproducible and comparable.

## 13. Decisions for the owner (in HQ)

- `sb-studio-budget`: decided 2026-10-10, $90/month API and $10/month fal (above).
- `sb-studio-imagery`: what the art worker may generate beyond today's rule (≤ 3 mood pictures, labelled): drawings in the stance's style, cut-outs of the owner's product photos, textures.
- `sb-model-roles`: Opus decides, Haiku produces, code orchestrates (chosen 2026-10-09: "incorporate in plan"); the bake-off sets each stage's model.
- Later, with numbers, not now: which tiers get the studio, and per-site cost and time.
- Phase 4: scoped CSS.

Owner actions, not decisions: Okus round 1 (≈ 20 min, after F4) and sampling the gallery (optional).

## 14. What happens to existing work

- `ai-designer-spec.md` PRs A and B are F1 and F2 unchanged. Its §3–5 (single art director, compose, loop) become S1, S2 and S5 in this plan's shape (several concepts, tournament). Where they differ, this plan wins.
- Variety switches (families, skeleton, concept) stay as the path with the studio off. The genome becomes the director's axis vocabulary. The trade templates become stances, references and composition presets. Motifs move into the inventory.
- The critique stage is replaced by the tournament and the finisher when the studio is on.
- The concept brief (goal, angle, signature fact, materials, local anchor) feeds the dealing and the director.
- `it-templates-rest` (swim-school templates in the engine) folds into I3 and I10. `it-motif-library` (sub-trade motifs, built) is the seed of I5. `it-design-genome`'s paid twin run is not needed: Phase 3 measures it.
- Not switching anything off that is on today.
