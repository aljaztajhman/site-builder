/* global process, console */
// Style 2: a linocut of a round sourdough loaf (banneton rings, one curved score with its ear) on a board, wheat behind.
// One ink (a colour role) and the paper (background) cut out of it.
import { Art, srand, rr, f, poly, smooth, lens, dot, inside, ellipsePts, PREVIEW_DIR, DRAW_DIR } from "./lib.mjs";

const INK = process.argv[2] ?? "text";
const art = new Art(400, 400);
srand(11);

// --- 3D model: a boule (superellipse of revolution), orthographic view from 30° above.
const R = 172, H = 118, P = 2.05;
const CX = 228, CY = 238;
const E = (30 * Math.PI) / 180;
const SE = Math.sin(E), CE = Math.cos(E);
const scr = ([X, Y, Z]) => [CX + X, CY + Y * SE - Z * CE];
const zOf = (r) => H * Math.pow(Math.max(0, 1 - Math.pow(r / R, P)), 1 / P);
const V = [0, CE, SE];
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const LIGHT = norm([-0.6, 0.45, 0.7]);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function normal(r, th) {
  const z = zOf(r);
  const dr = (P * Math.pow(r, P - 1)) / Math.pow(R, P);
  const dz = (P * Math.pow(Math.max(z, 1e-6), P - 1)) / Math.pow(H, P);
  return norm([dr * Math.cos(th), dr * Math.sin(th), dz]);
}
const pt3 = (r, th) => [r * Math.cos(th), r * Math.sin(th), zOf(r)];
const shade = (n) => Math.max(0, dot3(n, LIGHT));

// Silhouette: convex hull of the projected surface and its base circle.
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}
const surf = [];
for (let i = 0; i <= 40; i++) for (let j = 0; j < 72; j++) surf.push(scr(pt3((R * i) / 40, (j / 72) * Math.PI * 2)));
const sil = hull(surf);
// Thin the hull to every few points for a compact outline, then smooth it.
const silPts = sil.filter((_, i) => i % 2 === 0);

// --- Board: top face and front edge, under the loaf.
const bTop = CY - 26, bFront = CY + 128, bEdge = bFront + 17;
const bL = 24;
const boardTop = [[bL + 30, bTop], [430, bTop], [430, bFront], [bL, bFront]];
const boardFace = [[bL, bFront], [430, bFront], [430, bEdge], [bL + 2, bEdge]];
// The loaf's cast shadow on the board, to the right and back of its base.
const shadowPoly = ellipsePts(CX + 70, CY + 12, R + 18, 66, -0.05, 40);
const loafPoly = sil;

// --- Wheat behind the loaf (left), drawn first so the loaf covers the stalk feet.
const wheatInk = [], wheatCuts = [], awns = [];
function ear(x0, y0, ang, len, n) {
  // Stalk from (x0, y0) up at angle ang; the ear is the top `len` units with n grain pairs.
  const dir = [Math.sin(ang), -Math.cos(ang)];
  const nrm = [-dir[1], dir[0]];
  const stalkLen = 190;
  const top = [x0 + dir[0] * stalkLen, y0 + dir[1] * stalkLen];
  const bend = 6;
  wheatInk.push(lens([x0, y0], top, 1.5, bend));
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const base = [top[0] - dir[0] * len * (1 - t) + dir[0] * 4, top[1] - dir[1] * len * (1 - t) + dir[1] * 4];
    for (const side of [-1, 1]) {
      const g = 11 - t * 4;
      const tip = [base[0] + dir[0] * g * 1.3 + nrm[0] * side * g * 0.55, base[1] + dir[1] * g * 1.3 + nrm[1] * side * g * 0.55];
      wheatInk.push(lens(base, tip, 3.6 - t * 1.1, side * 0.6));
      // a cut down the grain's middle
      const m0 = [base[0] + (tip[0] - base[0]) * 0.28, base[1] + (tip[1] - base[1]) * 0.28];
      const m1 = [base[0] + (tip[0] - base[0]) * 0.8, base[1] + (tip[1] - base[1]) * 0.8];
      wheatCuts.push(lens(m0, m1, 0.7, side * 0.3));
      // awn
      const a1 = [tip[0] + dir[0] * 26 + nrm[0] * side * 7, tip[1] + dir[1] * 26 + nrm[1] * side * 7];
      awns.push(`M${f(tip[0])} ${f(tip[1])}Q${f((tip[0] + a1[0]) / 2 + nrm[0] * side * 2)} ${f((tip[1] + a1[1]) / 2 + nrm[1] * side * 2)} ${f(a1[0])} ${f(a1[1])}`);
    }
  }
  const tipTop = [top[0] + dir[0] * 10, top[1] + dir[1] * 10];
  wheatInk.push(lens(top, tipTop, 2.6, 0));
  awns.push(`M${f(tipTop[0])} ${f(tipTop[1])}l${f(dir[0] * 24)} ${f(dir[1] * 24)}`);
}
ear(96, 250, -0.2, 72, 7);
ear(126, 248, 0.08, 80, 8);
ear(86, 262, -0.34, 64, 6);
art.add(INK, wheatInk);
art.stroke(INK, 1.3, awns);
art.add("background", wheatCuts);

