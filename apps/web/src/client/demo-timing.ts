/**
 * The landing demo's tuned constants, all in one place (docs/plans/landing-trade-demo.md). The owner judged
 * the feel with these values in the prototype (prototypes/transform/preview.html on claude/transform-prototype);
 * don't change them without the owner.
 */
export const DEMO = {
  /** Time on each trade's site before the demo moves on (ms). */
  dwell: 4500,
  /** The transformation runs at this multiple of its first tuning (owner, 2026-10-04: 1.5×, no slow-motion control). */
  tempo: 1.5,
  /** The demo box must be at least this much on screen for the clock to run. */
  onScreen: 0.3,
  /** The intro's typing: `chars` characters every `everyMs`; "Ustvari" pressed at typed + `pressAt`, the build at typed + `buildAt`. */
  typing: { chars: 3, everyMs: 45, pressAt: 450, buildAt: 700 },
  /** After the card has moved under the device, before the first build step (ms). */
  buildStart: 450,
  /** After the last build step, before the card gives way to the caption (ms). */
  buildEnd: 500,
  /** The build's four steps (ms): structure over `spread` by height, then `after`; colours, photos and text in waves. */
  build: {
    structure: { spread: 1000, total: 1550 },
    colours: { apart: 220, after: 800 },
    photos: { apart: 230, after: 850 },
    text: { perWord: 45, total: 1300, after: 700 },
  },
  /** The transformation's phases (ms, before `tempo`). */
  transform: { unlock: 200, stagger: 48, leg: 210, turn: 280, extend: 240, lock: 260 },
  /** A part's scale while apart, and how far it spreads from the screen's centre (px). */
  lift: 0.955,
  spread: 22,
  /** Time caps while the next site is laid out (ms). */
  waitFonts: 1200,
  waitImages: 1500,
  waitStyles: 1500,
  /** The view switch (ms) and the phone's size (px). */
  resize: 900,
  phone: { width: 280, ratio: 1.95, site: 360 },
  desk: { ratio: 0.62, chrome: 24, site: 1280 },
} as const;
