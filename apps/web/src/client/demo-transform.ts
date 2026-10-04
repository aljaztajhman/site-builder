/**
 * The transformation from one trade's site to the next, "like a Transformer from a car to a robot": each
 * visible part of the old site becomes the matching part of the new one.
 * - unlock: the parts lift and spread apart a little, the page underneath goes dark;
 * - travel: each part runs on rails to its new place (the longer axis first), retracting where the new part is smaller;
 * - turn: at its new place the part flips over on a hinge to its new face, in step with its section's panel;
 * - extend: where the new part is bigger it telescopes out (clipped, never stretched, so text stays sharp);
 * - lock: everything snaps down at once with a small overshoot.
 * Engine: a same-document view transition inside the frame; every part is a named group whose path, size,
 * hinge and timing are computed from both layouts (the new site is laid out first in a hidden frame).
 */
import { DEMO } from "./demo-timing.ts";
import { boxy, fillPanels, match, parts, visible, type Pair, type Part, type Rect } from "./demo-parts.ts";

const EASE = {
  out: "cubic-bezier(.2,.8,.2,1)",
  rail: "cubic-bezier(.8,0,.2,1)",
  turnIn: "cubic-bezier(.55,0,1,.45)",
  turnOut: "cubic-bezier(.15,.85,.35,1.2)",
  extend: "cubic-bezier(.65,0,.2,1.12)",
  snap: "cubic-bezier(.35,0,.6,1)",
  settle: "cubic-bezier(.2,.9,.3,1)",
} as const;

