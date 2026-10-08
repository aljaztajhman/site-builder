/**
 * Default timings. They are the values the Stranko landing demo was tuned to by eye (owner, 2026-10-04),
 * so they are a good starting point anywhere: change `tempo` first, the phases only if a step feels wrong.
 */

/** The transformation's phases, in ms before `tempo`. */
export interface MorphPhases {
  /** Parts lift and spread apart; the page underneath goes dark. */
  unlock: number;
  /** Delay between one part starting to travel and the next (one wave from the top). */
  stagger: number;
  /** One rail leg: the longer axis first, then the other. */
  leg: number;
  /** The flip over to the new face, on a hinge. */
  turn: number;
  /** Telescoping out to the new size (clipped, never stretched). */
  extend: number;
  /** Everything snaps down together, with a small overshoot. */
  lock: number;
}

export interface MorphTiming {
  phases: MorphPhases;
  /** Multiplies every phase: 1.5 is half again as slow. */
  tempo: number;
  /** A part's scale while apart. */
  lift: number;
  /** How far parts spread out from the screen's centre while apart (px). */
  spread: number;
  /** Caps on waiting for fonts, images in view and new stylesheets while the new state is laid out (ms). */
  waitFonts: number;
  waitImages: number;
  waitStyles: number;
  /** Reduced motion: the cross-fade's length (ms). */
  fade: number;
}

export const MORPH_TIMING: MorphTiming = {
  phases: { unlock: 200, stagger: 48, leg: 210, turn: 280, extend: 240, lock: 260 },
  tempo: 1.5,
  lift: 0.955,
  spread: 22,
  waitFonts: 1200,
  waitImages: 1500,
  waitStyles: 1500,
  fade: 600,
};

/** The build's four steps (ms): structure over `spread` by height, then colours, photos and text in waves. */
export interface BuildTiming {
  structure: { spread: number; total: number };
  colours: { apart: number; after: number };
  photos: { apart: number; after: number };
  text: { perWord: number; total: number; after: number };
}

export const BUILD_TIMING: BuildTiming = {
  structure: { spread: 1000, total: 1550 },
  colours: { apart: 220, after: 800 },
  photos: { apart: 230, after: 850 },
  text: { perWord: 45, total: 1300, after: 700 },
};

/** Easing curves of the transformation, by what they move. */
export const EASE = {
  out: "cubic-bezier(.2,.8,.2,1)",
  rail: "cubic-bezier(.8,0,.2,1)",
  turnIn: "cubic-bezier(.55,0,1,.45)",
  turnOut: "cubic-bezier(.15,.85,.35,1.2)",
  extend: "cubic-bezier(.65,0,.2,1.12)",
  snap: "cubic-bezier(.35,0,.6,1)",
  settle: "cubic-bezier(.2,.9,.3,1)",
} as const;

/** A partial timing over the defaults (phases merged key by key). */
export function morphTiming(over: Partial<Omit<MorphTiming, "phases">> & { phases?: Partial<MorphPhases> } = {}): MorphTiming {
  return { ...MORPH_TIMING, ...over, phases: { ...MORPH_TIMING.phases, ...over.phases } };
}
