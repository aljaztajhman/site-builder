# @sb/morph

The animation engine behind the Stranko landing page's trade demo, made reusable. No runtime
dependencies, no framework, about 30 KB unminified. Three effects:

| Effect | What it looks like | API |
|---|---|---|
| **Morph** | One screen becomes the next part by part, "like a Transformer from a car to a robot": the parts lift and spread apart over a dark screen, run on rails to their new places, flip over to their new face, telescope to their new size and lock together with a small overshoot. | `morph()`, `morphFrame()` |
| **Build** | A real page builds itself in four waves: grey word bars and blocks, then colours section by section, then photos wiping in, then each bar giving way to its words. The last frame *is* the page. | `prepareBuild()`, `runBuild()` |
| **Decode** | A headline's letters shuffle into the new words, left to right. | `decode()` |

All three work on the **real DOM**: nothing is cloned or faked, so the end state is exactly your markup.
The morph runs on a same-document [View Transition](https://developer.mozilla.org/docs/Web/API/View_Transition_API);
where that is missing it simply applies the change.

See it: `node packages/morph/examples/serve.mjs`, then http://localhost:3092/examples/ (three themed
screens morphing into each other, a "Build it" button, autoplay with pause). The example is about 150 lines;
read it first.

---

## For agents: adapting this to a project

1. **Get the code** (pick one):
   - In this monorepo: `"@sb/morph": "workspace:*"` and `import { morph } from "@sb/morph"`.
   - Another TypeScript project: copy `packages/morph/src/` into it (9 files, no imports outside the folder).
   - Plain JavaScript or a `<script type="module">`: copy `packages/morph/dist/morph.js` (one ES module).
2. **Decide what changes between states** and make it one function: `update()` re-renders, swaps markup,
   sets state and awaits the framework's commit, or loads a page. The morph calls it once.
3. **Write a recipe** (below): the panels (big background blocks) and the parts on them, by role.
   Same key in both states = the same part, transformed. Keep keys stable across states.
4. **Call `morph({ parts: RECIPE, update })`.** Pass `onTransition` if a newer request should skip a
   running one (autoplay, tabs).
5. **Look at it frame by frame** with the contact sheet script (below) at a desktop and a phone width.
   Fix the recipe, not the timing, when something looks wrong.
6. **Accessibility**: reduced motion is handled (cross-fade); a loop that moves by itself needs a pause
   button (WCAG 2.2.2); announce only user-initiated switches to screen readers.
7. **Test** the end state (see "Checking it").

### Quick start

```ts
import { morph, type Recipe } from "@sb/morph"; // or "./morph/index.ts", or "./morph.js"

const RECIPE: Recipe = [
  { key: "bar", select: ".bar", kind: "panel" },
  { key: "brand", select: ".brand", within: "bar" },
  { key: "nav", select: "nav a", within: "bar", all: true },
  { key: "hero", select: ".hero", kind: "panel" },
  { key: "h1", select: "h1", within: "hero" },
  { key: "lead", select: ".lead", within: "hero" },
  { key: "act", select: ".actions > *", within: "hero", all: true },
  { key: "art", select: "img, svg", within: "hero" },
  { key: "list", select: ".list", kind: "panel" },
  { key: "item", select: "ul", within: "list", children: 6 },
];

await morph({
  parts: RECIPE,
  update: () => render(nextState), // anything that changes the DOM; may be async
  decode: "h1",                    // optional: the headline shuffles into its new words
});
```

React: `update: () => new Promise((r) => { flushSync(() => setState(next)); r(); })`. Vue:
`update: async () => { state.value = next; await nextTick(); }`. Svelte: `update: async () => { x = next; await tick(); }`.

### Recipes

A recipe is an ordered list of rules. Each rule names one role:

| Field | Meaning |
|---|---|
| `key` | The role. Parts with the same key in the old and new state become one another. |
| `select` | A CSS selector, run on the document, or inside the part named by `within`. |
| `within` | Key of an earlier rule; the selector runs inside that part's element. |
| `kind: "panel"` | A backdrop block (header bar, section). Panels flip with the parts on them, so their colours change together; they don't spread apart. Default `"part"`. |
| `all` | Every match becomes a part (`nav0`, `nav1` …). A number caps it. |
| `children` | The first match's children become parts (`item0`, `item1` …): a list's items. A number caps it. |
| `region` | Panels: share another panel's region (a card on a hero flips with the hero). |
| `boxy` | Force the drop shadow while apart on or off (default on for panels, media, controls and list items; off for text, where it reads as blur). |

How to write a good one:
- **Panels first, then the parts on each panel, top to bottom.** An element plays only the first role it
  matches, so order specific rules before general ones.
- **Parts are things a viewer recognises as one object**: a heading, a button, a photo, a card, a menu
  item. Not wrappers. 10–40 parts on screen is the sweet spot; more looks busy, fewer looks like a fade.
- **A part must be one box.** Inline text that wraps over two lines has two boxes and is skipped
  (`visible()`); select its block parent instead.
- Only parts **in the viewport** move. Everything else changes with the page behind them.
- Parts that only exist on one side are fine: an old part with no partner retracts into the nearest new
  part's place, a new one unfolds out of the nearest old part's place. Leftovers of the same sort (text,
  media, control, panel) and similar area (within 5×) pair up even when their keys differ.
- Need logic a selector can't express? Pass a function instead: `parts: (doc) => Part[]` (build them with
  `findParts` and add your own).

### Whole pages in an iframe

`morphFrame(main, stage, url, { parts })` turns the page in iframe `main` into the page at `url` (same
origin). `stage` is a second iframe of the same size, layered under `main`, where the next page loads
first so its fonts and photos are warm. The head is diffed (shared stylesheets stay loaded), the body
swapped, scripts re-run. This is what the Stranko landing does (`apps/web/src/client/demo-transform.ts`).
With reduced motion it cross-fades the two frames (`fadeFrame`).

