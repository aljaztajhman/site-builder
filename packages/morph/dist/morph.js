/* @sb/morph: part-by-part screen morphs, a self-building page reveal and a text decode. No dependencies.
 * Generated from packages/morph/src by `pnpm --filter @sb/morph build`; don't edit. Guide: packages/morph/README.md. */

// src/parts.ts
var NO_RECT = { left: 0, top: 0, width: 0, height: 0 };
function findParts(root, recipe) {
  const out = [];
  const byKey = /* @__PURE__ */ new Map();
  const used = /* @__PURE__ */ new Set();
  const add = (rule, key, el) => {
    if (used.has(el)) return;
    used.add(el);
    byKey.set(key, el);
    const part = { key, el, kind: rule.kind ?? "part", rect: NO_RECT };
    if (part.kind === "panel") part.region = rule.region ?? key;
    if (rule.boxy !== void 0) part.boxy = rule.boxy;
    out.push(part);
  };
  const cap = (n) => typeof n === "number" ? n : Infinity;
  for (const rule of recipe) {
    const scope = rule.within === void 0 ? root : byKey.get(rule.within);
    if (!scope) continue;
    if (rule.children) {
      const first = scope.querySelector(rule.select);
      if (first) [...first.children].slice(0, cap(rule.children)).forEach((el, i) => add(rule, `${rule.key}${i}`, el));
    } else if (rule.all) {
      [...scope.querySelectorAll(rule.select)].slice(0, cap(rule.all)).forEach((el, i) => add(rule, `${rule.key}${i}`, el));
    } else {
      const el = scope.querySelector(rule.select);
      if (el) add(rule, rule.key, el);
    }
  }
  return out;
}
function visible(doc) {
  const vh = doc.defaultView?.innerHeight ?? 0;
  return (p) => {
    const rects = p.el.getClientRects();
    if (rects.length !== 1) return false;
    const r = rects[0];
    if (r.width < 2 || r.height < 2) return false;
    p.rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    return r.bottom > 0 && r.top < vh;
  };
}
var CLEAR = "rgba(0, 0, 0, 0)";
function fillPanels(list) {
  const done = [];
  for (const p of list) {
    if (p.kind !== "panel") continue;
    const view = p.el.ownerDocument.defaultView;
    if (!view || view.getComputedStyle(p.el).backgroundColor !== CLEAR) continue;
    let colour = "#fff";
    for (let e = p.el.parentElement; e; e = e.parentElement) {
      const c = view.getComputedStyle(e).backgroundColor;
      if (c !== CLEAR && c !== "transparent") {
        colour = c;
        break;
      }
    }
    p.el.style.backgroundColor = colour;
    done.push(p.el);
  }
  return () => {
    for (const el of done) el.style.removeProperty("background-color");
  };
}
var sortOf = (p) => p.kind === "panel" ? "panel" : p.el.matches("picture, img, video, svg") || p.el.querySelector("picture, img, video") ? "media" : p.el.matches(".btn, button, a[role=button]") ? "control" : "text";
var boxy = (p) => p.boxy ?? (p.kind === "panel" || sortOf(p) !== "text" || p.el.matches("li"));
function match(oldParts, newParts) {
  const close = (a, b) => {
    const r = a.rect.width * a.rect.height / (b.rect.width * b.rect.height);
    return r < 5 && r > 1 / 5;
  };
  const byKey = new Map(newParts.map((p) => [p.key, p]));
  const pairs = [];
  const oldLeft = [];
  for (const o of oldParts) {
    const n = byKey.get(o.key);
    if (n && n.kind === o.kind) {
      pairs.push({ o, n });
      byKey.delete(o.key);
    } else oldLeft.push(o);
  }
  const order = (a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left;
  const newLeft = [...byKey.values()].sort(order);
  oldLeft.sort(order);
  const exits = [];
  for (const o of oldLeft) {
    const i = newLeft.findIndex((n) => sortOf(o) === sortOf(n) && close(o, n));
    if (i >= 0) pairs.push({ o, n: newLeft.splice(i, 1)[0] });
    else exits.push(o);
  }
  return { pairs, exits, enters: newLeft };
}

// src/timing.ts
var MORPH_TIMING = {
  phases: { unlock: 200, stagger: 48, leg: 210, turn: 280, extend: 240, lock: 260 },
  tempo: 1.5,
  lift: 0.955,
  spread: 22,
  waitFonts: 1200,
  waitImages: 1500,
  waitStyles: 1500,
  fade: 600
};
var BUILD_TIMING = {
  structure: { spread: 1e3, total: 1550 },
  colours: { apart: 220, after: 800 },
  photos: { apart: 230, after: 850 },
  text: { perWord: 45, total: 1300, after: 700 }
};
var EASE = {
  out: "cubic-bezier(.2,.8,.2,1)",
  rail: "cubic-bezier(.8,0,.2,1)",
  turnIn: "cubic-bezier(.55,0,1,.45)",
  turnOut: "cubic-bezier(.15,.85,.35,1.2)",
  extend: "cubic-bezier(.65,0,.2,1.12)",
  snap: "cubic-bezier(.35,0,.6,1)",
  settle: "cubic-bezier(.2,.9,.3,1)"
};
function morphTiming(over = {}) {
  return { ...MORPH_TIMING, ...over, phases: { ...MORPH_TIMING.phases, ...over.phases } };
}

// src/choreograph.ts
var FOLLOWING = 4;
var centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
function keyframes(name, frames, total) {
  let out = `@keyframes ${name}{`;
  let last = -1;
  for (const f of frames) {
    let pct = Math.round(Math.min(100, f.t / total * 100) * 1e4) / 1e4;
    if (pct <= last) pct = Math.round((last + 1e-3) * 1e4) / 1e4;
    last = pct;
    out += `${pct.toFixed(4)}%{${f.css}${f.ease ? `;animation-timing-function:${f.ease}` : ""}}`;
  }
  return `${out}}`;
}
var DEFAULT_BACKDROP = "var(--morph-screen,#0f1a1c) radial-gradient(rgb(255 255 255/.07) 1px,transparent 1.3px) 0 0/14px 14px";
function choreograph({ pairs, exits, enters, newPanels, vw, vh, timing, nameOf, prefix, backdrop }) {
  const k = timing.tempo;
  const T = Object.fromEntries(Object.entries(timing.phases).map(([key, v]) => [key, v * k]));
  const LIFT = timing.lift;
  const order = (els) => new Map([...els].sort((a, b) => a.compareDocumentPosition(b) & FOLLOWING ? -1 : 1).map((el, i) => [el, 10 + i]));
  const zNew = order([...pairs.map((p) => p.n.el), ...enters.map((p) => p.el)]);
  const zOld = order(exits.map((p) => p.el));
  const regionOf = (rect) => {
    const c = centre(rect);
    let r;
    for (const pl of newPanels) {
      const b = pl.rect;
      if (c.x >= b.left && c.x <= b.left + b.width && c.y >= b.top && c.y <= b.top + b.height) r = pl.region ?? pl.key;
    }
    return r;
  };
  const spread = (p, rect) => {
    if (p.kind === "panel") return { x: 0, y: 0 };
    const c = centre(rect);
    const dx = c.x - vw / 2;
    const dy = c.y - vh / 2;
    const d = Math.hypot(dx, dy) || 1;
    const m = Math.min(timing.spread, d * 0.045);
    return { x: dx / d * m, y: dy / d * m };
  };
  const byTop = (a, b) => a.top - b.top || a.left - b.left;
  const items = pairs.map((p) => ({ ...p, r: p.o.kind === "panel" ? p.n.region ?? p.n.key : regionOf(p.n.rect), name: nameOf(p.o), tS: 0, tL1: 0, tL2: 0, tF: 0, tFm: 0, tFe: 0, tX: 0 }));
  items.sort((a, b) => byTop(a.n.rect, b.n.rect) || (a.o.kind === "panel" ? -1 : 1));
  items.forEach((it, i) => {
    it.tS = T.unlock + i * T.stagger;
    it.tL1 = it.tS + T.leg;
    it.tL2 = it.tL1 + T.leg;
    it.tF = it.tL2;
  });
  for (const pl of items.filter((it) => it.o.kind === "panel")) {
    const turns = items.filter((it) => it.o.kind !== "panel" && it.r === pl.r).map((it) => it.tF).sort((a, b) => a - b);
    if (turns.length) pl.tF = Math.max(pl.tL2, turns[Math.floor(turns.length / 2)]);
  }
  for (const it of items) {
    it.tFm = it.tF + T.turn / 2;
    it.tFe = it.tF + T.turn;
    it.tX = it.tFe + T.extend;
  }
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
  css += backdrop === false ? `
::view-transition-old(root){animation:${prefix}-root-out ${TOTAL}ms ${EASE.out} both}
::view-transition-new(root){animation:${prefix}-root-in ${TOTAL}ms ${EASE.out} both}` : `
::view-transition{background:${backdrop}}
::view-transition-old(root){animation:${prefix}-root-out ${T.unlock}ms ${EASE.out} both}
::view-transition-new(root){animation:${prefix}-root-in ${T.lock}ms ${LOCK}ms ${EASE.out} both}`;
  css += `
@keyframes ${prefix}-root-out{to{opacity:0}}
@keyframes ${prefix}-root-in{from{opacity:0}}`;
  const groupCss = (x, y, w, h) => `transform:translate(${x.toFixed(1)}px,${y.toFixed(1)}px);width:${w.toFixed(1)}px;height:${h.toFixed(1)}px`;
  const pairCss = (p, s, o) => {
    const { z = 0, turn = null, axis = "X", per = 900, lifted = false, light = 1 } = o;
    const shadow = boxy(p) ? `${lifted ? "drop-shadow(0 10px 14px rgb(0 0 0/.42))" : "drop-shadow(0 0 0 rgb(0 0 0/0))"} ` : "";
    const tf = turn === null ? `rotate(${z}deg) scale(${s})` : `perspective(${per}px) rotate(${z}deg) rotate${axis}(${turn}deg) scale(${s})`;
    return `transform:${tf};filter:${shadow}brightness(${light})`;
  };
  const opacity = (group, which, frames, total) => {
    const name = `${group}-${which[0]}`;
    return `${keyframes(name, frames.map(([t, o]) => ({ t, css: `opacity:${o}` })), total)}
::view-transition-${which}(${group}){animation:${name} ${total}ms linear both}`;
  };
  const newNames = [];
  const faceAt = /* @__PURE__ */ new Map();
  items.forEach((it, i) => {
    const name = it.name;
    newNames.push([it.n.el, name]);
    faceAt.set(it.n.key, it.tFm);
    const a = it.o.rect;
    const b = it.n.rect;
    const e0 = spread(it.o, a);
    const e1 = spread(it.n, b);
    const hFirst = Math.abs(b.left - a.left) >= Math.abs(b.top - a.top);
    const mid = hFirst ? { x: b.left + e0.x, y: a.top + e0.y } : { x: a.left + e0.x, y: b.top + e0.y };
    const wT = Math.min(a.width, b.width);
    const hT = Math.min(a.height, b.height);
    css += `
${keyframes(`${name}-g`, [
      { t: 0, css: groupCss(a.left, a.top, a.width, a.height), ease: EASE.out },
      { t: T.unlock, css: groupCss(a.left + e0.x, a.top + e0.y, a.width, a.height) },
      { t: it.tS, css: groupCss(a.left + e0.x, a.top + e0.y, a.width, a.height), ease: EASE.rail },
      { t: it.tL1, css: groupCss(mid.x, mid.y, (a.width + wT) / 2, (a.height + hT) / 2), ease: EASE.rail },
      { t: it.tL2, css: groupCss(b.left + e1.x, b.top + e1.y, wT, hT) },
      { t: it.tFe, css: groupCss(b.left + e1.x, b.top + e1.y, wT, hT), ease: EASE.extend },
      { t: it.tX, css: groupCss(b.left + e1.x, b.top + e1.y, b.width, b.height) },
      { t: LOCK, css: groupCss(b.left + e1.x, b.top + e1.y, b.width, b.height), ease: EASE.snap },
      { t: TOTAL, css: groupCss(b.left, b.top, b.width, b.height) }
    ], TOTAL)}`;
    const axis = it.o.kind === "panel" || b.width > b.height * 2.2 ? "X" : "Y";
    const dir = i % 2 ? -1 : 1;
    const per = Math.max(900, 2.2 * Math.max(wT, hT));
    const tilt = Math.max(-3, Math.min(3, (b.left - a.left) / 60)) * (it.o.kind === "panel" ? 0 : 1);
    const P = (s, o) => pairCss(it.o, s, { axis, per, ...o });
    css += `
${keyframes(`${name}-p`, [
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
      { t: TOTAL, css: P(1, {}) }
    ], TOTAL)}`;
    css += `
::view-transition-group(${name}){z-index:${zNew.get(it.n.el)};animation:${name}-g ${TOTAL}ms linear both}
::view-transition-image-pair(${name}){animation:${name}-p ${TOTAL}ms linear both}`;
    css += `
${opacity(name, "old", [[0, 1], [it.tFm, 1], [it.tFm + 0.5, 0], [TOTAL, 0]], TOTAL)}`;
    css += `
${opacity(name, "new", [[0, 0], [it.tFm, 0], [it.tFm + 0.5, 1], [TOTAL, 1]], TOTAL)}`;
  });
  const nearest = (from, side) => {
    let best = null;
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
  outs.forEach(({ p, tS, tE }, i) => {
    const name = nameOf(p);
    const a = p.rect;
    const e0 = spread(p, a);
    const into = p.kind === "panel" ? null : nearest(centre(a), "n");
    const t = into ? centre(into.n.rect) : { x: a.left + a.width / 2, y: vh + a.height };
    const endW = p.kind === "panel" ? a.width : 6;
    const endH = p.kind === "panel" ? a.height : 6;
    const end = groupCss(t.x - endW / 2, p.kind === "panel" ? t.y : t.y - endH / 2, endW, endH);
    css += `
${keyframes(`${name}-g`, [
      { t: 0, css: groupCss(a.left, a.top, a.width, a.height), ease: EASE.out },
      { t: T.unlock, css: groupCss(a.left + e0.x, a.top + e0.y, a.width, a.height) },
      { t: tS, css: groupCss(a.left + e0.x, a.top + e0.y, a.width, a.height), ease: EASE.rail },
      { t: tE, css: end },
      { t: TOTAL, css: end }
    ], TOTAL)}`;
    const z = i % 2 ? 25 : -25;
    css += `
${keyframes(`${name}-p`, [
      { t: 0, css: pairCss(p, 1, {}), ease: EASE.out },
      { t: T.unlock, css: pairCss(p, LIFT, { lifted: true }) },
      { t: tS, css: pairCss(p, LIFT, { lifted: true }), ease: EASE.turnIn },
      { t: tE, css: pairCss(p, LIFT, { lifted: true, z }) },
      { t: TOTAL, css: pairCss(p, LIFT, { lifted: true, z }) }
    ], TOTAL)}`;
    css += `
::view-transition-group(${name}){z-index:${p.kind === "panel" ? 5 : 100 + (zOld.get(p.el) ?? 0)};animation:${name}-g ${TOTAL}ms linear both}
::view-transition-image-pair(${name}){animation:${name}-p ${TOTAL}ms linear both}`;
    css += `
${opacity(name, "old", [[0, 1], [tE - 60 * k, 1], [tE, 0], [TOTAL, 0]], TOTAL)}`;
  });
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
    css += `
${keyframes(`${name}-g`, [
      { t: 0, css: s0 },
      { t: tS, css: s0, ease: EASE.extend },
      { t: tE, css: groupCss(b.left + e1.x, b.top + e1.y, b.width, b.height) },
      { t: LOCK, css: groupCss(b.left + e1.x, b.top + e1.y, b.width, b.height), ease: EASE.snap },
      { t: TOTAL, css: groupCss(b.left, b.top, b.width, b.height) }
    ], TOTAL)}`;
    const z = i % 2 ? -20 : 20;
    css += `
${keyframes(`${name}-p`, [
      { t: 0, css: pairCss(p, LIFT, { lifted: true, z }) },
      { t: tS, css: pairCss(p, LIFT, { lifted: true, z }), ease: EASE.extend },
      { t: tE, css: pairCss(p, LIFT, { lifted: true }) },
      { t: LOCK, css: pairCss(p, LIFT, { lifted: true }), ease: EASE.snap },
      { t: LOCK_PEAK, css: pairCss(p, 1.018, { light: 1.12 }), ease: EASE.settle },
      { t: TOTAL, css: pairCss(p, 1, {}) }
    ], TOTAL)}`;
    css += `
::view-transition-group(${name}){z-index:${zNew.get(p.el)};animation:${name}-g ${TOTAL}ms linear both}
::view-transition-image-pair(${name}){animation:${name}-p ${TOTAL}ms linear both}`;
    css += `
${opacity(name, "new", [[0, 0], [tS, 0], [tS + 0.5, 1], [TOTAL, 1]], TOTAL)}`;
  });
  return { css, newNames, total: TOTAL, faceAt, T };
}