const REGION: Record<string, number> = { header: 0, hero: 1, card: 1, s2: 2, s3: 3, s4: 4, s5: 5 };
const centre = (r: Rect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

interface Frame {
  t: number;
  css: string;
  ease?: string;
}

/** Keyframes from timed states; times in ms on the switch's clock. */
export function keyframes(name: string, frames: readonly Frame[], total: number): string {
  let out = `@keyframes ${name}{`;
  let last = -1;
  for (const f of frames) {
    // Rounded first, then kept strictly increasing: two equal percentages merge into one keyframe (and a
    // face swap merged that way becomes a crossfade).
    let pct = Math.round(Math.min(100, (f.t / total) * 100) * 1e4) / 1e4;
    if (pct <= last) pct = Math.round((last + 0.001) * 1e4) / 1e4;
    last = pct;
    out += `${pct.toFixed(4)}%{${f.css}${f.ease ? `;animation-timing-function:${f.ease}` : ""}}`;
  }
  return `${out}}`;
}

interface Item extends Pair {
  r: number;
  name: string;
  tS: number;
  tL1: number;
  tL2: number;
  tF: number;
  tFm: number;
  tFe: number;
  tX: number;
}

export interface Plan {
  css: string;
  /** Old elements and their transition names. */
  names: [HTMLElement, string][];
  /** New part key -> transition name, set on the new page once it is in. */
  newNames: Map<string, string>;
  total: number;
  h1: Item | null;
  T: Record<keyof typeof DEMO.transform, number>;
}

interface Input {
  pairs: Pair[];
  exits: Part[];
  enters: Part[];
  newPlates: Part[];
  vw: number;
  vh: number;
  /** Tempo: the timings are multiplied by it. */
  k: number;
}

/** Every part's path, size, hinge and timing, as CSS keyframes for the view transition. */
export function choreograph({ pairs, exits, enters, newPlates, vw, vh, k }: Input): Plan {
  const T = Object.fromEntries(Object.entries(DEMO.transform).map(([key, v]) => [key, v * k])) as Plan["T"];
  const LIFT = DEMO.lift;
  // Stacking while apart follows each page's own paint order (a full-width photo stays under the text card on it).
  const order = (els: HTMLElement[]) =>
    new Map([...els].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)).map((el, i) => [el, 10 + i]));
  const zNew = order([...pairs.map((p) => p.n.el), ...enters.map((p) => p.el)]);
  const zOld = order(exits.map((p) => p.el));

  const regionOf = (plates: Part[], rect: Rect) => {
    const c = centre(rect);
    let r = 2;
    for (const pl of plates) {
      const b = pl.rect;
      if (c.x >= b.left && c.x <= b.left + b.width && c.y >= b.top && c.y <= b.top + b.height) r = REGION[pl.key] ?? r;
    }
    return r;
  };
  // Parts spread out from the middle of the screen while apart (an exploded view); panels don't.
  const spread = (p: Part, rect: Rect) => {
    if (p.kind === "plate") return { x: 0, y: 0 };
    const c = centre(rect);
    const dx = c.x - vw / 2;
    const dy = c.y - vh / 2;
    const d = Math.hypot(dx, dy) || 1;
    const m = Math.min(DEMO.spread, d * 0.045);
    return { x: (dx / d) * m, y: (dy / d) * m };
  };

  // Schedule: one wave of parts from the top of the new page down; each part turns as it arrives.
  const byTop = (a: Rect, b: Rect) => a.top - b.top || a.left - b.left;
  const items: Item[] = pairs.map((p) => ({ ...p, r: p.o.kind === "plate" ? (REGION[p.n.key] ?? 2) : regionOf(newPlates, p.n.rect), name: "", tS: 0, tL1: 0, tL2: 0, tF: 0, tFm: 0, tFe: 0, tX: 0 }));
  items.sort((a, b) => byTop(a.n.rect, b.n.rect) || (a.o.kind === "plate" ? -1 : 1));
  items.forEach((it, i) => {
    it.tS = T.unlock + i * T.stagger;
    it.tL1 = it.tS + T.leg;
    it.tL2 = it.tL1 + T.leg;
    it.tF = it.tL2;
  });
  // A section's panel turns over in the middle of its parts' turns, so its colour and theirs change together.
  for (const pl of items.filter((it) => it.o.kind === "plate")) {
    const turns = items.filter((it) => it.o.kind !== "plate" && it.r === pl.r).map((it) => it.tF).sort((a, b) => a - b);
    if (turns.length) pl.tF = Math.max(pl.tL2, turns[Math.floor(turns.length / 2)]!);
  }
  for (const it of items) {
    it.tFm = it.tF + T.turn / 2;
    it.tFe = it.tF + T.turn;
    it.tX = it.tFe + T.extend;
  }
  // Leftover parts leave early to make room; new ones unfold as the wave reaches their place.
  const outs = [...exits].sort((a, b) => byTop(a.rect, b.rect)).map((p, j) => {
    const tS = T.unlock + j * T.stagger * 0.6;
    return { p, tS, tE: tS + 2 * T.leg };
  });
  const ins = enters.map((p) => {
    const reached = items.filter((it) => it.n.rect.top <= p.rect.top).length;
    const tS = T.unlock + reached * T.stagger + T.leg;
    return { p, tS, tE: tS + 2 * T.leg + T.extend };
  });
  const LOCK = Math.max(0, ...items.map((i) => i.tX), ...outs.map((o) => o.tE), ...ins.map((i) => i.tE)) + 40 * k;
  const TOTAL = LOCK + T.lock;
  const LOCK_PEAK = LOCK + T.lock * 0.45;

  let css = `
::view-transition{background:#191714 radial-gradient(rgb(255 255 255/.07) 1px,transparent 1.3px) 0 0/14px 14px}
::view-transition-old(*),::view-transition-new(*){mix-blend-mode:normal;inline-size:auto;block-size:auto;animation:none}
::view-transition-image-pair(*){overflow:clip;overflow-clip-margin:6px;isolation:auto}
::view-transition-old(root){animation:rig-root-out ${T.unlock}ms ${EASE.out} both}
::view-transition-new(root){animation:rig-root-in ${T.lock}ms ${LOCK}ms ${EASE.out} both}
@keyframes rig-root-out{to{opacity:0}}
@keyframes rig-root-in{from{opacity:0}}`;

  const groupCss = (x: number, y: number, w: number, h: number) => `transform:translate(${x.toFixed(1)}px,${y.toFixed(1)}px);width:${w.toFixed(1)}px;height:${h.toFixed(1)}px`;
  // 3D only while a part turns over: a 3D layer is rasterised soft, so outside the turn the part stays flat and sharp.
  const pairCss = (p: Part, s: number, o: { z?: number; turn?: number | null; axis?: "X" | "Y"; per?: number; lifted?: boolean; light?: number }) => {
    const { z = 0, turn = null, axis = "X", per = 900, lifted = false, light = 1 } = o;
    const shadow = boxy(p) ? `${lifted ? "drop-shadow(0 10px 14px rgb(0 0 0/.42))" : "drop-shadow(0 0 0 rgb(0 0 0/0))"} ` : "";
    const tf = turn === null ? `rotate(${z}deg) scale(${s})` : `perspective(${per}px) rotate(${z}deg) rotate${axis}(${turn}deg) scale(${s})`;
    return `transform:${tf};filter:${shadow}brightness(${light})`;
  };
  const opacity = (name: string, which: "old" | "new", frames: [number, number][], total: number) =>
    `${keyframes(name, frames.map(([t, o]) => ({ t, css: `opacity:${o}` })), total)}\n::view-transition-${which}(${name.replace(/-(o|n)$/, "")}){animation:${name} ${total}ms linear both}`;

  const names: [HTMLElement, string][] = [];
  const newNames = new Map<string, string>();
  let h1: Item | null = null;

  items.forEach((it, i) => {
    const name = `rig-${i}`;
    it.name = name;
    names.push([it.o.el, name]);
    newNames.set(it.n.key, name);
    if (it.n.key === "h1") h1 = it;
    const a = it.o.rect;
    const b = it.n.rect;
    const e0 = spread(it.o, a);
    const e1 = spread(it.n, b);
    // Rails: the longer axis first. Where the new part is smaller it retracts on the way; bigger, it extends after the turn.
    const hFirst = Math.abs(b.left - a.left) >= Math.abs(b.top - a.top);
    const mid = hFirst ? { x: b.left + e0.x, y: a.top + e0.y } : { x: a.left + e0.x, y: b.top + e0.y };
    const wT = Math.min(a.width, b.width);
    const hT = Math.min(a.height, b.height);
    css += `\n${keyframes(`${name}-g`, [
      { t: 0, css: groupCss(a.left, a.top, a.width, a.height), ease: EASE.out },
      { t: T.unlock, css: groupCss(a.left + e0.x, a.top + e0.y, a.width, a.height) },
      { t: it.tS, css: groupCss(a.left + e0.x, a.top + e0.y, a.width, a.height), ease: EASE.rail },
      { t: it.tL1, css: groupCss(mid.x, mid.y, (a.width + wT) / 2, (a.height + hT) / 2), ease: EASE.rail },
      { t: it.tL2, css: groupCss(b.left + e1.x, b.top + e1.y, wT, hT) },
      { t: it.tFe, css: groupCss(b.left + e1.x, b.top + e1.y, wT, hT), ease: EASE.extend },
      { t: it.tX, css: groupCss(b.left + e1.x, b.top + e1.y, b.width, b.height) },
      { t: LOCK, css: groupCss(b.left + e1.x, b.top + e1.y, b.width, b.height), ease: EASE.snap },
      { t: TOTAL, css: groupCss(b.left, b.top, b.width, b.height) },
    ], TOTAL)}`;
    // Hinge: wide parts and panels over the top edge, the rest on their side; alternate directions.
    const axis = it.o.kind === "plate" || b.width > b.height * 2.2 ? "X" : "Y";
    const dir = i % 2 ? -1 : 1;
    const per = Math.max(900, 2.2 * Math.max(wT, hT));
    const tilt = Math.max(-3, Math.min(3, (b.left - a.left) / 60)) * (it.o.kind === "plate" ? 0 : 1);
    const P = (s: number, o: Parameters<typeof pairCss>[2]) => pairCss(it.o, s, { axis, per, ...o });
    css += `\n${keyframes(`${name}-p`, [
      { t: 0, css: P(1, {}), ease: EASE.out },
      { t: T.unlock, css: P(LIFT, { lifted: true }) },
      { t: it.tS, css: P(LIFT, { lifted: true }), ease: EASE.rail },
      { t: it.tL1, css: P(LIFT, { lifted: true, z: tilt }), ease: EASE.rail },
      { t: it.tL2, css: P(LIFT, { lifted: true }) },
      { t: it.tF - 0.5, css: P(LIFT, { lifted: true }) },
      { t: it.tF, css: P(LIFT, { lifted: true, turn: 0 }), ease: EASE.turnIn },
      { t: it.tFm, css: P(LIFT, { lifted: true, turn: 90 * dir }) },
      { t: it.tFm + 0.5, css: P(LIFT, { lifted: true, turn: -90 * dir }), ease: EASE.turnOut },
      { t: it.tFe, css: P(LIFT, { lifted: true, turn: 0 }) },
      { t: it.tFe + 0.5, css: P(LIFT, { lifted: true }) },
      { t: LOCK, css: P(LIFT, { lifted: true }), ease: EASE.snap },
      { t: LOCK_PEAK, css: P(1.018, { light: 1.12 }), ease: EASE.settle },
      { t: TOTAL, css: P(1, {}) },
    ], TOTAL)}`;
    css += `
::view-transition-group(${name}){z-index:${zNew.get(it.n.el)};animation:${name}-g ${TOTAL}ms linear both}
::view-transition-image-pair(${name}){animation:${name}-p ${TOTAL}ms linear both}`;
    css += `\n${opacity(`${name}-o`, "old", [[0, 1], [it.tFm, 1], [it.tFm + 0.5, 0], [TOTAL, 0]], TOTAL)}`;
    css += `\n${opacity(`${name}-n`, "new", [[0, 0], [it.tFm, 0], [it.tFm + 0.5, 1], [TOTAL, 1]], TOTAL)}`;
  });

  const nearest = (from: { x: number; y: number }, side: "o" | "n") => {
    let best: Item | null = null;
    let bd = Infinity;
    for (const it of items) {
      if (it.o.kind === "plate") continue;
      const c = centre(it[side].rect);
      const d = Math.hypot(c.x - from.x, c.y - from.y);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  };

  // Parts the new site doesn't need retract into the nearest part's new place; panels drop out of view.
  outs.forEach(({ p, tS, tE }, i) => {
    const name = `rig-out-${i}`;
    names.push([p.el, name]);
    const a = p.rect;
    const e0 = spread(p, a);
    const into = p.kind === "plate" ? null : nearest(centre(a), "n");
    const t = into ? centre(into.n.rect) : { x: a.left + a.width / 2, y: vh + a.height };
    const endW = p.kind === "plate" ? a.width : 6;
    const endH = p.kind === "plate" ? a.height : 6;
    const end = groupCss(t.x - endW / 2, p.kind === "plate" ? t.y : t.y - endH / 2, endW, endH);
    css += `\n${keyframes(`${name}-g`, [
      { t: 0, css: groupCss(a.left, a.top, a.width, a.height), ease: EASE.out },
      { t: T.unlock, css: groupCss(a.left + e0.x, a.top + e0.y, a.width, a.height) },
      { t: tS, css: groupCss(a.left + e0.x, a.top + e0.y, a.width, a.height), ease: EASE.rail },
      { t: tE, css: end },
      { t: TOTAL, css: end },
    ], TOTAL)}`;
    const z = i % 2 ? 25 : -25;
    css += `\n${keyframes(`${name}-p`, [
      { t: 0, css: pairCss(p, 1, {}), ease: EASE.out },
      { t: T.unlock, css: pairCss(p, LIFT, { lifted: true }) },
      { t: tS, css: pairCss(p, LIFT, { lifted: true }), ease: EASE.turnIn },
      { t: tE, css: pairCss(p, LIFT, { lifted: true, z }) },
      { t: TOTAL, css: pairCss(p, LIFT, { lifted: true, z }) },
    ], TOTAL)}`;
    css += `
::view-transition-group(${name}){z-index:${p.kind === "plate" ? 5 : 100 + (zOld.get(p.el) ?? 0)};animation:${name}-g ${TOTAL}ms linear both}
::view-transition-image-pair(${name}){animation:${name}-p ${TOTAL}ms linear both}`;
    css += `\n${opacity(`${name}-o`, "old", [[0, 1], [tE - 60 * k, 1], [tE, 0], [TOTAL, 0]], TOTAL)}`;
  });

  // Parts the new site adds unfold out of the nearest part's old place; panels rise from below.
  ins.forEach(({ p, tS, tE }, i) => {
    const name = `rig-in-${i}`;
    newNames.set(p.key, name);
    const b = p.rect;
    const e1 = spread(p, b);
    const from = p.kind === "plate" ? null : nearest(centre(b), "o");
    const s = from ? centre(from.o.rect) : { x: b.left + b.width / 2, y: vh + b.height };
    const w0 = p.kind === "plate" ? b.width : 6;
    const h0 = p.kind === "plate" ? b.height : 6;
    const s0 = groupCss(s.x - w0 / 2, p.kind === "plate" ? s.y : s.y - h0 / 2, w0, h0);
    css += `\n${keyframes(`${name}-g`, [
      { t: 0, css: s0 },
      { t: tS, css: s0, ease: EASE.extend },
      { t: tE, css: groupCss(b.left + e1.x, b.top + e1.y, b.width, b.height) },
      { t: LOCK, css: groupCss(b.left + e1.x, b.top + e1.y, b.width, b.height), ease: EASE.snap },
      { t: TOTAL, css: groupCss(b.left, b.top, b.width, b.height) },
    ], TOTAL)}`;
    const z = i % 2 ? -20 : 20;
    css += `\n${keyframes(`${name}-p`, [
      { t: 0, css: pairCss(p, LIFT, { lifted: true, z }) },
      { t: tS, css: pairCss(p, LIFT, { lifted: true, z }), ease: EASE.extend },
      { t: tE, css: pairCss(p, LIFT, { lifted: true }) },
      { t: LOCK, css: pairCss(p, LIFT, { lifted: true }), ease: EASE.snap },
      { t: LOCK_PEAK, css: pairCss(p, 1.018, { light: 1.12 }), ease: EASE.settle },
      { t: TOTAL, css: pairCss(p, 1, {}) },
    ], TOTAL)}`;
    css += `
::view-transition-group(${name}){z-index:${zNew.get(p.el)};animation:${name}-g ${TOTAL}ms linear both}
::view-transition-image-pair(${name}){animation:${name}-p ${TOTAL}ms linear both}`;
    css += `\n${opacity(`${name}-n`, "new", [[0, 0], [tS, 0], [tS + 0.5, 1], [TOTAL, 1]], TOTAL)}`;
  });

  return { css, names, newNames, total: TOTAL, h1, T };
}

