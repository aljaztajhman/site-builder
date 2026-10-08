/**
 * The landing demo's build: the first trade's real page, in the demo frame, held back by one stylesheet and
 * released in four steps (structure, colours, photos, text) by @sb/morph. When the last step ends, what is
 * left is the page itself. This file pins the landing's panels, boxes and tuning.
 */
import { prepareBuild as prepare, runBuild as run, type Build } from "@sb/morph";
import { DEMO } from "./demo-timing.ts";

export type { Build };

/** Takes the page in the frame apart (instantly, unseen). `calm` (reduced motion): the build in fades only. */
export const prepareBuild = (doc: Document, { calm = false }: { calm?: boolean } = {}): Build =>
  prepare(doc, { calm, panels: ".site-header, main > section, .site-footer, .action-bar", boxes: "picture, .btn, button" });

/** Builds the page in four steps, each one a wave from the top; `onStep(i)` as each starts. */
export const runBuild = (b: Build, onStep: (i: number) => void): Promise<void> => run(b, onStep, DEMO.build);
