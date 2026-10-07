# Landing page: the trade demo that builds itself and transforms (spec)

Owner's direction, 2026-10-04 (chat; HQ item `sb-trade-transform`, decision `sb-trade-five`). Reference implementation: `prototypes/transform/preview.html` on branch `claude/transform-prototype` (commit 8cd083a or later). Run it with `node prototypes/transform/serve.mjs`, then http://localhost:3091/ (prototype 1, rejected, is at `/v1`).

## What the owner wants

The hero demo on the landing page (right column of `#zacni`) becomes one continuous piece:

1. **The description is typed** into a prompt card: the first trade's own description, shortened.
2. **"Ustvari" is pressed and the page builds itself** in the device while four steps tick: *Razumevanje opisa*, *Oblikovna smer in barve*, *Fotografije*, *Besedila in postavitev*. The prompt card shrinks into the step list under the device. The page appears as structure (grey word bars and boxes), then gets its colours section by section, then its photos, then its text. What is left at the end is the real page, with no cut or jump. Then the caption takes the step card's place.
3. **The demo moves through the trades by itself.** Every 4.5 s the site transforms into the next trade's site piece by piece, "like a Transformer from a car to a robot": parts come apart, run to their new places, turn over to their new face, telescope to their new size and lock. It is not one page revealed behind another.
4. **The trades are tabs** above the demo (not chips); the shown tab's underline fills up as the timer to the next one. A click or the arrow keys show that trade, and the demo carries on from there.
5. **Above the tabs, right of "Poglejte primer za svojo dejavnost:"**: a phone/computer switch as two icons, and a pause button as an icon. The demo opens in the **computer** view ("better for presenting").
6. **The landing page itself keeps its own look.** Switching a trade no longer recolours the page, changes its fonts or corners, or reveals it in a circle. The owner's reasoning: the landing's structure never changes, so re-theming it adds nothing; the structure changes in the preview are what they like.
7. **At most 5 trades.** Which five is HQ decision `sb-trade-five`; read it. If it is still open, use the recommended set (Frizer, Gostilna, Avtoservis, Zobozdravnik, Inštalater), keep the list in one place, and say so in the PR.
8. **Tempo:** the transformation runs at 1.5 × the first tuning, with no slow-motion control.
9. **Everything seamless:**
   - Nothing may jitter, resize or jump: not at load, not while typing, not between steps, not from the last step to the site.
   - The left column (prompt intake) keeps exactly the live page's width. The hero grid stays `1.25fr .75fr`; don't widen the demo column.

Watch the prototype before writing code: the intro, two or three automatic switches, a click on a tab, pause, and the phone view. The owner judged the feel there. Port it; don't re-design it. Timing constants are tuned; don't change them without the owner.

## Scope

### Changes
- `apps/web/src/home.tsx`: the right column of the hero.
  - Replace the `.trades` chips and the `figure.demo` (prompt → build → phone → desk player) with: the top row (question, view switch, pause), the tab list, the demo box (intro card + device with two frames) and the caption. The markup is in the prototype.
  - Remove the server-side trade look: `style={tradeStyle(...)}` and `data-trade` on `<html>`, `tradeFontFace`, "Nazaj na videz Stranko", "Več dejavnosti".
- `apps/web/src/client/home.ts`: replace the demo player and the trade switching. Split it into strict TypeScript modules, for example:
  - `client/demo-parts.ts`: parts, matching, paint order;
  - `client/demo-transform.ts`: choreography, keyframes, the view-transition swap, headline decode;
  - `client/demo-build.ts`: prepare, run and finish the build;
  - the orchestration (intro, tabs, autoplay, pause, view, gating) stays in `home.ts`.
  The prototype is plain JS in one file; types and module boundaries are yours.
