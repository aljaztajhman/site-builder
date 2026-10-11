/* global process, console */
// Style 1: a printed-poster still life in the site's palette: a round loaf and a potica on a striped linen cloth, wheat
// behind, a pale arch as the back plane. Flat tones in overlapping planes; light and shadow as posterised tone steps plus
// stipple grain (ink dots in the shadows, paper dots in the light).
import { Art, srand, rr, poly, smooth, lens, dot, inside, ellipsePts, ellipse, PREVIEW_DIR, DRAW_DIR } from "./lib.mjs";

const art = new Art(400, 400);
srand(5);
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const LIGHT = norm([-0.65, 0.35, 0.68]);
const E = (30 * Math.PI) / 180, SE = Math.sin(E), CE = Math.cos(E);
const V = [0, CE, SE];

// --- A dome (superellipse of revolution) on the ground, orthographic from 30° up; rasterised for regions and grain.
function dome({ cx, cy, R, H, P }) {
  const zOf = (r) => H * Math.pow(Math.max(0, 1 - Math.pow(r / R, P)), 1 / P);
  const scr = ([X, Y, Z]) => [cx + X, cy + Y * SE - Z * CE];
  const normal = (r, th) => {
    const z = zOf(r);
    const dr = (P * Math.pow(r, P - 1)) / Math.pow(R, P);
    const dz = (P * Math.pow(Math.max(z, 1e-6), P - 1)) / Math.pow(H, P);
    return norm([dr * Math.cos(th), dr * Math.sin(th), dz]);
  };
  const pt3 = (r, th) => [r * Math.cos(th), r * Math.sin(th), zOf(r)];
  // raster: shade per screen unit (front-most surface point)
  const W = 400, Hh = 400;
  const shade = new Float32Array(W * Hh).fill(-1), depth = new Float32Array(W * Hh).fill(-1e9), rad = new Float32Array(W * Hh);
  for (let i = 0; i <= 320; i++) {
    // along the profile by angle, so the steep wall near the base is sampled as densely as the top
    const phi = (i / 320) * (Math.PI / 2);
    const r = R * Math.pow(Math.cos(phi), 2 / P);
    for (let j = 0; j < 900; j++) {
      const th = (j / 900) * Math.PI * 2;
      const p = pt3(r, th), s = scr(p);
      const x = Math.round(s[0]), y = Math.round(s[1]);
      if (x < 0 || y < 0 || x >= W || y >= Hh) continue;
      const d = dot3(p, V);
      const k = y * W + x;
      if (d > depth[k]) { depth[k] = d; shade[k] = Math.max(0, dot3(normal(Math.max(r, 0.01), th), LIGHT)); rad[k] = r; }
    }
  }
  const at = (x, y) => { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= W || y >= Hh ? -1 : shade[y * W + x]; };
  // the region where shade ≥ t (star-shaped round the brightest point), as a polygon
  let best = [0, 0], bv = -1;
  for (let k = 0; k < W * Hh; k++) if (shade[k] > bv) { bv = shade[k]; best = [k % W, Math.floor(k / W)]; }
  function region(t, n = 90) {
    // star-shaped round the centroid of the pixels at or above t
    let sx = 0, sy = 0, cnt = 0;
    for (let k = 0; k < W * Hh; k++) if (shade[k] >= t) { sx += k % W; sy += Math.floor(k / W); cnt++; }
    const best = [sx / cnt, sy / cnt];
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      let d = 0;
      while (d < 400 && at(best[0] + Math.cos(a) * d, best[1] + Math.sin(a) * d) >= t) d += 0.25;
      pts.push([best[0] + Math.cos(a) * d, best[1] + Math.sin(a) * d]);
    }
    return pts;
  }
  function silhouette(n = 90) { return region(0, n).map((p) => p); }
  /** The region where pred(shade, radius) holds, star-shaped round its centroid. */
  function where(pred, n = 40) {
    const ok = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= Hh) return false; const k = y * W + x; return shade[k] >= 0 && pred(shade[k], rad[k]); };
    let sx = 0, sy = 0, cnt = 0;
    for (let k = 0; k < W * Hh; k++) if (ok(k % W, Math.floor(k / W))) { sx += k % W; sy += Math.floor(k / W); cnt++; }
    const c = [sx / cnt, sy / cnt], pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      let d = 0;
      while (d < 400 && ok(c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d)) d += 0.25;
      pts.push([c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d]);
    }
    return pts;
  }
  const radAt = (x, y) => { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= W || y >= Hh || shade[y * W + x] < 0 ? -1 : rad[y * W + x]; };
  return { zOf, scr, normal, pt3, at, radAt, region, silhouette, where, best };
}

