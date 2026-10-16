# Wave P · P3 proof harness

Goal: render the two proof sets (Review 50's 50 pages, the fresh 10) with a hand-assigned first-screen structure and a hand-varied chrome per page, free, and write what `pnpm variety` and `pnpm outside-review --set` read, plus desktop and phone contact sheets.

Non-goals: no spec bump, no `structureOf`, no registry, no page gate, no photo grade, no paid call, no change to the product pipeline.

## Files (implementer owns)

- `tools/eval/src/structure-proof.ts` (new): the pure functions below + the CLI.
- `tools/eval/test/structure-proof.test.ts` (written by the director: make it pass, don't weaken it).
- `tools/eval/src/set-variety.ts`: optional manifest field `structure` → report "structure share" (max share, count per structure) and "chrome tuples" (distinct `header|tone|actions` keys, the largest repeat). Add a test in `tools/eval/test/` for the two new numbers.
- root `package.json`: script `"structure-proof": "tsx tools/eval/src/structure-proof.ts"`.

## Interface (fixed by the test)

```ts
export interface ProofPage { id; business; trade; town; clientPhotos: number; aiPictures: number }
export const PHOTO_LED: readonly Structure[]  // band, mosaic, split, magazine
export function structureFits(s: Structure, p: ProofPage): boolean
export function assignStructures(pages: ProofPage[], o?: { overrides?: Record<string, Structure> }): Map<string, Structure>
export interface ProofChrome { header: HeaderFamily; tone: Tone; actions: PhoneActions }
export function chromeKey(c: ProofChrome): string
export function assignChrome(pages: ProofPage[]): Map<string, ProofChrome>
export function applyStructure(spec: SiteSpec, s: Structure, chrome: ProofChrome): { ok: boolean; spec: SiteSpec; issues: string[]; log: string[] }
export function proofPageOf(id: string, spec: SiteSpec, o: { business: string; trade: string }): ProofPage
```

Rules:
- Photo needs per structure: band, split, magazine ≥ 1 photo; mosaic ≥ 3. Count client photos (asset `origin` absent or "client"). Owner D2: only when a business has **no** client photo, its AI pictures (origin "generated") count instead.
- `assignStructures`: deterministic. Share cap `floor(0.25 · n)` per structure (10 → 2, 50 → 12). Hard: what fits; pages of one business differ; pages of one trade differ when the trade has ≤ 8 pages. Soft (penalty): pages in one town differ. Greedy over the most-constrained pages first (fewest fitting structures), picking the least-used fitting structure that breaks no hard rule, ties broken by `STRUCTURES` order rotated per page index. Overrides win and count towards the cap.
- `assignChrome`: every page a distinct `(header, tone, actions)`; header from `HEADER_FAMILIES` minus `overlay`; tone from default, alt, inverse, band; actions from `PHONE_ACTIONS`. Spread: walk headers fastest, then actions, then tone, so neighbours in list order differ on header and action.
- `applyStructure`: works on a deep copy. Preset `composition/hero/<s>-1` via `compositionPreset(id)` from `@sb/inventory` (not the shortlist; new presets are drafts). Sources: `presetSources(spec, undefined, { headline, lead })` with headline/lead from the old first section's `headline`/`intro` (or `title`/`intro` for page-header). D2: when the business has no client photo, pass the generated images to the fill as if they were photos (only in the sources; the spec's assets keep `origin: "generated"`, so the AI label still renders). Fill with `fillPreset`; on `ok: false` return `ok: false` with the reason in `issues`. Replace `pages[home].sections[0]` keeping its `id`, `tone` from the preset. Set `design.skeleton.header`/`.actions` (keep the other skeleton fields; when the spec has none, use the engine's default skeleton) and `chrome.header.tone`. Then `repairStudioPage` (engine studio/page-rules.ts) and `studioPageIssues` → `issues`; `validateSite` must pass (else `ok: false`).
- `proofPageOf`: counts from `spec.assets.images`; town from `business.address.city` (or "").

## CLI

`pnpm structure-proof --set review50|fresh10 [--out <dir>] [--assign <json>] [--only <id,..>] [--concurrency 2]`

- review50: pages `<business>-gen` / `<business>-regen` from `eval/outside-review/review50-specs/<business>/spec-{generated,regenerated}.json`; media rebuilt from that folder's `storage/` exactly as `review50-render.ts` does (reuse its `rebuildMedia`). Trade: from the fixture brief by business id the way `outside-review` finds it, else the slug's first word.
- fresh10: `eval/runs/studio-poc/<id>.today.spec.json` (made by `pnpm studio:poc --fresh --bases-only`); media from wherever studio-poc's bases read them (find it in studio-poc.ts / studio-fixtures.ts). Trade from `tools/eval/fresh/<id>/brief.json`.
- `--assign <json>`: `{ "<id>": { "structure"?: S, "header"?, "tone"?, "actions"? } }` overrides; the CLI always writes the final `assign.json` it used.
- Writes to `--out` (default `eval/runs/structure-proof/<set>/`): `<id>.spec.json`, `<id>-1280-first.png`, `<id>-360-first.png`, `<id>-1280.png`, `<id>-360.png` (engine `checkSite`, homepage only, like review50-render), `assign.json`, `manifest.json` (`[{id, spec, desk, phone, trade, structure}]`, readable by `pnpm variety` and `pnpm outside-review --set`), `issues.json` (fill failures + page-rule issues per page), `sheet-desk.jpg` and `sheet-phone.jpg` (first screens, a grid with id + structure + chrome key under each; ≤ 2.5 MP each; reuse set-review's sheet helpers if they fit).
- A page whose fill fails falls back to the next structure that fits and isn't over the cap, logged in `issues.json`; never silently keeps the old hero.

## Acceptance

- `node <pnpm.mjs> exec vitest run tools/eval/test/structure-proof.test.ts --maxWorkers=1` passes, plus the set-variety test.
- `typecheck`, `lint --quiet`, `test --reporter=dot --maxWorkers=1` pass.
- `pnpm structure-proof --set fresh10` and `--set review50` run end to end at €0 and write all files; report the counts per structure, distinct chrome keys, fill fallbacks and page-rule issues.
- `pnpm variety review50=eval/runs/structure-proof/review50/manifest.json fresh10=eval/runs/structure-proof/fresh10/manifest.json` prints the structure share and chrome tuples.
