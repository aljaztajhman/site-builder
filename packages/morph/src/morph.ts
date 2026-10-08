/**
 * morph(): one screen becomes the next, part by part. You change the DOM in `update` (swap markup,
 * re-render a component, load a page); the engine finds the parts before and after with a recipe, pairs
 * them by role and plays the choreography as a same-document view transition. Nothing is cloned: the
 * browser snapshots the real old and new elements, so the end state is exactly what `update` left.
 */
import { choreograph, DEFAULT_BACKDROP } from "./choreograph.ts";
import { decode } from "./decode.ts";
import { prefersCalm, settle } from "./dom.ts";
import { fillPanels, findParts, match, visible, type Part, type Recipe } from "./parts.ts";
import { morphTiming, type MorphPhases, type MorphTiming } from "./timing.ts";

type VT = { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void>; skipTransition(): void };
type WithVT = Document & { startViewTransition?: (cb: () => Promise<void>) => VT };

/** What a caller may do with a running morph. */
export type Running = Pick<VT, "skipTransition">;

export interface MorphOptions {
  /** The document to morph in (an iframe's, for example). Default: `document`. */
  doc?: Document;
  /** Which elements move: a recipe, or a function that finds the parts itself. */
  parts: Recipe | ((doc: Document) => Part[]);
  /** Changes the DOM to the new state. Runs once, while the old state is on screen as a snapshot. */
  update: () => void | Promise<void>;
  /** Timing over the defaults (`MORPH_TIMING`); `tempo` alone is usually enough. */
  timing?: Partial<Omit<MorphTiming, "phases">> & { phases?: Partial<MorphPhases> };
  /** Fades only (reduced motion). Default: the user's `prefers-reduced-motion`. */
  calm?: boolean;
  /** CSS background behind the parts while apart, or `false` for no dark screen (old and new cross-fade). */
  backdrop?: string | false;
  /** Key of a text part whose letters shuffle into the new words while it turns (e.g. "h1"). */
  decode?: string;
  /** Prefix for transition and keyframe names; unique per document if two engines share one. Default "morph". */
  prefix?: string;
  /** Wait (capped) for fonts and images in view after `update`, before measuring. Default true. */
  settle?: boolean;
  /** Called with the running transition (so a newer request can skip it), then with null when it ends. */
  onTransition?: (t: Running | null) => void;
}

/**
 * Plays the morph and resolves when it has finished (or was skipped). Without view transitions it just
 * runs `update`; with `calm` it cross-fades. Errors thrown by `update` are re-thrown after cleaning up.
 */
export async function morph(o: MorphOptions): Promise<void> {
  const doc = (o.doc ?? document) as WithVT;
  const win = doc.defaultView!;
  const timing = morphTiming(o.timing);
  const recipe = o.parts;
  const find = typeof recipe === "function" ? recipe : (d: Document) => findParts(d, recipe);
  if (!doc.startViewTransition) return void (await o.update());
  const prefix = o.prefix ?? "morph";
  const style = doc.createElement("style");
  style.dataset.morph = prefix;
  if (o.calm ?? prefersCalm(win)) {
    style.textContent = `::view-transition-old(root),::view-transition-new(root){animation-duration:${timing.fade}ms}`;
    doc.head.append(style);
    return run(doc.startViewTransition(async () => {
      await o.update();
      if (!style.isConnected) doc.head.append(style);
    }), o, () => style.remove());
  }

  const oldParts = find(doc).filter(visible(doc));
  const names = new Map<Part, string>(oldParts.map((p, i) => [p, `${prefix}-${i}`]));
  const named: HTMLElement[] = [];
  for (const [p, n] of names) {
    p.el.style.setProperty("view-transition-name", n);
    named.push(p.el);
  }
  const unfillOld = fillPanels(oldParts);
  let unfillNew = () => {};
  let undoDecode = () => {};

  const vt = doc.startViewTransition(async () => {
    await o.update();
    // The old screen is captured: its names have done their job, and an element that stays may be named anew.
    for (const p of oldParts) p.el.style.removeProperty("view-transition-name");
    if (o.settle !== false) await settle(doc, timing);
    const newParts = find(doc).filter(visible(doc));
    const m = match(oldParts, newParts);
    const plan = choreograph({ ...m, newPanels: newParts.filter((p) => p.kind === "panel"), vw: win.innerWidth, vh: win.innerHeight, timing, nameOf: (p) => names.get(p)!, prefix, backdrop: o.backdrop ?? DEFAULT_BACKDROP });
    style.textContent = plan.css;
    doc.head.append(style);
    const moving = new Set<HTMLElement>();
    for (const [el, n] of plan.newNames) {
      el.style.setProperty("view-transition-name", n);
      named.push(el);
      moving.add(el);
    }
    unfillNew = fillPanels(newParts.filter((p) => moving.has(p.el)));
    const focus = o.decode === undefined ? undefined : newParts.find((p) => p.key === o.decode);
    const at = o.decode === undefined ? undefined : plan.faceAt.get(o.decode);
    if (focus && at !== undefined) undoDecode = decode(focus.el, at, plan.T.turn / 2 + plan.T.extend + 220 * timing.tempo);
  });
  return run(vt, o, () => {
    undoDecode();
    unfillOld();
    unfillNew();
    style.remove();
    for (const el of named) el.style.removeProperty("view-transition-name");
  });
}

async function run(vt: VT, o: MorphOptions, cleanup: () => void): Promise<void> {
  o.onTransition?.(vt);
  vt.ready.catch(() => undefined);
  let failed: unknown;
  vt.updateCallbackDone.catch((e: unknown) => (failed = e));
  try {
    await vt.finished;
  } catch {
    // Skipped (a newer morph) or aborted (the tab hidden): the update still happened.
  } finally {
    cleanup();
    o.onTransition?.(null);
  }
  if (failed !== undefined) throw failed;
}