### The build

```ts
import { prepareBuild, runBuild } from "@sb/morph";

const b = prepareBuild(element /* or a Document */, {
  panels: "header, section, footer", // get their colour one after another (step 2)
  boxes: "picture, .btn, button",    // rise into place (step 1)
});
await runBuild(b, (step) => showStep(step)); // steps 0–3: structure, colours, photos, text
// b.finish() at any time snaps to the finished page (e.g. the user clicked away).
```

`prepareBuild` is instant and unseen: call it while the page is hidden (behind a prompt card, before it
scrolls in), then `runBuild` when it should play. The last frame of the build equals the page after
`finish`; keep it that way if you change the stylesheet (no filter, clip or wrapper may be left on).

### Timing

Defaults (`MORPH_TIMING`, `BUILD_TIMING`) are the values the Stranko landing was tuned to by eye. Change
`tempo` first (`timing: { tempo: 1 }` makes a switch a third shorter than the default 1.5); change a phase only if one
step feels wrong.

| Knob | Default | Effect |
|---|---|---|
| `phases.unlock` | 200 ms | Parts lift and spread; the backdrop darkens. |
| `phases.stagger` | 48 ms | Delay between parts in the top-to-bottom wave. |
| `phases.leg` | 210 ms | Each of the two rail legs (longer axis first). |
| `phases.turn` | 280 ms | The flip to the new face. |
| `phases.extend` | 240 ms | Telescoping to the new size. |
| `phases.lock` | 260 ms | The snap down with overshoot and a brightness glint. |
| `tempo` | 1.5 | Multiplies all phases. A full switch of ~25 parts takes about 3.2 s. |
| `lift` / `spread` | 0.955 / 22 px | Scale while apart / how far parts move out from the centre. |
| `fade` | 600 ms | The reduced-motion cross-fade. |

`backdrop` sets what shows between the parts while apart (default: a dark screen with a faint dot grid,
colour from the CSS variable `--morph-screen`). `backdrop: false` keeps the page visible and cross-fades
it instead: use that when the morph is a small component inside a larger page.

### Rules that keep it seamless

These were learned the hard way on the landing; the engine already follows them. Keep them if you edit it.
- **Never stretch a snapshot.** Old and new images keep their natural size (`inline-size: auto`) inside a
  clipping pair; a part changes size by retracting or telescoping, so text stays sharp.
- **3D only while turning.** A 3D-transformed layer is rasterised soft; outside the flip, parts stay flat.
- **Keyframe percentages strictly increasing.** Two equal percentages merge, and a face swap merged that
  way becomes a crossfade. `keyframes()` rounds and nudges for you.
- **Shadows on boxes only.** A drop shadow on bare text reads as blur.
- **See-through panels get filled** with the colour behind them while apart (`fillPanels`), and it is
  removed afterwards.
- **Stacking while apart follows paint order** of each state (a full-width photo stays under the card on it).
- **Names are cleaned up.** Every `view-transition-name` and the generated stylesheet
  (`style[data-morph]`) are removed when the morph ends or is skipped.
- During a view transition the page doesn't take clicks; keep switches under ~3.5 s.
- Two engines in one document need different `prefix`es.

Browser support: Chromium 111+, Safari 18+, Firefox 144+ for the morph; elsewhere `update` runs
without animation. The build and decode work everywhere.

### Checking it

- **Contact sheet**: `tsx packages/morph/scripts/sheet.ts <url> "<js that starts the switch>" [out] [width]`
  pauses every animation as the transition starts, steps its clock and screenshots 13 frames into
  `<out>/index.html`. Look at it at 1280 and 360 px. Parts should never stretch, smear or land in the
  wrong place; the last frame must be the clean new state.
- **End state**: after `await morph(...)`, assert the DOM is exactly what `update` rendered, and that
  `document.querySelectorAll("[style*=view-transition-name]")` and `style[data-morph]` are gone.
- **Build**: the markup after `runBuild` must equal the markup before `prepareBuild`.
- **Reduced motion**: with `prefers-reduced-motion: reduce`, nothing may change place or size.
- `test/morph-browser.test.ts` does all of this against the example page with Playwright; copy it.

### API

| Export | Purpose |
|---|---|
| `morph(options)` | The morph in one document. Options: `parts`, `update`, `doc`, `timing`, `calm`, `backdrop`, `decode`, `prefix`, `settle`, `onTransition`. |
| `morphFrame(main, stage, url, options)` / `fadeFrame(...)` | Whole pages in an iframe; the reduced-motion cross-fade. |
| `prepareBuild(target, options)` / `runBuild(build, onStep, timing)` | The build. |
| `decode(el, startMs, durationMs)` | Text shuffle; returns the undo. |
| `findParts`, `visible`, `match`, `fillPanels` | The recipe engine, for custom `parts` functions. |
| `choreograph`, `keyframes` | The pure choreography (boxes in, CSS out), for custom engines. |
| `swapDocument`, `settle`, `loadInto`, `within`, `prefersCalm` | DOM helpers. |
| `MORPH_TIMING`, `BUILD_TIMING`, `EASE`, `morphTiming` | Defaults. |

### Working on the engine itself

- Source: `src/`; after any change run `pnpm --filter @sb/morph build` and commit `dist/morph.js`
  (a test fails while it differs from a fresh build).
- Tests: `pnpm exec vitest run packages/morph` (unit + Chromium) and the landing's
  `apps/web/test/showcase-browser.test.ts`, which pins the tuned feel of the original.
