/**
 * The landing demo's build: the first trade's real page, in the demo frame, held back by one stylesheet and
 * released in four steps (structure, colours, photos, text). When the last step ends, what is left is the
 * page itself: `finish` takes the stylesheet off and puts the same text nodes back in place.
 */
import { DEMO } from "./demo-timing.ts";

/**
 * Held back while building: words as bars, photos wiped out, sections without colour, blocks not yet placed.
 * By the last step nothing of it may show: no filter left on the panels (a filter composites them apart,
 * which antialiases differently in the scaled frame), no placeholder or clip at the photos' rounded edges,
 * and once every bar has shrunk to nothing, no bars and no wrappers at all: the words go back into their own
 * text then (`unwrap`), while this stylesheet is still on. A zero-width bar and a cloned box decoration still
 * shift the antialiasing at line starts, and putting the text nodes back repaints every line; done at the
 * handover itself, that repaint landed in the first frame without the stylesheet and, on a busy machine, came
 * out antialiased differently from the build's last frame (1 px columns at the hero's line starts).
 */
/** How long a word's bar takes to shrink away (ms). */
const BAR_MS = 600;
const BUILD_CSS = `
html.bld body *{transition:color .5s var(--d,0ms),opacity .45s var(--d,0ms),filter .8s var(--d,0ms),clip-path .8s cubic-bezier(.65,0,.35,1) var(--d,0ms),background-size ${BAR_MS}ms cubic-bezier(.65,0,.35,1) var(--d,0ms),transform .55s cubic-bezier(.2,.8,.2,1) var(--d,0ms) !important}
html.bld.still body *{transition:none !important}
html.bld [data-plate]{filter:none}
html.bld.mono [data-plate]{filter:grayscale(1) brightness(1.03)}
html.bld sb-w{background:linear-gradient(var(--sk),var(--sk)) 0 60%/100% .55em no-repeat;-webkit-box-decoration-break:clone;box-decoration-break:clone}
html.bld.hide-t sb-w{color:transparent !important}
html.bld.text sb-w{background-size:0 .55em;background-position:100% 60%}
html.bld.empty sb-w{opacity:0}
html.bld.empty [data-bk]{opacity:0;transform:translateY(10px) scale(.97)}
html.bld picture{background-color:rgb(128 128 128/.22)}
html.bld img{clip-path:inset(0)}
html.bld.nophoto img{clip-path:inset(0 0 100% 0)}
html.bld.text picture{background-color:transparent}
html.bld.text img{clip-path:none}`;

/**
 * Reduced motion: the same four steps in fades only. Blocks fade in where they stand (no rise, no scale),
 * photos fade in instead of being wiped in, and each word's bar fades away instead of shrinking (its colour
 * is registered so it can be transitioned). Nothing moves or changes size.
 */
const CALM_CSS = `
@property --sk{syntax:"<color>";inherits:false;initial-value:transparent}
html.bld.calm body *{transition:color .5s var(--d,0ms),opacity .45s var(--d,0ms),filter .8s var(--d,0ms),--sk ${BAR_MS}ms var(--d,0ms) !important}
html.bld.calm.still body *{transition:none !important}
html.bld.calm.empty [data-bk]{transform:none}
html.bld.calm img,html.bld.calm.nophoto img{clip-path:none}
html.bld.calm.nophoto img{opacity:0}
html.bld.calm.text sb-w{background-size:100% .55em;background-position:0 60%;--sk:transparent !important}`;

const CLASSES = ["bld", "still", "mono", "hide-t", "empty", "nophoto", "text", "calm"];

/** A computed `rgb(…)` colour at alpha `a`. */
const withAlpha = (rgb: string, a: number): string => {
  const m = rgb.match(/[\d.]+/g);
  return m && m.length >= 3 ? `rgb(${m[0]} ${m[1]} ${m[2]} / ${a})` : `rgb(128 128 128 / ${a})`;
};