const PEEL_GRAIN = [];
const PEEL_SHAPE = [];

const rot = (p, c, a) => { const s = Math.sin(a), k = Math.cos(a); return [c[0] + (p[0] - c[0]) * k - (p[1] - c[1]) * s, c[1] + (p[0] - c[0]) * s + (p[1] - c[1]) * k]; };

// ---------- Back plane: a tall pale arch.
{
  const L0 = 96, R0 = 384, top = 20, base = 262, r = (R0 - L0) / 2, c = (L0 + R0) / 2;
  const pts = [[L0, base]];
  for (let i = 0; i <= 20; i++) { const a = Math.PI + (Math.PI * i) / 20; pts.push([c + r * Math.cos(a), top + r + r * Math.sin(a)]); }
  pts.push([R0, base]);
  art.add("border", poly(pts));
}

// ---------- A baker's peel leaning in the arch: blade up, handle down behind the loaf.
{
  const foot = [176, 300], tip = [272, 132];
  const ang = Math.atan2(tip[1] - foot[1], tip[0] - foot[0]);
  const dir = [Math.cos(ang), Math.sin(ang)], nrm = [-dir[1], dir[0]];
  const hw = 6.5;
  const handle = [[foot[0] + nrm[0] * hw, foot[1] + nrm[1] * hw], [tip[0] + nrm[0] * hw, tip[1] + nrm[1] * hw], [tip[0] - nrm[0] * hw, tip[1] - nrm[1] * hw], [foot[0] - nrm[0] * hw, foot[1] - nrm[1] * hw]];
  // the blade: a rounded square, wider at its far edge, from the handle's tip on
  const bl = 100, bw0 = 16, bw1 = 42;
  const p = (u, v) => [tip[0] + dir[0] * u + nrm[0] * v, tip[1] + dir[1] * u + nrm[1] * v];
  const blade = [p(-8, -6.5), p(6, -bw0), p(16, -bw1), p(bl - 16, -bw1 - 1), p(bl, -bw1 + 12), p(bl + 2, 0), p(bl, bw1 - 12), p(bl - 16, bw1 + 1), p(16, bw1), p(6, bw0), p(-8, 6.5)];
  // a hole to hang it by, near the handle's foot end is hidden; the hole sits in the blade's neck instead
  art.add("muted", [poly([[0, 262], [400, 262], [400, 384], [0, 384]]), poly(handle), smooth(blade, true, 0.55)]);
  const grain = [];
  grain.push(lens(p(30, -12), p(70, -10), 0.5, 0.5), lens(p(44, 14), p(86, 17), 0.5, -0.4));
  grain.push(lens(p(-60, 0.5), p(-6, 0.5), 0.45, 0));
  PEEL_GRAIN.push(...grain);
  PEEL_SHAPE.push(...handle.slice(0, 2), ...blade, ...handle.slice(2));
}

// ---------- Table top and its front edge (with a few grain lines), then the cloth.

{
  const lines = [poly([[0, 384], [400, 384], [400, 400], [0, 400]]), ...PEEL_GRAIN];
  for (const y of [270, 278, 290]) {
    let x = rr(0, 20);
    while (x < 400) { const l = rr(30, 90); lines.push(lens([x, y + rr(-1, 1)], [x + l, y + rr(-1, 1)], 0.55, rr(-0.6, 0.6))); x += l + rr(14, 40); }
  }
  art.add("text", lines);
}
art.add("background", [poly([[66, 290], [346, 284], [384, 384], [24, 384]]), poly([[24, 384], [384, 384], [387, 400], [21, 400]])]);