- `apps/web/src/ui/home.css`: replace the `.demo*`, `.trades`, `.chips`, `.chip`, `.trades-reset` and `html.trade-switch` rules with the prototype's (top row, views, pause, tabs, devbox, intro card, `ask-*`, device, screen backdrop).
- `apps/web/src/showcase.ts`: the client data becomes id, label, page, title, caption (and the intro text, below). `tradeStyle`, `tradeFontFace` and `vars` go.
- `packages/spec/src/showcase.ts`:
  - Keep all 10 `SHOWCASES`: `awayFromShowcases` in the engine relies on every colourway.
  - Add the landing's ordered list of 5 ids (the decision), in one place.
  - The first entry's description is the intro text. Store a short `intro` text per showcase, taken from its fixture `tools/eval/fixtures/<golden>/brief.json` and shortened. Invent nothing; it is Slovene.
  - Frizer's, as in the prototype: "Sem Lana Vidmar in že devet let vodim Frizerstvo Lana na Stanetovi ulici 14 v Celju. Strižemo ženske, moške in otroke, delamo barvanje brez amoniaka, pramene in svečane pričeske …"
- `tools/eval/src/examples/showcase.ts` and `showcase.json`:
  - Drop the landing tokens (`vars`) and the landing font, since nothing recolours the landing any more.
  - Re-run `pnpm examples:build`. The committed examples must equal a fresh build (`tools/eval/test/examples.test.ts`).
  - The test "every trade's landing tokens keep text at 4.5:1" goes away with the feature it tests. Remove only that test, and say so in the PR. Don't delete or skip any other test.
- `apps/web/test/showcase-browser.test.ts`: rewrite for the new behaviour (Checks, below).
- `/?primer=<id>` stays a working, shareable link. It shows that trade's site in the demo with its tab selected, without the intro and without changing the landing's look. Without JavaScript the tabs are links to `/?primer=<id>#zacni` (render them as `<a role="tab">`; the script handles the click).

### Not in scope
- The left column, the intake form and the rest of the landing page ("Kaj dobite", "Kako deluje", the Primer section, pricing, FAQ).
- Published client sites: nothing in `packages/render` or `packages/components` changes. Part detection uses the component library's existing class names, read only on the landing page.

## Behaviour

### Layout (from the prototype)
- **Top row:** "Poglejte primer za svojo dejavnost:" on the left; on the right a radiogroup "Pogled" with two icon buttons (Telefon, Računalnik; `aria-label` and `title`) and the pause button (an icon: ⏸ "Ustavi" / ▶ "Predvajaj", `aria-pressed`). At least 44 px under `pointer: coarse`.
- **Tabs:** full column width, `role=tablist` (labelled by the question), `role=tab` with `aria-selected` and a roving tabindex, ← → Home End, focus visible. Underline 2 px in `--accent`; while the demo moves on by itself it fills over the dwell time (CSS animation, restarted per trade). All five fit at the live desktop column width (about 398 px at a 1280 px viewport); on narrow screens the list scrolls sideways inside itself, with the selected tab kept in view. The page never scrolls sideways.
- **Device:**
  - Computer: column width × (width × 0.62 + 24) with a 24 px chrome bar, the site at 1280 px scaled to fit.
  - Phone: 280 × 546, the site at 360 px.
  - Size it in CSS from the column width (container units) so it is right before the script runs. The size animates (0.9 s) only when the view is switched, never at load.
- **Caption:** under the device, `min-height` = the step card's height, so the steps sit exactly in the caption's place and cover nothing below.

### Intro: type, then build (the first time the demo is on screen)
1. **Typing:**
   - Wait for `document.fonts.ready`.
   - The card is placed before it shows: over the device area, full column width, vertically centred.
   - Its text is laid out in full from the start: typed part, a caret with zero advance (`margin-right: -2px`), and the untyped rest in `color: transparent`. Measured in the prototype: one card position and one text height through the whole typing.
   - 3 characters every 45 ms. At typed + 450 ms "Ustvari" shows pressed; at typed + 700 ms the build starts.
2. **Card morph:**
   - The same card moves and resizes (0.7 s, `cubic-bezier(.65,0,.35,1)`, left/top/width/height) to under the device, width min(280, column), centred on the device.
   - The typed content fades out and the step list fades in.
   - The device rises in (opacity, translateY 14 px → 0, scale 0.97 → 1).
   - The first tab is selected at this moment, without the timer fill.