// --- Board ink, then grain cuts (wider on the lit left, none in the loaf's shadow).
art.add(INK, [poly(boardTop), poly(boardFace)]);
const grain = [];
for (let y = bTop + 6; y < bFront - 3; y += 6) {
  let x = bL + 30 * (1 - (y - bTop) / (bFront - bTop)) + rr(2, 10);
  while (x < 400) {
    const len = rr(40, 110);
    const x1 = Math.min(x + len, 404);
    const mid = [(x + x1) / 2, y];
    const lit = Math.max(0, 1 - (mid[0] - 30) / 380);
    const inShadow = inside(mid, shadowPoly) || inside(mid, loafPoly) || inside([x, y], loafPoly) || inside([x1, y], loafPoly);
    if (!inShadow && x1 - x > 8) grain.push(lens([x, y + rr(-0.6, 0.6)], [x1, y + rr(-0.6, 0.6)], 0.5 + 1.9 * lit, rr(-0.5, 0.5)));
    x = x1 + rr(5, 14);
  }
}
// a thin highlight along the board's front edge
grain.push(lens([bL + 2, bFront + 1.6], [300, bFront + 1.6], 0.9, 0));
art.add("background", grain);

// --- A paper halo round the loaf so it parts from the board, then the loaf silhouette.
const ctr = silPts.reduce((a, p) => [a[0] + p[0] / silPts.length, a[1] + p[1] / silPts.length], [0, 0]);
art.add("background", smooth(silPts.map((p) => { const dx = p[0] - ctr[0], dy = p[1] - ctr[1], L = Math.hypot(dx, dy); return [p[0] + (dx / L) * 4.5, p[1] + (dy / L) * 4.5]; }), true, 1));
art.add(INK, smooth(silPts, true, 1));

