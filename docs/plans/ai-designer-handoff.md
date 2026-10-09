# AI designer: handoff prompt

Paste the block below into a new Claude Code session (local or cloud) on this repository. It covers F1 and F2 of `docs/plans/design-studio.md` (spec PRs A and B); the other PRs of that plan are described there and in HQ overnight plans. One session per PR in the table of `docs/plans/ai-designer-spec.md` §8; change the first line to the PR you want (A and B are free and independent; start with A).

---

```
Build PR A of the AI designer (docs/plans/ai-designer-spec.md §8): the composition language.

Context. The owner's biggest concern (2026-10-08, HQ decision sb-ai-designer = designer): generated sites feel
templated because nothing in the pipeline designs. Today the design call returns a direction id and ten numbers
(≈ 200 output tokens, €0.003) without seeing the photos or the page, and layouts come from ~30 fixed sections.
We are adding an AI designer: an art director, a composition language, and a look-and-revise loop. This PR is
the composition language only, so later PRs have something to design with.

Read before anything else, in this order:
1. CLAUDE.md (working rules, Stranko HQ protocol, development budget, reporting format) and TASKS.md.
2. Stranko HQ session-start reads (CLAUDE.md "Stranko HQ"), then items it-ai-designer and decision sb-ai-designer.
   Set it-ai-designer to doing with a note naming this PR; write notes as things happen.
3. docs/plans/design-studio.md (the plan, priority #1; this PR is its F1), docs/plans/ai-designer.md (diagnosis),
   docs/plans/ai-designer-spec.md (what to build; this PR is §2 and §8 row A).
4. docs/PRODUCT.md: banned patterns, mobile checklist, never invent facts.
5. docs/plans/variety-engine.md "Step 5 as built" (genome, section intents) and docs/design/templates/README.md.
6. Code to mirror: packages/spec/src/sections/define.ts and content.ts (how sections are defined),
   packages/spec/src/intents.ts (asLayout, layoutsFor), packages/spec/src/migrate.ts, packages/components/src/registry.ts,
   packages/components/src/groups/content/ImageText.tsx and Text.tsx (data-path for the editor),
   packages/components/src/chrome/Footer.tsx (CSS custom properties in style attributes), packages/engine/src/compact-catalogue.ts.

Build (spec §2):
- spec v19: section type "composed" (group "composed"), element and placement schemas, design.art (optional),
  migration 18 → 19 (identity) with a test; every golden migrates and renders byte-identical.
- validateComposition and repairComposition with one test per rule in the §2.4 table, wired into validateSite;
  the fallback to a preset layout of the same intent.
- Renderer Composed.tsx + styles/composed.css, registered; placement through CSS custom properties, one static
  stylesheet; masks, treatments, fact treatments (re-use the plate/seal/receipt CSS), sanitised decor SVG; the
  text-over-image scrim step; data-path on every text node; LCP for a composed opener.
- The compact catalogue text for the composition language (generated from the zod schemas), not yet sent to
  any model.
- tools/eval/composed/: M Tablica, S Cevi and J Skorja's signature parts as composed sections, and
  pnpm designer:compose-sheet (360 and 1280 px beside the hand-made pages, pixel difference, axe, horizontal
  scroll, guards). Look at the sheet yourself before calling it done; publish it as a private artifact and
  link it in the HQ item note.

Rules for this PR:
- No model calls and no spend. Nothing is wired into the pipeline yet; config designer.agent is added (false)
  but read nowhere except a test that it defaults to false.
- Worktree + feature branch + PR; CI (typecheck, lint, pnpm test) green without skipping tests.
- Render tests at 360 and 1280 px for every element kind and the placement extremes, axe clean, no horizontal
  scroll. If something in the spec can't be built as written, change the spec doc in the same PR and say why.
- Before the final report, review the full diff against main.
- HQ when it happens: PR opened (note + activity with the link), facts found (notes), new work (items + TASKS.md).
  End of run: rewrite meta/overview and keep 3–6 open overnight proposals (PR B is a free one).
- End with the three headings from CLAUDE.md: Blocked on me, Changed, Found.
```

---

For PR B, replace the first paragraph with: "Build PR B of the AI designer (docs/plans/ai-designer-spec.md §5.1 and §8 row B): tool use in ModelClient, runAgent, recording and replay of agent turns. Check the current Anthropic Messages API docs for tool use (tools, tool_choice, tool_use and tool_result blocks, images in tool results) before writing code. No real calls; scripted transports in tests; existing recordings must replay unchanged." and drop the build list.

For PRs C–E (paid), add: "Read meta/budget first and follow it exactly. Use --max-eur and a separate --recordings directory; log each run in spend/<id>. The remaining allowance this week is <fill in from HQ>."