3. **Build:** this is the real first-trade page, loaded in the main frame while typing and held back by one stylesheet.
   - **Prepare:**
     - Wrap every non-empty text node in `<sb-w>`, a custom element so the site's own CSS doesn't match it.
     - Give each word a bar colour: its text colour at 22 % alpha (`--sk`).
     - Mark the panels (`.site-header`, `main > section`, `.site-footer`, `.action-bar`) and the boxes (`picture`, `.btn`, `button`).
     - Inject the build stylesheet. Add the classes `bld mono hide-t empty nophoto` with transitions off, then reflow and turn transitions on.
   - **Run** (each step a wave from the top; only parts in the frame's viewport count):

     | Step | What happens | Timing |
     |---|---|---|
     | Razumevanje opisa | word bars and boxes appear (opacity; boxes also translateY 10 px and scale 0.97) | over 1 000 ms by their top, then 1 550 ms in all |
     | Oblikovna smer in barve | panels go from `grayscale(1)` to colour, one after another | 220 ms apart, + 800 ms |
     | Fotografije | images wipe in with `clip-path: inset(0 0 100% 0)` → `inset(0)` | 230 ms apart, + 850 ms |
     | Besedila in postavitev | each bar gives way to its words (bar `background-size` → 0 towards the right, colour back) | ≤ 45 ms per word, ≤ 1 300 ms in all, + 700 ms |

     The current step has a pulsing ring; finished steps are filled.
   - **Finish:**
     - Remove the stylesheet and the classes, unwrap every `<sb-w>` (the same text nodes back in place), and remove the marks and `--d`.
     - **The last frame of the build must equal the page after finish.**
     - The card fades out, the caption fades in, the autoplay clock starts.
4. A tab clicked during the intro finishes it at once (the page snaps to done) and switches to that trade.

### Autoplay
- Dwell is 4 500 ms per trade, then switch to the next, wrapping from the last trade back to the first.
- The clock runs only while the demo box is ≥ 30 % on screen, the document is visible, it is not paused and no switch is running.
- Clicking a tab or pressing an arrow switches, and the clock restarts from that trade.
- A loop that runs by itself needs a stop (WCAG 2.2.2): the pause button.
- **Screen readers:** don't announce every automatic switch. Update the caption's live region only on user-initiated switches.

### The transformation (port from the prototype; constants in one exported object)
- **Prepare:**
  - Load the next page in a second frame of the same size, layered under the visible one.
  - Wait for fonts and for decoded images in view (time-capped).
  - Find the parts on both pages: each must be in the viewport and have exactly one client rect.
- **Parts:** the header and brand, nav items, the nav toggle and the header button; the hero panel, an optional label card, the wall lettering, eyebrow, h1, lead, actions, hero photos, facts and chip; the second section's panel, title, list items and actions; further sections in view as panels. The selectors are in `parts()` in the prototype.
- **Matching:**
  - Same role first.
  - Leftovers pair only within the same sort (panel, photo, button, text) and when their areas are within 5 ×.
  - Old parts with no partner retract into the nearest new part's place (panels drop out of view). New parts with no partner unfold out of the nearest old part's place (panels rise from below).
- **Timing** (ms, then × 1.5): unlock 200, stagger 48, leg 210, turn 280, extend 240, lock 260. Parts start in one wave from the top of the new page. A panel turns at the median of its parts' turns, so its colour and theirs change together. The whole switch takes about 3.2 s on the computer view.
- **Motion of a part:**
  1. It lifts (scale 0.955, drop shadow on boxes only; on text a shadow reads as blur) and spreads out from the screen centre (≤ 22 px).
  2. It runs on rails: the longer axis first, then the other, retracting where the new part is smaller.
  3. It turns over at its new place: X hinge for panels and wide parts, Y hinge for the rest, alternating direction. 3D is used only during the turn, because a 3D layer rasterises soft.
  4. It telescopes out where the new part is bigger.
  5. All parts lock together at the end with a small overshoot and a brightness glint.
  - Never stretch a snapshot: old/new images are `inline-size: auto` and the image pair clips. Text stays sharp.
- **Backdrop:** the page under the parts goes dark (`--screen` in home.css, `#0f1a1c` since sb-ui-palette, with a faint dot grid) at unlock and comes back at lock.
- **Stacking** while apart follows each page's own paint order: Gostilna's full-width photo stays under its text card.
- **Solid panels:** while transforming, a panel with no background gets the colour behind it.
- **Headline:** the new h1's letters shuffle into the new words, left to right, during its turn and extend.
- **Engine:**
  - A same-document view transition inside the frame.
  - Its callback swaps the head (keep identical nodes so the shared stylesheet stays loaded, add new ones and wait for new stylesheets) and the body.
  - Recreate the site's inline scripts so they run (the example CSP allows them by hash).
  - Keyframes are generated per part. Round percentages to 4 decimals and keep them strictly increasing; equal percentages merge and turn the face swap into a crossfade, which was a prototype bug.
  - After the transition, remove the names and filled backgrounds.
- **Interruptions:** a second switch during one skips the running transition and queues the latest request. If the document is hidden, the browser aborts the transition; the swap still happens and the clock is stopped.

### Reduced motion, no JavaScript, failures
- **`prefers-reduced-motion: reduce`:** no typing and no build animation (the first trade's site shows at once); a switch is a cut, with no view transition; autoplay continues, with pause.
- **No view transitions** (old browsers): the switch is a cut.
- **No JavaScript:** the first trade's site (or the one in `?primer=`) shows in the device, the tabs are links, the caption is visible, there is no intro.
- **No flash of the finished site before the intro starts.** The script runs after first paint, so the starting state must not depend on it alone. One way: a tiny same-origin script in `<head>` that sets `html.js` synchronously (CSP `script-src 'self'` allows it), with the intro's starting state under `html.js`.

### Copy (Slovene, exactly)
- "Poglejte primer za svojo dejavnost:"
- "Pogled", "Telefon", "Računalnik"
- "Ustavi", "Predvajaj"
- "＋ 5 fotografij", "Ustvari"
- The four step labels above.
- Caption: the existing `tradeCaption(t)`.
- Frame title: "Primer strani: <name>".

## Checks (Done means)
1. Typecheck, lint and `pnpm test` pass on CI; `pnpm examples:build` leaves the committed examples equal to a fresh build. On this machine run only the touched test files, one worker; the full suite runs on CI.
2. `apps/web/test/showcase-browser.test.ts`, rewritten, at 1280 and 360 px:
   - **Intro:** type → build → site. While typing, the card's rect and the column's height don't change (sample them as the prototype's checks did). The landing's `<html>` has no inline style and no `data-trade` at any time.
   - **Build:** a screenshot of the frame just before finish equals one just after finish.
   - **Switching:** the demo advances by itself after the dwell (Playwright's clock where it can drive timers; otherwise real time). A tab click and the arrow keys switch, and the frame title follows. Pause stops the clock. The view switch resizes the device.
   - **Gostilna** on the phone view: the label card stays above the photo while transforming.
   - **Reduced motion:** no intro, the switch is a cut.
   - **No JS:** tabs are links, `?primer=<id>` shows that trade.
   - **Across the board:** every example page and font is served, no sideways scroll, no console errors.
3. **Contact sheets** (pause all animations in the frame right after the switch starts, then step `currentTime`, as the prototype was checked): the intro on the computer view, and Frizer → Avtoservis and Frizer → Gostilna on both views. Look at them and attach them to the PR.
4. **Self-review:** the full diff against main is reviewed before the PR is reported.
5. **HQ:**
   - Item `sb-trade-transform`: status, notes, PR link.
   - One `activity` entry.
   - If `sb-trade-five` was still open, a note that the recommended set was used.

## Constraints
- Follow CLAUDE.md: feature branch in a worktree from main (e.g. `claude/landing-trade-demo`), a PR, never merge. Code and comments in English; UI copy in Slovene.
- No paid calls: none are needed (HQ budget `mode: "none"`).
- The prototype's debug aids don't ship: `?freeze`, `?big`, the badge and `serve.mjs`.
