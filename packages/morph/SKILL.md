---
name: morph-animation
description: Add a part-by-part "Transformer" screen transition (one layout's header, headline, buttons, photos and cards fly apart, travel, flip and lock into the next layout), a self-building page reveal, or a text-decode effect to a web UI, using the @sb/morph engine. Use when someone wants switching between states, tabs, themes, templates or pages to look like the Stranko landing demo, or wants a page to "build itself" on screen.
---

# Morph animation (@sb/morph)

The engine lives in `packages/morph` of the site-builder repo (copy `src/` for TypeScript projects or
`dist/morph.js` for plain JavaScript; no dependencies). Read `README.md` there before writing code; it is
the full guide. The short version:

1. Run the example (`node packages/morph/examples/serve.mjs` → http://localhost:3092/examples/) and read
   `examples/index.html`: data → `render()` → recipe → `morph({ parts, update })`.
2. Make the state change one function (`update`), awaiting your framework's commit.
3. Write the recipe: panels first (`kind: "panel"`), then the parts on each (`within`), keys stable across
   states, `all` / `children` for repeated items, each part a single box in the viewport.
4. Call `morph({ parts: RECIPE, update, decode: "h1" })`; pass `onTransition` so newer requests skip a
   running one; `backdrop: false` when the morph is a small component inside a page.
5. Build reveal: `runBuild(prepareBuild(el, { panels, boxes }), onStep)`.
6. Check it with `scripts/sheet.ts` (frame-by-frame screenshots) at 1280 and 360 px, and test the end
   state (no `view-transition-name`, no `style[data-morph]`, markup exactly as rendered).
7. Keep reduced motion (handled: cross-fade) and add a pause control to any autoplay loop.

Change `timing.tempo` before any phase; the defaults are tuned by eye.
