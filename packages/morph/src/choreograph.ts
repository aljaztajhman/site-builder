/**
 * The choreography: every part's path, size, hinge and timing, written as CSS keyframes for the view
 * transition's pseudo-elements ("like a Transformer from a car to a robot"):
 * - unlock: the parts lift and spread apart a little, the page underneath goes dark;
 * - travel: each part runs on rails to its new place (the longer axis first), retracting where the new part is smaller;
 * - turn: at its new place the part flips over on a hinge to its new face, in step with its panel;
 * - extend: where the new part is bigger it telescopes out (clipped, never stretched, so text stays sharp);
 * - lock: everything snaps down at once with a small overshoot.
 * Pure: it reads boxes and document order, never the clock or the screen.
 */
import { boxy, type Pair, type Part, type Rect } from "./parts.ts";
import { EASE, type MorphPhases, type MorphTiming } from "./timing.ts";

/** Node.DOCUMENT_POSITION_FOLLOWING, spelled out so the module loads where there is no DOM (SSR, tests). */
const FOLLOWING = 4;
const centre = (r: Rect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

export interface Frame {
  /** Time on the morph's clock (ms). */
  t: number;
  css: string;
  /** Easing from this frame to the next. */
  ease?: string;
}

/** Keyframes from timed states; times in ms on the morph's clock. */
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

/** The dark screen with a faint dot grid that shows between the parts while they are apart (its colour: `--morph-screen`). */
export const DEFAULT_BACKDROP = "var(--morph-screen,#0f1a1c) radial-gradient(rgb(255 255 255/.07) 1px,transparent 1.3px) 0 0/14px 14px";

export interface ChoreographInput {
  pairs: readonly Pair[];
  exits: readonly Part[];
  enters: readonly Part[];
  /** The new screen's panels: a part turns over with the panel it sits on. */
  newPanels: readonly Part[];
  vw: number;
  vh: number;
  timing: MorphTiming;
  /** The transition name an old part carries (set on it before the transition starts). */
  nameOf: (old: Part) => string;
  /** Prefix for the names this plan makes up (new parts, keyframes). */
  prefix: string;
  /** CSS background behind the parts while apart; `false`: the old and new screens cross-fade instead. */
  backdrop: string | false;
}

export interface Plan {
  css: string;
  /** New elements and the transition names to give them once they are in. */
  newNames: [HTMLElement, string][];
  /** Length of the whole morph (ms). */
  total: number;
  /** New part key → the moment its new face shows (ms). */
  faceAt: Map<string, number>;
  /** The phases after tempo (ms). */
  T: MorphPhases;
}

interface Item extends Pair {
  r: string | undefined;
  name: string;
  tS: number;
  tL1: number;
  tL2: number;
  tF: number;
  tFm: number;
  tFe: number;
  tX: number;
}

/** Every part's path, size, hinge and timing, as CSS keyframes for the view transition. */
export function choreograph({ pairs, exits, enters, newPanels, vw, vh, timing, nameOf, prefix, backdrop }: ChoreographInput): Plan {
  const k = timing.tempo;
  const T = Object.fromEntries(Object.entries(timing.phases).map(([key, v]) => [key, v * k])) as unknown as MorphPhases;
  const LIFT = timing.lift;
  // Stacking while apart follows each screen's own paint order (a full-width photo stays under the text card on it).
  const order = (els: HTMLElement[]) =>
    new Map([...els].sort((a, b) => (a.compareDocumentPosition(b) & FOLLOWING ? -1 : 1)).map((el, i) => [el, 10 + i]));
  const zNew = order([...pairs.map((p) => p.n.el), ...enters.map((p) => p.el)]);
  const zOld = order(exits.map((p) => p.el));

  // A part's region: the last panel (in recipe order) its centre is on.
  const regionOf = (rect: Rect) => {
    const c = centre(rect);
    let r: string | undefined;
    for (const pl of newPanels) {
      const b = pl.rect;
      if (c.x >= b.left && c.x <= b.left + b.width && c.y >= b.top && c.y <= b.top + b.height) r = pl.region ?? pl.key;
    }
    return r;
  };
  // Parts spread out from the middle of the screen while apart (an exploded view); panels don't.
  const spread = (p: Part, rect: Rect) => {
    if (p.kind === "panel") return { x: 0, y: 0 };
    const c = centre(rect);
    const dx = c.x - vw / 2;
    const dy = c.y - vh / 2;
    const d = Math.hypot(dx, dy) || 1;
    const m = Math.min(timing.spread, d * 0.045);
    return { x: (dx / d) * m, y: (dy / d) * m };
  };

  // Schedule: one wave of parts from the top of the new screen down; each part turns as it arrives.
  const byTop = (a: Rect, b: Rect) => a.top - b.top || a.left - b.left;
  const items: Item[] = pairs.map((p) => ({ ...p, r: p.o.kind === "panel" ? (p.n.region ?? p.n.key) : regionOf(p.n.rect), name: nameOf(p.o), tS: 0, tL1: 0, tL2: 0, tF: 0, tFm: 0, tFe: 0, tX: 0 }));
  items.sort((a, b) => byTop(a.n.rect, b.n.rect) || (a.o.kind === "panel" ? -1 : 1));
  items.forEach((it, i) => {
    it.tS = T.unlock + i * T.stagger;
    it.tL1 = it.tS + T.leg;
    it.tL2 = it.tL1 + T.leg;
    it.tF = it.tL2;
  });
  // A panel turns over in the middle of its parts' turns, so its colour and theirs change together.
  for (const pl of items.filter((it) => it.o.kind === "panel")) {
    const turns = items.filter((it) => it.o.kind !== "panel" && it.r === pl.r).map((it) => it.tF).sort((a, b) => a - b);
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
::view-transition-old(*),::view-transition-new(*){mix-blend-mode:normal;inline-size:auto;block-size:auto;animation:none}
::view-transition-image-pair(*){overflow:clip;overflow-clip-margin:6px;isolation:auto}`;
  css +=
    backdrop === false
      ? `
::view-transition-old(root){animation:${prefix}-root-out ${TOTAL}ms ${EASE.out} both}
::view-transition-new(root){animation:${prefix}-root-in ${TOTAL}ms ${EASE.out} both}`
      : `
::view-transition{background:${backdrop}}
::view-transition-old(root){animation:${prefix}-root-out ${T.unlock}ms ${EASE.out} both}
::view-transition-new(root){animation:${prefix}-root-in ${T.lock}ms ${LOCK}ms ${EASE.out} both}`;
  css += `
@keyframes ${prefix}-root-out{to{opacity:0}}
@keyframes ${prefix}-root-in{from{opacity:0}}`;

  const groupCss = (x: number, y: number, w: number, h: number) => `transform:translate(${x.toFixed(1)}px,${y.toFixed(1)}px);width:${w.toFixed(1)}px;height:${h.toFixed(1)}px`;
  // 3D only while a part turns over: a 3D layer is rasterised soft, so outside the turn the part stays flat and sharp.
  const pairCss = (p: Part, s: number, o: { z?: number; turn?: number | null; axis?: "X" | "Y"; per?: number; lifted?: boolean; light?: number }) => {
    const { z = 0, turn = null, axis = "X", per = 900, lifted = false, light = 1 } = o;
    const shadow = boxy(p) ? `${lifted ? "drop-shadow(0 10px 14px rgb(0 0 0/.42))" : "drop-shadow(0 0 0 rgb(0 0 0/0))"} ` : "";
    const tf = turn === null ? `rotate(${z}deg) scale(${s})` : `perspective(${per}px) rotate(${z}deg) rotate${axis}(${turn}deg) scale(${s})`;
    return `transform:${tf};filter:${shadow}brightness(${light})`;
  };
  const opacity = (group: string, which: "old" | "new", frames: [number, number][], total: number) => {
    const name = `${group}-${which[0]}`;
    return `${keyframes(name, frames.map(([t, o]) => ({ t, css: `opacity:${o}` })), total)}\n::view-transition-${which}(${group}){animation:${name} ${total}ms linear both}`;
  };

  const newNames: [HTMLElement, string][] = [];
  const faceAt = new Map<string, number>();

  items.forEach((it, i) => {
    const name = it.name;
    newNames.push([it.n.el, name]);
    faceAt.set(it.n.key, it.tFm);
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
    const axis = it.o.kind === "panel" || b.width > b.height * 2.2 ? "X" : "Y";
    const dir = i % 2 ? -1 : 1;
    const per = Math.max(900, 2.2 * Math.max(wT, hT));
    const tilt = Math.max(-3, Math.min(3, (b.left - a.left) / 60)) * (it.o.kind === "panel" ? 0 : 1);
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
    css += `\n${opacity(name, "old", [[0, 1], [it.tFm, 1], [it.tFm + 0.5, 0], [TOTAL, 0]], TOTAL)}`;
    css += `\n${opacity(name, "new", [[0, 0], [it.tFm, 0], [it.tFm + 0.5, 1], [TOTAL, 1]], TOTAL)}`;
  });

  const nearest = (from: { x: number; y: number }, side: "o" | "n") => {
    let best: Item | null = null;
    let bd = Infinity;
    for (const it of items) {
      if (it.o.kind === "panel") continue;
      const c = centre(it[side].rect);
      const d = Math.hypot(c.x - from.x, c.y - from.y);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  };

  // Parts the new screen doesn't need retract into the nearest part's new place; panels drop out of view.
  outs.forEach(({ p, tS, tE }, i) => {
    const name = nameOf(p);
    const a = p.rect;
    const e0 = spread(p, a);
    const into = p.kind === "panel" ? null : nearest(centre(a), "n");
    const t = into ? centre(into.n.rect) : { x: a.left + a.width / 2, y: vh + a.height };
    const endW = p.kind === "panel" ? a.width : 6;
    const endH = p.kind === "panel" ? a.height : 6;
    const end = groupCss(t.x - endW / 2, p.kind === "panel" ? t.y : t.y - endH / 2, endW, endH);
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
::view-transition-group(${name}){z-index:${p.kind === "panel" ? 5 : 100 + (zOld.get(p.el) ?? 0)};animation:${name}-g ${TOTAL}ms linear both}
::view-transition-image-pair(${name}){animation:${name}-p ${TOTAL}ms linear both}`;
    css += `\n${opacity(name, "old", [[0, 1], [tE - 60 * k, 1], [tE, 0], [TOTAL, 0]], TOTAL)}`;
  });

  // Parts the new screen adds unfold out of the nearest part's old place; panels rise from below.
  ins.forEach(({ p, tS, tE }, i) => {
    const name = `${prefix}-in-${i}`;
    newNames.push([p.el, name]);
    faceAt.set(p.key, tS);
    const b = p.rect;
    const e1 = spread(p, b);
    const from = p.kind === "panel" ? null : nearest(centre(b), "o");
    const s = from ? centre(from.o.rect) : { x: b.left + b.width / 2, y: vh + b.height };
    const w0 = p.kind === "panel" ? b.width : 6;
    const h0 = p.kind === "panel" ? b.height : 6;
    const s0 = groupCss(s.x - w0 / 2, p.kind === "panel" ? s.y : s.y - h0 / 2, w0, h0);
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
    css += `\n${opacity(name, "new", [[0, 0], [tS, 0], [tS + 0.5, 1], [TOTAL, 1]], TOTAL)}`;
  });

  return { css, newNames, total: TOTAL, faceAt, T };
}