// ---------- Shadows on the cloth (border): the loaf's to the right-back, the potica's beside it; two folds in the hang.
const POT = { c: [116, 352], rx: 26, ry: 29 };
art.add("border", [
  ellipse(238 + 44, 302, 128, 46, -0.06),
  ellipse(POT.c[0] + 22, POT.c[1] + 19, 60, 15, -0.08),
  poly([[112, 384], [128, 384], [120, 400], [106, 400]]),
  poly([[298, 384], [318, 384], [327, 400], [305, 400]]),
]);
// red hem stripes on the cloth, as on a Slovene linen cloth: two bands along the front, two down the hang at each side
{
  const bands = [];
  bands.push(poly([[34, 362], [376, 362], [377, 365.5], [33, 365.5]]), poly([[32, 370], [379, 370], [379.5, 371.8], [31.5, 371.8]]));
  for (const [x0, w] of [[52, 3.4], [60, 1.6], [354, 3.4], [362, 1.6]]) bands.push(poly([[x0, 384], [x0 + w, 384], [x0 + w - 0.5, 400], [x0 - 0.5, 400]]));
  art.add("primary", bands);
}

// ---------- The loaf: ink silhouette, the crust tone, the lit cap; grain in the shade; flour rings; the score.
const L = dome({ cx: 238, cy: 300, R: 114, H: 88, P: 2.15 });
art.add("text", smooth(L.silhouette(40), true, 1));
art.add("primary", smooth(L.region(0.17, 40), true, 1));
art.add("accent", smooth(L.region(0.55, 36), true, 1));
{
  const inkDots = [];
  for (let i = 0; i < 4000 && inkDots.length < 140; i++) {
    const x = rr(110, 360), y = rr(200, 370), s = L.at(x, y);
    if (s >= 0.17 && s < 0.46 && rr(0, 1) < ((0.46 - s) / 0.29) ** 1.3 * 0.9) inkDots.push(dot(x, y));
  }
  art.stroke("text", 1.45, inkDots);
}
// the floured top from the banneton: pale in the shade, paper in the light
const CAP = 0.72 * 114;
art.add("border", smooth(L.where((s, r) => r < CAP, 40), true, 1));
art.add("background", smooth(L.where((s, r) => r < CAP && s >= 0.5, 40), true, 1));
{
  // banneton rings pressed into the flour, showing the crust (accent), and the opened score
  const marks = [];
  for (let r = 10; r < CAP - 3; r += 9.5) {
    const n = Math.max(4, Math.round((2 * Math.PI * r) / 27));
    for (let k = 0; k < n; k++) {
      const t0 = (k / n) * Math.PI * 2 + rr(0, 0.1), t1 = t0 + ((Math.PI * 2) / n) * rr(0.6, 0.85);
      const nn = L.normal(r, (t0 + t1) / 2);
      if (dot3(nn, V) < 0.3) continue;
      const a = L.scr(L.pt3(r, t0)), b = L.scr(L.pt3(r, t1)), m = L.scr(L.pt3(r, (t0 + t1) / 2));
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], Ln = Math.hypot(dx, dy) || 1;
      marks.push(lens(a, b, rr(0.45, 0.9), ((m[0] - mx) * -dy + (m[1] - my) * dx) / Ln));
    }
  }
  const S = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14; S.push([-78 + 146 * t, 34 - 70 * t + 20 * Math.sin(Math.PI * t)]); }
  const w = (t) => 1.2 + 16 * Math.sin(Math.PI * t) ** 0.85;
  const side = (k) => S.map((p, i) => {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], Ln = Math.hypot(dx, dy);
    const ww = w(i / (S.length - 1)) * k, X = p[0] - (dy / Ln) * ww, Y = p[1] + (dx / Ln) * ww;
    return L.scr([X, Y, L.zOf(Math.hypot(X, Y)) + 1]);
  });
  marks.push(smooth([...side(1), ...side(-0.5).reverse()], true, 0.8));
  art.add("accent", marks);
  art.add("text", smooth([...side(-0.5), ...side(-0.15).reverse()], true, 0.8));
}