// --- Banneton rings on the top: white cuts, wider where lit. Broken into gouge-length pieces.
const SCORE = (() => {
  // the score: a crescent across the top, in world xy
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const x = -118 + 214 * t;
    const y = 46 - 96 * t + 26 * Math.sin(Math.PI * t);
    pts.push([x, y]);
  }
  return pts;
})();
const scoreW = (t) => 2 + 30 * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.9;
// Gash polygon in world xy, then projected.
function scoreSide(sign) {
  return SCORE.map((p, i) => {
    const a = SCORE[Math.max(0, i - 1)], b = SCORE[Math.min(SCORE.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    const w = scoreW(i / (SCORE.length - 1)) * (sign > 0 ? 1 : 0.55);
    return [p[0] - (dy / L) * w * sign, p[1] + (dx / L) * w * sign];
  });
}
const toScr = ([x, y]) => scr([x, y, zOf(Math.hypot(x, y)) + 2]);
const gashWorld = [...scoreSide(1), ...scoreSide(-1).reverse()];
const gashScr = gashWorld.map(toScr);

const ringCuts = [];
const RING_STEP = 9.4;
for (let r = 12; r < R * 0.995; r += RING_STEP * (1 - 0.45 * (r / R) ** 4)) {
  const circ = 2 * Math.PI * r;
  const n = Math.max(3, Math.round(circ / 58));
  const phase = rr(0, 1);
  for (let k = 0; k < n; k++) {
    const t0 = ((k + phase) / n) * Math.PI * 2;
    const gap = rr(0.03, 0.09) * (Math.PI * 2) / n;
    const t1 = ((k + 1 + phase) / n) * Math.PI * 2 - gap;
    const tm = (t0 + t1) / 2;
    const rj = r + rr(-0.8, 0.8);
    const n3 = normal(rj, tm);
    if (dot3(n3, V) < 0.12) continue;
    const pa = scr(pt3(rj, t0)), pb = scr(pt3(rj, t1)), pm = scr(pt3(rj, tm));
    if ([0, 0.25, 0.5, 0.75, 1].some((u) => inside(scr(pt3(rj, t0 + (t1 - t0) * u)), gashScr))) continue;
    const s = shade(n3);
    const w = 0.3 + 3.2 * Math.pow(s, 2);
    // bend: how far the projected arc's middle sits off the chord
    const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2;
    const dx = pb[0] - pa[0], dy = pb[1] - pa[1], L = Math.hypot(dx, dy) || 1;
    const bend = ((pm[0] - mx) * -dy + (pm[1] - my) * dx) / L;
    ringCuts.push(lens(pa, pb, w, bend));
  }
}
art.add("background", ringCuts);

// --- The score: the gash is cut white (open crumb), the ear's lip stays ink with a lit edge above it, crumb lines inside.
function along(frac) {
  // the score's centre line offset by frac × its width (positive: the front side, negative: the ear side)
  return SCORE.map((p, i) => {
    const t = i / (SCORE.length - 1);
    const a = SCORE[Math.max(0, i - 1)], b = SCORE[Math.min(SCORE.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    const w = scoreW(t) * frac;
    return toScr([p[0] - (dy / L) * w, p[1] + (dx / L) * w]);
  });
}
art.add("background", smooth(gashScr, true, 0.8));
const lip = [], crumb = [];
{
  const back = along(-0.55), lipIn = SCORE.map((_, i) => along(-0.55 + 0.32 * Math.sin((Math.PI * i) / (SCORE.length - 1)))[i]);
  lip.push(smooth([...back, ...lipIn.reverse()], true, 0.8));
  for (const frac of [0.12, 0.42, 0.7]) {
    const line = along(frac);
    for (let i = 2; i < line.length - 3; i += 3) {
      const a = line[i], b = line[Math.min(line.length - 3, i + 3)];
      if (rr(0, 1) < 0.25) continue;
      crumb.push(lens(a, b, rr(0.35, 0.8), rr(-0.6, 0.6)));
    }
  }
  for (let i = 0; i < 0; i++) {
    const t = Math.floor(rr(3, SCORE.length - 4));
    const q = along(rr(0, 0.85))[t];
    crumb.push(lens([q[0] - 1.4, q[1]], [q[0] + 1.4, q[1] + rr(-0.5, 0.5)], rr(0.6, 1), 0));
  }
}
art.add(INK, [...lip, ...crumb]);
// the ear's top edge catches the light: a thin cut just beyond the lip
{
  const edge = along(-0.72);
  const cuts = [];
  for (let i = 2; i < edge.length - 3; i += 4) cuts.push(lens(edge[i], edge[Math.min(edge.length - 2, i + 4)], 0.9, 0));
  art.add("background", cuts);
}

// --- A rim highlight where the top turns into the wall (lit side only), and flour specks on the dark wall.
const rim = [];
for (let th = Math.PI * 0.55; th < Math.PI * 1.45; th += 0.09) {
  const r = R * 0.9;
  const pa = scr(pt3(r, th)), pb = scr(pt3(r, th + 0.075));
  const s = shade(normal(r, th));
  rim.push(lens(pa, pb, 0.4 + 1.6 * s, 0.4));
}
const specks = [];
for (let i = 0; i < 90; i++) {
  const r = rr(0, R * 0.98), th = rr(0, Math.PI * 2);
  const n3 = normal(r, th);
  if (dot3(n3, V) < 0.2 || shade(n3) > 0.5) continue;
  const p = scr(pt3(r, th));
  if (!inside(p, gashScr)) specks.push(dot(p[0], p[1]));
}

art.stroke("background", 1.1, specks);

// --- Chatter: a few ink slivers left on the cleared paper near the board and loaf, as a real block keeps.
const chatter = [];
for (const [x, y, l, a] of [[20, 380, 22, 0.02], [44, 388, 12, 0.05], [16, 330, 9, -0.4]]) {
  chatter.push(lens([x, y], [x + l * Math.cos(a), y + l * Math.sin(a)], 0.9, 0.4));
}
art.add(INK, chatter);

const stats = art.check();
console.log(INK, stats, "bytes≈", stats.chars + stats.paths * 120);
await art.preview(`${PREVIEW_DIR}/linocut-${INK}.png`);
if (process.argv[3] === "write")
  art.writeTs(`${DRAW_DIR}/motif-bakery-boule-linocut-solid.ts`, {
    exportName: "bouleLinocutSolid",
    id: "motif/bakery/boule-linocut-solid",
    style: "solid",
    doc: "Hero style pilot (linocut): a round sourdough loaf with banneton rings and one curved score with its ear, on a board, three ears of wheat behind; one ink with the paper cut out of it, gouge marks wider where the light falls. Drawn large and cropped at its right and bottom edges. Generated from a 3D model of the loaf by the hero-style art script.",
  });