/** The headline's letters shuffle into the new words, left to right (the real, live text). Returns the undo. */
export function decode(el: HTMLElement, start: number, dur: number): () => void {
  const doc = el.ownerDocument;
  const win = doc.defaultView!;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: { n: Text; text: string }[] = [];
  while (walker.nextNode()) {
    const n = walker.currentNode as Text;
    nodes.push({ n, text: n.nodeValue ?? "" });
  }
  const pool = nodes.map((x) => x.text).join("").replace(/\s/g, "") || "abc";
  const total = nodes.reduce((s, x) => s + x.text.length, 0);
  let raf = 0;
  let t0 = 0;
  const frame = (now: number) => {
    if (!t0) t0 = now;
    const p = Math.min(1, (now - t0) / dur);
    let i = 0;
    for (const x of nodes) {
      let s = "";
      for (const ch of x.text) {
        s += /\s/.test(ch) || i / total < p ? ch : pool[Math.floor(Math.random() * pool.length)];
        i++;
      }
      x.n.nodeValue = s;
    }
    if (p < 1) raf = win.requestAnimationFrame(frame);
  };
  const timer = win.setTimeout(() => (raf = win.requestAnimationFrame(frame)), start);
  return () => {
    win.clearTimeout(timer);
    win.cancelAnimationFrame(raf);
    for (const x of nodes) x.n.nodeValue = x.text;
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const within = <T>(p: Promise<T>, ms: number): Promise<T | void> => Promise.race([p, sleep(ms)]);

/** Loads `src` into a frame and waits for it. */
export const loadInto = (frame: HTMLIFrameElement, src: string): Promise<void> =>
  new Promise((resolve) => {
    frame.addEventListener("load", () => resolve(), { once: true });
    frame.src = src;
  });

/** Fonts and the images in view decoded (both time-capped), so the layout read from it is final. */
export async function settle(doc: Document): Promise<void> {
  void doc.body.offsetHeight;
  await within(doc.fonts.ready, DEMO.waitFonts);
  const vh = doc.defaultView?.innerHeight ?? 0;
  const imgs = [...doc.images].filter((i) => {
    const r = i.getBoundingClientRect();
    return r.bottom > 0 && r.top < vh;
  });
  await within(Promise.all(imgs.map((i) => i.decode().catch(() => undefined))), DEMO.waitImages);
}

type VT = { ready: Promise<void>; finished: Promise<void>; skipTransition(): void };
type WithVT = Document & { startViewTransition?: (cb: () => Promise<void>) => VT };

export interface TransformOptions {
  /** Reduced motion: a cut. */
  cut: boolean;
  /** The running transition, so a second switch can skip it. */
  onTransition?: (vt: VT | null) => void;
}

/**
 * Turns the site in `main` into the one at `url`, piece by piece. The new site is laid out in `stage` (a
 * frame of the same size under it) first. Without view transitions, or with `cut`, the frame just loads it.
 */
export async function transformSite(main: HTMLIFrameElement, stage: HTMLIFrameElement, url: string, opts: TransformOptions): Promise<void> {
  const doc = main.contentDocument as WithVT | null;
  const win = main.contentWindow;
  if (!doc || !win || opts.cut || !doc.startViewTransition) {
    await loadInto(main, url);
    return;
  }
  const k = DEMO.tempo;
  // The new site, laid out in the hidden frame first: its parts' places, fonts and photos warm.
  const [html] = await Promise.all([fetch(url).then((r) => r.text()), loadInto(stage, url)]);
  const sdoc = stage.contentDocument!;
  sdoc.defaultView?.scrollTo(0, 0);
  await settle(sdoc);
  win.scrollTo(0, 0);

  const oldParts = parts(doc).filter(visible(doc));
  const newParts = parts(sdoc).filter(visible(sdoc));
  const { pairs, exits, enters } = match(oldParts, newParts);
  const plan = choreograph({ pairs, exits, enters, newPlates: newParts.filter((p) => p.kind === "plate"), vw: win.innerWidth, vh: win.innerHeight, k });

  const style = doc.createElement("style");
  style.dataset.rig = "";
  style.textContent = plan.css;
  doc.head.append(style);
  for (const [el, name] of plan.names) el.style.setProperty("view-transition-name", name);
  fillPanels(oldParts);

  let undoDecode = () => {};
  let unfill = () => {};
  const vt = doc.startViewTransition(async () => {
    win.history.replaceState(null, "", url);
    const nd = new DOMParser().parseFromString(html, "text/html");
    const de = doc.documentElement;
    for (const a of [...de.attributes]) de.removeAttribute(a.name);
    for (const a of nd.documentElement.attributes) de.setAttribute(a.name, a.value);
    // Identical head nodes stay (the shared stylesheet stays loaded); the rest is replaced.
    const want = new Set([...nd.head.children].map((n) => n.outerHTML));
    const have = new Set<string>();
    for (const n of [...doc.head.children]) {
      if (n === style) continue;
      if (want.has(n.outerHTML)) have.add(n.outerHTML);
      else n.remove();
    }
    const added: Element[] = [];
    for (const n of nd.head.children) if (!have.has(n.outerHTML)) added.push(doc.head.appendChild(doc.importNode(n, true)));
    doc.head.append(style);
    doc.body.replaceWith(doc.importNode(nd.body, true));
    // Imported scripts don't run: run the site's own (the phone menu folds itself up with one; the example's CSP allows it by hash).
    for (const old of doc.querySelectorAll("script:not([type='application/ld+json'])")) {
      const s = doc.createElement("script");
      for (const a of old.attributes) s.setAttribute(a.name, a.value);
      s.textContent = old.textContent;
      old.replaceWith(s);
    }
    const sheets = added.filter((n): n is HTMLLinkElement => n.matches("link[rel=stylesheet]"));
    await within(Promise.all(sheets.map((n) => new Promise<void>((r) => ((n.onload = () => r()), (n.onerror = () => r()))))), DEMO.waitStyles);
    const live = new Map(parts(doc).map((p) => [p.key, p]));
    for (const [key, name] of plan.newNames) live.get(key)?.el.style.setProperty("view-transition-name", name);
    unfill = fillPanels([...live.values()].filter((p) => plan.newNames.has(p.key)));
    await settle(doc);
    const h1 = live.get("h1");
    if (plan.h1 && h1) undoDecode = decode(h1.el, plan.h1.tFm, plan.T.turn / 2 + plan.T.extend + 220 * k);
  });
  opts.onTransition?.(vt);
  vt.ready.catch(() => undefined);
  try {
    await vt.finished;
  } catch {
    // Skipped (a newer switch) or aborted (the tab hidden): the swap still happened.
  } finally {
    undoDecode();
    unfill();
    style.remove();
    for (const el of doc.querySelectorAll<HTMLElement>("[style*=view-transition-name]")) el.style.removeProperty("view-transition-name");
    opts.onTransition?.(null);
  }
}