export interface Build {
  win: Window;
  de: HTMLElement;
  words: HTMLElement[];
  plates: HTMLElement[];
  boxes: HTMLElement[];
  imgs: HTMLImageElement[];
  timers: ReturnType<typeof setTimeout>[];
  /** Puts the words back into their own text (no wrappers left). Safe to call more than once. */
  unwrap: () => void;
  /** The page as it was: the stylesheet off, the words unwrapped. Safe to call more than once. */
  finish: () => void;
}

/**
 * Takes the page in the frame apart (instantly, unseen): every visible word wrapped, the stylesheet on.
 * `calm` (reduced motion): the build in fades only.
 */
export function prepareBuild(doc: Document, { calm = false }: { calm?: boolean } = {}): Build {
  const win = doc.defaultView!;
  const de = doc.documentElement;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.nodeValue?.trim() && !n.parentElement?.closest("script, style, noscript, template") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  // A custom element, so the site's own CSS doesn't match it.
  const words = nodes.map((n) => {
    const w = doc.createElement("sb-w");
    n.replaceWith(w);
    w.append(n);
    return w;
  });
  for (const w of words) w.style.setProperty("--sk", withAlpha(win.getComputedStyle(w).color, 0.22));
  const plates = [...doc.querySelectorAll<HTMLElement>(".site-header, main > section, .site-footer, .action-bar")];
  for (const p of plates) p.setAttribute("data-plate", "");
  const boxes = [...doc.querySelectorAll<HTMLElement>("picture, .btn, button")];
  for (const x of boxes) x.setAttribute("data-bk", "");
  const imgs = [...doc.images];
  const style = doc.createElement("style");
  style.textContent = calm ? BUILD_CSS + CALM_CSS : BUILD_CSS;
  doc.head.append(style);
  de.classList.add("bld", "still", "mono", "hide-t", "empty", "nophoto", ...(calm ? ["calm"] : []));
  void doc.body.offsetHeight;
  de.classList.remove("still");
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
    de.classList.remove(...CLASSES);
    for (const el of [...plates, ...boxes, ...imgs]) {
      el.removeAttribute("data-plate");
      el.removeAttribute("data-bk");
      el.style.removeProperty("--d");
      if (!el.getAttribute("style")) el.removeAttribute("style");
    }
  };
  return { win, de, words, plates, boxes, imgs, timers, unwrap, finish };
}

/** Builds the page in four steps, each one a wave from the top; `onStep(i)` as each starts. */
export async function runBuild(b: Build, onStep: (i: number) => void): Promise<void> {
  const { win, de, words, plates, boxes, imgs } = b;
  const T = DEMO.build;
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
  de.classList.remove("empty");
  await pause(T.structure.total);
  // 2. Colours: section by section.
  onStep(1);
  const vp = ordered(plates);
  delay(plates, (el) => Math.max(0, vp.indexOf(el)) * T.colours.apart);
  de.classList.remove("mono");
  await pause(vp.length * T.colours.apart + T.colours.after);
  // 3. Photos: wiped in one after another.
  onStep(2);
  const vi = ordered(imgs);
  delay(imgs, (el) => Math.max(0, vi.indexOf(el as HTMLImageElement)) * T.photos.apart);
  de.classList.remove("nophoto");
  await pause(vi.length * T.photos.apart + T.photos.after);
  // 4. Text: each bar gives way to its words, top to bottom.
  onStep(3);
  const vw = ordered(words);
  const per = Math.min(T.text.perWord, T.text.total / Math.max(1, vw.length));
  delay(words, (el) => Math.max(0, vw.indexOf(el)) * per);
  de.classList.remove("hide-t");
  de.classList.add("text");
  const shrunk = vw.length * per + BAR_MS;
  // Every bar has shrunk away: the words go back into their text now, so the handover repaints nothing.
  b.timers.push(setTimeout(b.unwrap, shrunk));
  await pause(Math.max(shrunk, vw.length * per + T.text.after));
  b.finish();
}
