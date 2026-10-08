/**
 * The transformation from one trade's site to the next, "like a Transformer from a car to a robot": each
 * visible part of the old site becomes the matching part of the new one (the engine: @sb/morph, which
 * documents the phases). This file pins the landing's own tuning and parts; the headline's letters
 * shuffle into the new words while it turns.
 */
import { morphFrame, type Running } from "@sb/morph";
import { DEMO } from "./demo-timing.ts";
import { SITE_PARTS } from "./demo-parts.ts";

export { within } from "@sb/morph";

export interface TransformOptions {
  /** Reduced motion: a cross-fade instead of the transformation. */
  calm: boolean;
  /** The running transition, so a second switch can skip it. */
  onTransition?: (vt: Running | null) => void;
}

/** The landing's tuning (demo-timing.ts), in the engine's terms. */
export const LANDING_TIMING = {
  phases: DEMO.transform,
  tempo: DEMO.tempo,
  lift: DEMO.lift,
  spread: DEMO.spread,
  waitFonts: DEMO.waitFonts,
  waitImages: DEMO.waitImages,
  waitStyles: DEMO.waitStyles,
  fade: DEMO.calm.switch,
};

/**
 * Turns the site in `main` into the one at `url`, piece by piece. The new site is loaded in `stage` (a
 * frame of the same size under it) first. With `calm`, or without view transitions, a cross-fade.
 */
export function transformSite(main: HTMLIFrameElement, stage: HTMLIFrameElement, url: string, opts: TransformOptions): Promise<void> {
  return morphFrame(main, stage, url, { parts: SITE_PARTS, timing: LANDING_TIMING, calm: opts.calm, decode: "h1", onTransition: opts.onTransition });
}