// ---------- Potica: a walnut roll lying toward us, its cut end showing the spiral.
{
  const { c, rx, ry } = POT, tilt = 0.12;
  const back = [c[0] - 60, c[1] - 30];
  const body = [...ellipsePts(back[0], back[1], rx, ry, tilt, 14, Math.PI * 0.5, Math.PI * 1.5), ...ellipsePts(c[0], c[1], rx, ry, tilt, 14, -Math.PI * 0.5, Math.PI * 0.5)];
  art.add("primary", smooth(body, true, 1));
  const lit = [...ellipsePts(back[0] + 3, back[1] - 5, rx * 0.78, ry * 0.6, tilt, 8, Math.PI * 1.02, Math.PI * 1.5), ...ellipsePts(c[0] - 6, c[1] - 7, rx * 0.78, ry * 0.6, tilt, 8, -Math.PI * 0.5, -Math.PI * 0.02)];
  art.add("accent", smooth(lit, true, 1));
  art.add("text", ellipse(c[0], c[1], rx, ry, tilt));
  art.add("surface", ellipse(c[0] - 0.8, c[1] - 0.5, rx - 2.4, ry - 2.4, tilt));
  const sp = [];
  for (let i = 0; i <= 90; i++) {
    const t = i / 90, a = t * 3.2 * Math.PI * 2 + 0.6, r = 1.5 + t * (rx - 6.5);
    const q = [Math.cos(a) * r, Math.sin(a) * r * (ry / rx)];
    sp.push(rot([c[0] - 0.8 + q[0], c[1] - 0.5 + q[1]], [c[0] - 0.8, c[1] - 0.5], tilt));
  }
  const left = [], right = [];
  for (let i = 0; i < sp.length; i++) {
    const a = sp[Math.max(0, i - 1)], b = sp[Math.min(sp.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], Ln = Math.hypot(dx, dy) || 1;
    const ww = 0.5 + 1.8 * Math.sin(Math.PI * Math.min(1, (i / (sp.length - 1)) * 1.08));
    left.push([sp[i][0] - (dy / Ln) * ww, sp[i][1] + (dx / Ln) * ww]);
    right.push([sp[i][0] + (dy / Ln) * ww, sp[i][1] - (dx / Ln) * ww]);
  }
  art.add("muted", poly([...left.filter((_, i) => i % 2 === 0), ...right.reverse().filter((_, i) => i % 2 === 0)]));
}

// ---------- Print grain: paper specks where the ink is dark (the peel, the table, the loaf's shadow side, the potica).
{
  const specks = [];
  for (let i = 0; i < 3000 && specks.length < 70; i++) {
    const x = rr(0, 400), y = rr(40, 400);
    const onPeel = inside([x, y], PEEL_SHAPE), onTable = y > 262 && y < 384 && !inside([x, y], [[66, 290], [346, 284], [384, 384], [24, 384]]);
    const s = L.at(x, y), onDark = s >= 0 && s < 0.17;
    if ((onPeel || onTable || onDark) && rr(0, 1) < 0.5) specks.push(dot(x, y));
  }
  // flour dust past the floured top, thinning out down the crust
  for (let i = 0; i < 4000 && specks.length < 150; i++) {
    const x = rr(110, 360), y = rr(200, 360), r = L.radAt(x, y);
    if (r > CAP - 2 && r < CAP + 18 && rr(0, 1) < 1 - (r - CAP + 2) / 20) specks.push(dot(x, y));
  }
  art.stroke("background", 1.2, specks);
}

// ---------- Flour on the cloth.
{
  const fl = [];
  for (let i = 0; i < 60; i++) fl.push(dot(rr(160, 350), rr(350, 380)));
  art.stroke("border", 1.6, fl);
}

const stats = art.check();
console.log(stats, "bytes≈", stats.chars + stats.paths * 120);
await art.preview(`${PREVIEW_DIR}/poster.png`);
if (process.argv[2] === "write")
  art.writeTs(`${DRAW_DIR}/motif-bakery-loaf-potica-scene-solid.ts`, {
    exportName: "loafPoticaSceneSolid",
    id: "motif/bakery/loaf-potica-scene-solid",
    style: "solid",
    doc: "Hero style pilot (printed poster): a round scored loaf and a walnut potica cut to show its spiral, on a linen cloth with red hem stripes on a table, a baker's peel leaning in a pale arch behind. Flat palette tones in overlapping planes, light and shade as tone steps with stipple grain. Generated by the hero-style art script.",
  });