// src/decode.ts
function decode(el, start, dur) {
  const doc = el.ownerDocument;
  const win = doc.defaultView;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    nodes.push({ n, text: n.nodeValue ?? "" });
  }
  const pool = nodes.map((x) => x.text).join("").replace(/\s/g, "") || "abc";
  const total = nodes.reduce((s, x) => s + x.text.length, 0);
  let raf = 0;
  let t0 = 0;
  const frame = (now) => {
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
  const timer = win.setTimeout(() => raf = win.requestAnimationFrame(frame), start);
  return () => {
    win.clearTimeout(timer);
    win.cancelAnimationFrame(raf);
    for (const x of nodes) x.n.nodeValue = x.text;
  };
}

// src/dom.ts
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var within = (p, ms) => Promise.race([p, sleep(ms)]);
async function settle(doc, caps) {
  void doc.body.offsetHeight;
  await within(doc.fonts.ready, caps.waitFonts);
  const vh = doc.defaultView?.innerHeight ?? 0;
  const imgs = [...doc.images].filter((i) => {
    const r = i.getBoundingClientRect();
    return r.bottom > 0 && r.top < vh;
  });
  await within(Promise.all(imgs.map((i) => i.decode().catch(() => void 0))), caps.waitImages);
}
var loadInto = (frame, src) => new Promise((resolve) => {
  frame.addEventListener("load", () => resolve(), { once: true });
  frame.src = src;
});
async function swapDocument(doc, html, opts) {
  const keep = new Set(opts.keep ?? []);
  const nd = new DOMParser().parseFromString(html, "text/html");
  const de = doc.documentElement;
  for (const a of [...de.attributes]) de.removeAttribute(a.name);
  for (const a of nd.documentElement.attributes) de.setAttribute(a.name, a.value);
  const want = new Set([...nd.head.children].map((n) => n.outerHTML));
  const have = /* @__PURE__ */ new Set();
  for (const n of [...doc.head.children]) {
    if (keep.has(n)) continue;
    if (want.has(n.outerHTML)) have.add(n.outerHTML);
    else n.remove();
  }
  const added = [];
  for (const n of nd.head.children) if (!have.has(n.outerHTML)) added.push(doc.head.appendChild(doc.importNode(n, true)));
  for (const n of keep) doc.head.append(n);
  doc.body.replaceWith(doc.importNode(nd.body, true));
  const fresh = [...doc.body.querySelectorAll("script"), ...added.filter((n) => n.matches("script"))];
  for (const old of fresh.filter((s) => s.getAttribute("type") !== "application/ld+json")) {
    const s = doc.createElement("script");
    for (const a of old.attributes) s.setAttribute(a.name, a.value);
    s.textContent = old.textContent;
    old.replaceWith(s);
  }
  const sheets = added.filter((n) => n.matches("link[rel=stylesheet]"));
  await within(Promise.all(sheets.map((n) => new Promise((r) => (n.onload = () => r(), n.onerror = () => r())))), opts.waitStyles);
}
var prefersCalm = (win = window) => win.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// src/morph.ts
async function morph(o) {
  const doc = o.doc ?? document;
  const win = doc.defaultView;
  const timing = morphTiming(o.timing);
  const recipe = o.parts;
  const find = typeof recipe === "function" ? recipe : (d) => findParts(d, recipe);
  if (!doc.startViewTransition) return void await o.update();
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
  const names = new Map(oldParts.map((p, i) => [p, `${prefix}-${i}`]));
  const named = [];
  for (const [p, n] of names) {
    p.el.style.setProperty("view-transition-name", n);
    named.push(p.el);
  }
  const unfillOld = fillPanels(oldParts);
  let unfillNew = () => {
  };
  let undoDecode = () => {
  };
  const vt = doc.startViewTransition(async () => {
    await o.update();
    for (const p of oldParts) p.el.style.removeProperty("view-transition-name");
    if (o.settle !== false) await settle(doc, timing);
    const newParts = find(doc).filter(visible(doc));
    const m = match(oldParts, newParts);
    const plan = choreograph({ ...m, newPanels: newParts.filter((p) => p.kind === "panel"), vw: win.innerWidth, vh: win.innerHeight, timing, nameOf: (p) => names.get(p), prefix, backdrop: o.backdrop ?? DEFAULT_BACKDROP });
    style.textContent = plan.css;
    doc.head.append(style);
    const moving = /* @__PURE__ */ new Set();
    for (const [el, n] of plan.newNames) {
      el.style.setProperty("view-transition-name", n);
      named.push(el);
      moving.add(el);
    }
    unfillNew = fillPanels(newParts.filter((p) => moving.has(p.el)));
    const focus = o.decode === void 0 ? void 0 : newParts.find((p) => p.key === o.decode);
    const at = o.decode === void 0 ? void 0 : plan.faceAt.get(o.decode);
    if (focus && at !== void 0) undoDecode = decode(focus.el, at, plan.T.turn / 2 + plan.T.extend + 220 * timing.tempo);
  });
  return run(vt, o, () => {
    undoDecode();
    unfillOld();
    unfillNew();
    style.remove();
    for (const el of named) el.style.removeProperty("view-transition-name");
  });
}
async function run(vt, o, cleanup) {
  o.onTransition?.(vt);
  vt.ready.catch(() => void 0);
  let failed;
  vt.updateCallbackDone.catch((e) => failed = e);
  try {
    await vt.finished;
  } catch {
  } finally {
    cleanup();
    o.onTransition?.(null);
  }
  if (failed !== void 0) throw failed;
}

