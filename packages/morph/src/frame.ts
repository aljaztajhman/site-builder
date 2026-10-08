/**
 * The iframe flavour: one whole page in a frame becomes another page (the Stranko landing demo, a
 * template gallery, a before/after viewer). A second frame of the same size (`stage`, kept under the
 * visible one) loads the next page first, so its fonts and photos are warm when the morph measures it.
 */
import { loadInto, prefersCalm, settle, swapDocument } from "./dom.ts";
import { morph, type MorphOptions } from "./morph.ts";
import { morphTiming } from "./timing.ts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type FrameOptions = Omit<MorphOptions, "doc" | "update">;

/**
 * Reduced motion (and browsers without view transitions): a cross-fade between frames. The new page is
 * loaded in `stage`; `main` fades out over it, then loads the same page unseen and comes back at once,
 * showing the same picture. Only opacity changes; nothing moves.
 */
export async function fadeFrame(main: HTMLIFrameElement, stage: HTMLIFrameElement, url: string, opts: Pick<MorphOptions, "timing" | "onTransition"> = {}): Promise<void> {
  const timing = morphTiming(opts.timing);
  await loadInto(stage, url);
  const sdoc = stage.contentDocument;
  if (sdoc) {
    sdoc.defaultView?.scrollTo(0, 0);
    await settle(sdoc, timing);
  }
  let skip = () => {};
  const skipped = new Promise<void>((r) => (skip = r));
  opts.onTransition?.({ skipTransition: () => skip() });
  try {
    main.style.transition = `opacity ${timing.fade}ms ease`;
    void main.offsetWidth;
    main.style.opacity = "0";
    await Promise.race([sleep(timing.fade), skipped]);
    await loadInto(main, url);
    const doc = main.contentDocument;
    if (doc) await settle(doc, timing);
  } finally {
    main.style.transition = "none";
    main.style.removeProperty("opacity");
    void main.offsetWidth;
    main.style.removeProperty("transition");
    if (!main.getAttribute("style")) main.removeAttribute("style");
    opts.onTransition?.(null);
  }
}

/**
 * Turns the page in `main` into the page at `url` (same origin), part by part. Both frames must have the
 * same size. With `calm` (default: the user's reduced-motion setting), or without view transitions, a
 * cross-fade (`fadeFrame`).
 */
export async function morphFrame(main: HTMLIFrameElement, stage: HTMLIFrameElement, url: string, opts: FrameOptions): Promise<void> {
  const doc = main.contentDocument as (Document & { startViewTransition?: unknown }) | null;
  const win = main.contentWindow;
  const timing = morphTiming(opts.timing);
  if (!doc || !win || (opts.calm ?? prefersCalm()) || !doc.startViewTransition) return fadeFrame(main, stage, url, opts);
  // The new page, laid out in the hidden frame first: fonts and photos warm.
  const [html] = await Promise.all([fetch(url).then((r) => r.text()), loadInto(stage, url)]);
  const sdoc = stage.contentDocument!;
  sdoc.defaultView?.scrollTo(0, 0);
  await settle(sdoc, timing);
  win.scrollTo(0, 0);
  return morph({
    ...opts,
    doc,
    calm: false,
    update: async () => {
      win.history.replaceState(null, "", url);
      await swapDocument(doc, html, { waitStyles: timing.waitStyles, keep: [...doc.querySelectorAll("style[data-morph]")] });
    },
  });
}
