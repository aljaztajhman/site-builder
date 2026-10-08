/**
 * The build: a real page (or one element of it) held back by one stylesheet and released in four steps,
 * each a wave from the top: structure (blocks and grey word bars), colours (panel by panel), photos
 * (wiped in) and text (each bar gives way to its words). When the last step ends, what is left is the
 * page itself: `finish` takes the stylesheet off and puts the same text nodes back in place.
 *
 * By the last step nothing of the build may show: no filter left on the panels (a filter composites them
 * apart, which antialiases differently in a scaled frame), no placeholder or clip at the photos' rounded
 * edges, and once every bar has shrunk to nothing, no bars and no wrappers at all: the words go back into
 * their own text then (`unwrap`), while the stylesheet is still on. Done at the handover itself, that
 * repaint can come out antialiased differently from the build's last frame on a busy machine.
 */
import { BUILD_TIMING, type BuildTiming } from "./timing.ts";

/** How long a word's bar takes to shrink away (ms). */
const BAR_MS = 600;

/** The stylesheet; `R` is the root with the build class (`html.mb-bld` or `.mb-bld`), `D` its descendants (`body *` or `*`). */
const buildCss = (R: string, D: string) => `
${R} ${D}{transition:color .5s var(--d,0ms),opacity .45s var(--d,0ms),filter .8s var(--d,0ms),clip-path .8s cubic-bezier(.65,0,.35,1) var(--d,0ms),background-size ${BAR_MS}ms cubic-bezier(.65,0,.35,1) var(--d,0ms),transform .55s cubic-bezier(.2,.8,.2,1) var(--d,0ms) !important}
${R}.mb-still ${D}{transition:none !important}
${R} [data-mb-panel]{filter:none}
${R}.mb-mono [data-mb-panel]{filter:grayscale(1) brightness(1.03)}
${R} mb-w{background:linear-gradient(var(--sk),var(--sk)) 0 60%/100% .55em no-repeat;-webkit-box-decoration-break:clone;box-decoration-break:clone}
${R}.mb-hide-t mb-w{color:transparent !important}
${R}.mb-text mb-w{background-size:0 .55em;background-position:100% 60%}
${R}.mb-empty mb-w{opacity:0}
${R}.mb-empty [data-mb-box]{opacity:0;transform:translateY(10px) scale(.97)}
${R} picture{background-color:rgb(128 128 128/.22)}
${R} img{clip-path:inset(0)}
${R}.mb-nophoto img{clip-path:inset(0 0 100% 0)}
${R}.mb-text picture{background-color:transparent}
${R}.mb-text img{clip-path:none}`;

/**
 * Reduced motion: the same four steps in fades only. Blocks fade in where they stand (no rise, no scale),
 * photos fade in instead of being wiped in, and each word's bar fades away instead of shrinking (its colour
 * is registered so it can be transitioned). Nothing moves or changes size.
 */
const calmCss = (R: string, D: string) => `
@property --sk{syntax:"<color>";inherits:false;initial-value:transparent}
${R}.mb-calm ${D}{transition:color .5s var(--d,0ms),opacity .45s var(--d,0ms),filter .8s var(--d,0ms),--sk ${BAR_MS}ms var(--d,0ms) !important}
${R}.mb-calm.mb-still ${D}{transition:none !important}
${R}.mb-calm.mb-empty [data-mb-box]{transform:none}
${R}.mb-calm img,${R}.mb-calm.mb-nophoto img{clip-path:none}
${R}.mb-calm.mb-nophoto img{opacity:0}
${R}.mb-calm.mb-text mb-w{background-size:100% .55em;background-position:0 60%;--sk:transparent !important}`;

const CLASSES = ["mb-bld", "mb-still", "mb-mono", "mb-hide-t", "mb-empty", "mb-nophoto", "mb-text", "mb-calm"];

/** A computed `rgb(…)` colour at alpha `a`. */
const withAlpha = (rgb: string, a: number): string => {
  const m = rgb.match(/[\d.]+/g);
  return m && m.length >= 3 ? `rgb(${m[0]} ${m[1]} ${m[2]} / ${a})` : `rgb(128 128 128 / ${a})`;
};

export interface BuildOptions {
  /** Fades only (reduced motion). */
  calm?: boolean;
  /** Elements that get their colour in step 2, one after another. Default: header, section, footer, [data-panel]. */
  panels?: string;
  /** Elements that rise into place in step 1. Default: picture, button, .btn, [data-box]. */
  boxes?: string;
  /** A word bar's opacity, from the word's own colour. Default 0.22. */
  barAlpha?: number;
}

export interface Build {
  win: Window;
  root: HTMLElement;
  words: HTMLElement[];
  panels: HTMLElement[];
  boxes: HTMLElement[];
  imgs: HTMLImageElement[];
  timers: ReturnType<typeof setTimeout>[];
  /** Puts the words back into their own text (no wrappers left). Safe to call more than once. */
  unwrap: () => void;
  /** The page as it was: the stylesheet off, the words unwrapped. Safe to call more than once. */
  finish: () => void;
}

/**
 * Takes the page (a document, or one element of a page) apart, instantly and unseen: every visible word
 * wrapped, the stylesheet on. Call `runBuild` to put it together, or `finish` to show it at once.
 */
