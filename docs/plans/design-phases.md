# Design phases

One name per attempt at "make every site look like its own design". These names are used in HQ, TASKS.md and new plans. The older plan files keep their own titles.

| Name | When | What it did | Result | State | Docs |
|---|---|---|---|---|---|
| **Design 1 · Directions** | 29 Sep – 1 Oct | 10 design directions over one component library (heroes, content, chrome), subset fonts, header tone. A model picks a direction. | Clean, but every site of a trade looked alike | Live, as the base everything renders through | docs/dev/components.md |
| **Design 2 · Trade templates** | 1–3 Oct | 10 hand-made "wow" homepages built into the engine, one per trade (Tablica, Račun, Etiketa, Jedilnik, Ogledalo, Nasmeh, Markacija, Pregib, Cevi, Skorja) with signature heroes | Strong first screens; trade props (plates, receipts) reused everywhere | Live, as directions | design-templates (memory), PRs #61, #75–78 |
| **Design 3 · Variety engine** | 4–7 Oct | Template families, a seed per site, avoiding what neighbouring sites use, the site's own skeleton (header, phone action, footer), regeneration | Today's pipeline: 3.47 per page on the fresh 10, but whole sets still "one template" (variety 2–3) | Live (families and skeleton on, genome off) | variety-engine.md |
| **Design 4 · AI studio** | 8–15 Oct | A designer layer on top of the library: | Did not beat Design 3; same set variety | Picture studio taken out of the trial on 15 Oct; Studio 1.0 shelved | ai-designer*.md, design-studio.md, studio-*.md, mockup-spike.md, eval/outside-review/shootout.md |
| | | 4a **Composer** (studio 0.5): an Opus director composes from approved presets, with stances and the uniqueness gate | – | | |
| | | 4b **Picture studio** (0.5b): GPT Image paints a mockup, Opus rebuilds it | 3.09 after defect fixes | | |
| | | 4c **Fable studio** (shoot-out only): Fable designs and builds directly | 3.22 after defect fixes, the most distinctive | | |
| | | **Studio 1.0 plan** (S0–S7): multi-concept tournament, designed and not built | – | | |
| **Design 5 · Structures** | from 16 Oct | Changes what a page can look like, not who chooses it: 8 first-screen structures, chrome variants, a variety rule across trade and town, one page-rules gate on every path, photo grade | – | Planned (phase-layout-variety.md); owner decisions D1–D4 answered 15 Oct | phase-layout-variety.md, design-direction-2026-10.md |

**Why Design 5 is different.** Designs 2 to 4 each added a new way to choose a design. All of them ended in the same few first-screen layouts. Reviewers called every set "one template in ten outfits", and the measured visual distance between pages was 0.56–0.58 for every approach.

**Pieces Design 5 inherits from Design 4:**
- the composition language and its presets;
- the page rules for composed pages;
- the neighbour sampler in deal.ts.

**Pieces it drops:**
- the unwired uniqueness gate;
- `look_fingerprints`.

Studio 1.0 also planned to take spec v22. Design 5 now claims that version, so Studio 1.0 needs a new version number if it is ever revived.
