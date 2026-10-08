/**
 * @sb/morph: the Stranko landing demo's animation engine, made reusable. No dependencies, any framework.
 * - morph(): one screen becomes the next part by part ("Transformer"), on a same-document view transition.
 * - morphFrame() / fadeFrame(): the same for whole pages in an iframe.
 * - prepareBuild() / runBuild(): a page builds itself (structure, colours, photos, text).
 * - decode(): text shuffles into its words.
 * Guide for agents: packages/morph/README.md.
 */
export { morph, type MorphOptions, type Running } from "./morph.ts";
export { morphFrame, fadeFrame, type FrameOptions } from "./frame.ts";
export { prepareBuild, runBuild, type Build, type BuildOptions } from "./build.ts";
export { decode } from "./decode.ts";
export { findParts, visible, match, fillPanels, sortOf, boxy, type Part, type PartKind, type PartRule, type Recipe, type Rect, type Pair, type Matching, type Sort } from "./parts.ts";
export { choreograph, keyframes, DEFAULT_BACKDROP, type ChoreographInput, type Frame, type Plan } from "./choreograph.ts";
export { swapDocument, settle, loadInto, within, prefersCalm } from "./dom.ts";
export { MORPH_TIMING, BUILD_TIMING, EASE, morphTiming, type MorphTiming, type MorphPhases, type BuildTiming } from "./timing.ts";