export function prepareBuild(target: Document | HTMLElement, opts: BuildOptions = {}): Build {
  const { calm = false, panels: panelSel = "header, section, footer, [data-panel]", boxes: boxSel = "picture, button, .btn, [data-box]", barAlpha = 0.22 } = opts;
  const doc = target instanceof Document ? target : target.ownerDocument;
  const whole = target instanceof Document || target === doc.documentElement;
  const root = whole ? doc.documentElement : (target as HTMLElement);
  const scope = whole ? doc.body : root;
  const win = doc.defaultView!;
  const walker = doc.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.nodeValue?.trim() && !n.parentElement?.closest("script, style, noscript, template") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  // A custom element, so the page's own CSS doesn't match it.
  const words = nodes.map((n) => {
    const w = doc.createElement("mb-w");
    n.replaceWith(w);
    w.append(n);
    return w;
  });
  for (const w of words) w.style.setProperty("--sk", withAlpha(win.getComputedStyle(w).color, barAlpha));
  const panels = [...scope.querySelectorAll<HTMLElement>(panelSel)];
  for (const p of panels) p.setAttribute("data-mb-panel", "");
  const boxes = [...scope.querySelectorAll<HTMLElement>(boxSel)];
  for (const x of boxes) x.setAttribute("data-mb-box", "");
  const imgs = [...scope.querySelectorAll("img")];
  const R = whole ? "html.mb-bld" : ".mb-bld";
  const D = whole ? "body *" : "*";
  const style = doc.createElement("style");
  style.textContent = calm ? buildCss(R, D) + calmCss(R, D) : buildCss(R, D);
  doc.head.append(style);
  root.classList.add("mb-bld", "mb-still", "mb-mono", "mb-hide-t", "mb-empty", "mb-nophoto", ...(calm ? ["mb-calm"] : []));
  void doc.body.offsetHeight;
  root.classList.remove("mb-still");
  const timers: ReturnType<typeof setTimeout>[] = [];
  let done = false;
  let unwrapped = false;
  const unwrap = () => {
    if (unwrapped) return;
    unwrapped = true;
    for (const w of words) w.replaceWith(...w.childNodes);
  };
  const finish = () => {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    unwrap();
    style.remove();
    root.classList.remove(...CLASSES);
    for (const el of [...panels, ...boxes, ...imgs]) {
      el.removeAttribute("data-mb-panel");
      el.removeAttribute("data-mb-box");
      el.style.removeProperty("--d");
      if (!el.getAttribute("style")) el.removeAttribute("style");
    }
  };
  return { win, root, words, panels, boxes, imgs, timers, unwrap, finish };
}

/** Builds the page in four steps, each one a wave from the top; `onStep(i)` as each starts (0–3). */
export async function runBuild(b: Build, onStep: (i: number) => void = () => {}, timing: BuildTiming = BUILD_TIMING): Promise<void> {
  const { win, root, words, panels, boxes, imgs } = b;
  const T = timing;
  const vh = win.innerHeight;
  const top = (el: Element) => el.getBoundingClientRect().top;
  const seen = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < vh;
  };
  const ordered = <E extends Element>(els: E[]) =>
    els.filter(seen).sort((a, c) => top(a) - top(c) || a.getBoundingClientRect().left - c.getBoundingClientRect().left);
  const delay = (els: HTMLElement[], f: (el: HTMLElement) => number) => {
    for (const el of els) el.style.setProperty("--d", `${Math.round(f(el))}ms`);
  };
  const pause = (ms: number) => new Promise<void>((r) => b.timers.push(setTimeout(r, ms)));
  // 1. Structure: blocks and word bars appear, top to bottom.
  onStep(0);
  delay([...words, ...boxes], (el) => (seen(el) ? (Math.max(0, top(el)) / vh) * T.structure.spread : T.structure.spread));
  root.classList.remove("mb-empty");
  await pause(T.structure.total);
  // 2. Colours: panel by panel.
  onStep(1);
  const vp = ordered(panels);
  delay(panels, (el) => Math.max(0, vp.indexOf(el)) * T.colours.apart);
  root.classList.remove("mb-mono");
  await pause(vp.length * T.colours.apart + T.colours.after);
  // 3. Photos: wiped in one after another.
  onStep(2);
  const vi = ordered(imgs);
  delay(imgs, (el) => Math.max(0, vi.indexOf(el as HTMLImageElement)) * T.photos.apart);
  root.classList.remove("mb-nophoto");
  await pause(vi.length * T.photos.apart + T.photos.after);
  // 4. Text: each bar gives way to its words, top to bottom.
  onStep(3);
  const vw = ordered(words);
  const per = Math.min(T.text.perWord, T.text.total / Math.max(1, vw.length));
  delay(words, (el) => Math.max(0, vw.indexOf(el)) * per);
  root.classList.remove("mb-hide-t");
  root.classList.add("mb-text");
  const shrunk = vw.length * per + BAR_MS;
  // Every bar has shrunk away: the words go back into their text now, so the handover repaints nothing.
  b.timers.push(setTimeout(b.unwrap, shrunk));
  await pause(Math.max(shrunk, vw.length * per + T.text.after));
  b.finish();
}
