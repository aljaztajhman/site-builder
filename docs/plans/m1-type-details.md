# M1 · Type and details proof (owner option A, 2026-10-16)

Branch `claude/m1-type-details-5f3969`, cut from Wave P (PR #220, `claude/design5-wave-p`).

## Goal

The same 60 proof pages (Wave P harness, sets review50 + fresh10) get a type-and-details pass, rendered free, then judged by the whole-set round. Owner: "Give each site its own font style; make big things big and small things small; make the Call button a real visible button; give the top bar more; show the AI label once, not on every picture."

## Non-goals

- Live changes. Everything new is off by default (render options default off; config `details.*` false; voices are data no live path picks).
- Spec bump. Voices use existing design fields (`fontPair` is a free string; weight, tracking, case, base size, scale exist). Header masthead = a render-time treatment of the existing `stacked` family under the switch, not a new enum value.
- Pictures leading / no text-only first screens (option B), the chooser and registry (U5), the file mark (U9 part C, invisible to reviewers).

## Pieces and owners

### A. Renderer details (builder · Opus · medium) — owns packages/components/**, packages/render/src/site.tsx, packages/render/src/export.ts (options pass-through only)

`RenderOptions.details?: RenderDetails` (all optional booleans, absent = today byte-identical):
- `cta`: hero and header call actions render as a real primary button: min-height 48 px desktop / 44 px phone, font-weight ≥ 650, body-size label (≥ 17 px), padding ≥ 0.85rem 1.5rem, phone icon; composed-hero call links that render as `text-link` become `btn btn--primary btn--call`. The header CTA (`.site-header__cta`) gets the same weight. Still one call action per screen (the existing checks `callButtonsPerScreen` / `callsBanned` / page-checks must still pass).
- `header`: fuller chrome. (1) A single-page site (only one nav page) shows no lone "Domov": the nav is replaced by in-page anchors to the homepage's sections that have a heading (max 4, labels = section headings shortened to ≤ 3 words) or, if fewer than 2, no nav and no menu button. (2) Taller header: brand at a larger size (wordmark/name ≥ 1.35× today), more vertical padding (≥ 20 px desktop). (3) The `stacked` family becomes a **masthead**: brand row + a facts row with business facts only, from the spec (`business.address.city`, phone formatted, today's-hours summary only if `business.hours` exists); never invented, absent facts are left out; facts row hidden on phones ≤ 360 if it would wrap more than one line (or reduced to town + phone).
- `aiCaption`: the AI chip (`.media--ai::after` from `data-ai-label`) is not drawn on any picture; the first generated picture on the page gets a visible caption below it (figcaption-like line, eyebrow style, `--fs-sm`, muted, ≥ 4.5:1) reading "Slike na tej strani so ustvarjene z umetno inteligenco." (sl; en: "The pictures on this page were made with AI."); every generated picture keeps the alt-text suffix and gets `data-ai="generated"`. The caption must not be clipped by round/arched masks and must not overlay the photo.
- `fit`: display headlines in composed heroes fit their own column, not the viewport: `container-type: inline-size` on the headline's cell and font-size `min(var(--fz), calc(100cqi / (var(--lw,1) * k)))` with k from the face (`--fit-k`, default 0.62 lowercase / 0.8 caps, composed today 0.78); no mid-word breaks for words ≤ 14 letters at 360 and 1280 (`overflow-wrap: normal` on display lines when fit is on; longer words may still break); the headline never clips off the first screen at 1280×800 (cap display size so a ≤ 2-line headline fits in 60 vh).
- `scale`: small things small, big things big: body text from the spec base (voices set 17–18); nav links and header CTA at body size; section h2 ≥ 40 px at 1280; supporting hero lines (facts, address) at `--fs-base`, not smaller; eyebrows (section kickers) shown on the first section that has one only (one eyebrow-headline-paragraph stack per page).

Plumbing: `RenderOptions.details` → `makeCtx` → `RenderCtx.details`; a class list on `<html>` (`dt-cta dt-header dt-ai-caption dt-fit dt-scale`) so CSS rules are scoped and inert when off. `siteFiles(spec, media, opts)` passes `details` through.

Tests (written first, failing before): components tests per flag (markup present with flag, absent without), a byte-identical test (renderSite with `details` absent vs `{}` equals today's output for 2 goldens), browser checks at 360 and 1280 for: call button ≥ 44 px tall, no `.media--ai::after` content with aiCaption, one caption per page, no lone Domov, masthead facts only from the spec (a spec without hours shows no hours), poster headline with "Računovodstvo" / "Ključavničarstvo" not broken mid-word and inside the first screen.

### B. Type voices (director) — owns packages/spec/src/voices.ts (new), packages/spec/src/fonts.ts (VOICE_PAIRS + fontPair lookup + optional `fitK`), packages/render/src/tokens.ts (`--fit-k` from fitK), packages/render/src/shared.ts (voice fonts after the hash)

8 voices, each a font pair + heading weight, tracking, case, base size (17–18) and scale (≥ 1.25):
grotesk (Inter Tight/Inter), editorial (Newsreader/Libre Franklin, light), oldstyle (Young Serif/Alegreya), signage (Oswald/Source Sans 3, caps), didone (Bodoni Moda/Albert Sans), slab (Besley/Work Sans), wide (Krona One/Karla), geometric (Jost/Literata, caps tracked). New pairs live in VOICE_PAIRS (resolvable by `fontPair`, not in FONT_PAIRS: the editor menu, generation and existing sites unchanged). Their files are added to the shared bundle after the hash (like the composed sheets), so the bundle hash and every stored site's HTML stay identical. Every file ≤ 60 KB.

Tests: each voice validates against `Design`; ≥ 6 distinct heading classes; fontPair resolves every voice pair; shared bundle hash unchanged; `applyVoice` sets only the six fields.

### C. Harness (implementer · Sonnet · medium, tools/**) — owns tools/eval/src/structure-proof.ts, tools/eval/test/structure-proof.test.ts, tools/eval/src/details-sheet.ts (new)

- `assignVoices(pages)`: deterministic; no voice on more than 25 % of a set (floor(0.25 n), min 1); neighbours in list order differ; same business (gen/regen) differ; trade affinity table as a soft preference.
- `--details` flag: applies the voice to each spec's design, runs `oneStack(spec)` (drops eyebrows after the first, a spec transform — the pages' words otherwise unchanged) and renders with `details: { cta, header, aiCaption, fit, scale }` all true. Without the flag, output is Wave P's.
- Writes `voice` into manifest.json and assign.json; `pnpm variety` prints the voice share.
- `pnpm details-sheet --before <dir> --after <dir> --out <dir>`: side-by-side contact sheets (Wave P left, new right) for desktop and phone.

Tests written first by the director (failing), implementer makes them pass.

## Acceptance checks

1. `pnpm typecheck`, `pnpm lint --quiet`, `pnpm test --reporter=dot` green; new test files pass.
2. `pnpm structure-proof --set fresh10 --details` and `--set review50 --details`: 60/60 rendered, 0 failures; voice max share ≤ 25 %; chrome keys distinct; call checks pass.
3. `pnpm variety` on both new manifests.
4. Side-by-side sheets published as an artifact; the owner looks.
5. After the owner's go and an Opus reviewer pass: `pnpm outside-review --set ... --max-eur 0.5`, three reviewers; bar: variety ≥ 3.5 from 2 of 3 on both sets, no reviewer's overall drops vs Wave P (fresh 3/3/3, review50 2/2/3), owner agrees.