// src/frame.ts
var sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
async function fadeFrame(main, stage, url, opts = {}) {
  const timing = morphTiming(opts.timing);
  await loadInto(stage, url);
  const sdoc = stage.contentDocument;
  if (sdoc) {
    sdoc.defaultView?.scrollTo(0, 0);
    await settle(sdoc, timing);
  }
  let skip = () => {
  };
  const skipped = new Promise((r) => skip = r);
  opts.onTransition?.({ skipTransition: () => skip() });
  try {
    main.style.transition = `opacity ${timing.fade}ms ease`;
    void main.offsetWidth;
    main.style.opacity = "0";
    await Promise.race([sleep2(timing.fade), skipped]);
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
async function morphFrame(main, stage, url, opts) {
  const doc = main.contentDocument;
  const win = main.contentWindow;
  const timing = morphTiming(opts.timing);
  if (!doc || !win || (opts.calm ?? prefersCalm()) || !doc.startViewTransition) return fadeFrame(main, stage, url, opts);
  const [html] = await Promise.all([fetch(url).then((r) => r.text()), loadInto(stage, url)]);
  const sdoc = stage.contentDocument;
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
    }
  });
}

// src/build.ts
var BAR_MS = 600;
var buildCss = (R, D) => `
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
var calmCss = (R, D) => `
@property --sk{syntax:"<color>";inherits:false;initial-value:transparent}
${R}.mb-calm ${D}{transition:color .5s var(--d,0ms),opacity .45s var(--d,0ms),filter .8s var(--d,0ms),--sk ${BAR_MS}ms var(--d,0ms) !important}
${R}.mb-calm.mb-still ${D}{transition:none !important}
${R}.mb-calm.mb-empty [data-mb-box]{transform:none}
${R}.mb-calm img,${R}.mb-calm.mb-nophoto img{clip-path:none}
${R}.mb-calm.mb-nophoto img{opacity:0}
${R}.mb-calm.mb-text mb-w{background-size:100% .55em;background-position:0 60%;--sk:transparent !important}`;
var CLASSES = ["mb-bld", "mb-still", "mb-mono", "mb-hide-t", "mb-empty", "mb-nophoto", "mb-text", "mb-calm"];
var withAlpha = (rgb, a) => {
  const m = rgb.match(/[\d.]+/g);
  return m && m.length >= 3 ? `rgb(${m[0]} ${m[1]} ${m[2]} / ${a})` : `rgb(128 128 128 / ${a})`;
};
function prepareBuild(target, opts = {}) {
  const { calm = false, panels: panelSel = "header, section, footer, [data-panel]", boxes: boxSel = "picture, button, .btn, [data-box]", barAlpha = 0.22 } = opts;
  const isDoc = target.nodeType === Node.DOCUMENT_NODE;
  const doc = isDoc ? target : target.ownerDocument;
  const whole = isDoc || target === doc.documentElement;
  const root = whole ? doc.documentElement : target;
  const scope = whole ? doc.body : root;
  const win = doc.defaultView;
  const walker = doc.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => n.nodeValue?.trim() && !n.parentElement?.closest("script, style, noscript, template") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const words = nodes.map((n) => {
    const w = doc.createElement("mb-w");
    n.replaceWith(w);
    w.append(n);
    return w;
  });
  for (const w of words) w.style.setProperty("--sk", withAlpha(win.getComputedStyle(w).color, barAlpha));
  const panels = [...scope.querySelectorAll(panelSel)];
  for (const p of panels) p.setAttribute("data-mb-panel", "");
  const boxes = [...scope.querySelectorAll(boxSel)];
  for (const x of boxes) x.setAttribute("data-mb-box", "");
  const imgs = [...scope.querySelectorAll("img")];
  const R = whole ? "html.mb-bld" : ".mb-bld";
  const D = whole ? "body *" : "*";
  const style = doc.createElement("style");
  style.textContent = calm ? buildCss(R, D) + calmCss(R, D) : buildCss(R, D);
  doc.head.append(style);
  root.classList.add("mb-bld", "mb-still", "mb-mono", "mb-hide-t", "mb-empty", "mb-nophoto", ...calm ? ["mb-calm"] : []);
  void doc.body.offsetHeight;
  root.classList.remove("mb-still");
  const timers = [];
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
async function runBuild(b, onStep = () => {
}, timing = BUILD_TIMING) {
  const { win, root, words, panels, boxes, imgs } = b;
  const T = timing;
  const vh = win.innerHeight;
  const top = (el) => el.getBoundingClientRect().top;
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < vh;
  };
  const ordered = (els) => els.filter(seen).sort((a, c) => top(a) - top(c) || a.getBoundingClientRect().left - c.getBoundingClientRect().left);
  const delay = (els, f) => {
    for (const el of els) el.style.setProperty("--d", `${Math.round(f(el))}ms`);
  };
  const pause = (ms) => new Promise((r) => b.timers.push(setTimeout(r, ms)));
  onStep(0);
  delay([...words, ...boxes], (el) => seen(el) ? Math.max(0, top(el)) / vh * T.structure.spread : T.structure.spread);
  root.classList.remove("mb-empty");
  await pause(T.structure.total);
  onStep(1);
  const vp = ordered(panels);
  delay(panels, (el) => Math.max(0, vp.indexOf(el)) * T.colours.apart);
  root.classList.remove("mb-mono");
  await pause(vp.length * T.colours.apart + T.colours.after);
  onStep(2);
  const vi = ordered(imgs);
  delay(imgs, (el) => Math.max(0, vi.indexOf(el)) * T.photos.apart);
  root.classList.remove("mb-nophoto");
  await pause(vi.length * T.photos.apart + T.photos.after);
  onStep(3);
  const vw = ordered(words);
  const per = Math.min(T.text.perWord, T.text.total / Math.max(1, vw.length));
  delay(words, (el) => Math.max(0, vw.indexOf(el)) * per);
  root.classList.remove("mb-hide-t");
  root.classList.add("mb-text");
  const shrunk = vw.length * per + BAR_MS;
  b.timers.push(setTimeout(b.unwrap, shrunk));
  await pause(Math.max(shrunk, vw.length * per + T.text.after));
  b.finish();
}
export {
  BUILD_TIMING,
  DEFAULT_BACKDROP,
  EASE,
  MORPH_TIMING,
  boxy,
  choreograph,
  decode,
  fadeFrame,
  fillPanels,
  findParts,
  keyframes,
  loadInto,
  match,
  morph,
  morphFrame,
  morphTiming,
  prefersCalm,
  prepareBuild,
  runBuild,
  settle,
  sortOf,
  swapDocument,
  visible,
  within
};
