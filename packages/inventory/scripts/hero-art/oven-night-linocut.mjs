/* global process, console */
// Hero bar C (HQ it-studio-hero-art-trades): "vzhaja čez noč" as a two-colour linocut. The mouth of a brick bread oven at
// night: the fire glowing in the second colour (accent) with white-hot tongues, a scored loaf going in on a long peel,
// the vault's bricks, a crescent moon and stars in the black above. One ink (text) with the paper (background) cut out
// of it, gouge marks following the forms; the second colour printed in the oven's mouth and the moon.
//   node packages/inventory/scripts/hero-art/oven-night-linocut.mjs [write]
import { Art, srand, rr, poly, smooth, circle, ellipsePts, lens, PREVIEW_DIR, DRAW_DIR } from "./lib.mjs";

const HEX = {
  background: "#ffffff", surface: "#f1f1f2", text: "#19181a", muted: "#676768", primary: "#19181a", onPrimary: "#ffffff",
  accent: "#e2572a", border: "#e0e0e1", inverse: "#19181a", onInverse: "#f2f2f3", band: "#e2572a", onBand: "#19181a",
};
srand(23);

const layers = [];
function paint(role, d, stroke) {
  const key = stroke ? `s:${role}:${stroke}` : `f:${role}`;
  const list = Array.isArray(d) ? d : [d];
  const last = layers[layers.length - 1];
  if (last && last.key === key) last.d.push(...list);
  else layers.push({ key, role, stroke, d: [...list] });
}
const fill = (role, d) => paint(role, d);
const pol = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];

const C = [200, 214]; // the arch's centre on the spring line
const RI = 92, RO = 156; // the mouth's radius, the vault's outer radius
const HEARTH = 312;
const mouth = () => {
  const pts = [[C[0] - RI, HEARTH]];
  for (let i = 0; i <= 32; i++) pts.push(pol(C[0], C[1], RI, Math.PI + (i / 32) * Math.PI));
  pts.push([C[0] + RI, HEARTH]);
  return pts;
};

// --- 1. The block: all ink.
fill("text", poly([[0, 0], [400, 0], [400, 400], [0, 400]]));

// --- 2. The second colour: the fire in the oven's mouth, and the moon.
fill("accent", [poly(mouth()), circle(70, 72, 30)]);

// --- 3. Ink over the second colour: the moon's dark side (a crescent), logs at the back of the fire, the oven floor's edge.
fill("text", [
  circle(84, 62, 27),
  poly([[118, 300], [282, 300], [282, HEARTH], [118, HEARTH]]),
  lens([128, 292], [196, 284], 7, 0),
  lens([204, 286], [272, 294], 7, 0),
  lens([150, 282], [250, 280], 5, 0),
]);

// --- 4. Paper cuts: white-hot tongues of flame, the stars, the vault's bricks, the jambs' courses, gouges in the black.
const cuts = [];
// Flames: tapered tongues rising from the logs, leaning a little, taller in the middle.
for (const [x, h, lean, ph] of [[138, 62, -8, 0.3], [164, 104, -5, 1.4], [192, 136, 3, 2.2], [220, 112, 8, 0.9], [248, 78, 10, 2.8], [268, 46, 12, 1.9]]) {
  const base = 288, w = 10 + h * 0.07;
  const left = [], right = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, y = base - h * t;
    const cx = x + lean * t * t + Math.sin(t * 5 + ph) * 5 * t;
    const half = w * Math.pow(1 - t, 0.8) * (1 + 0.25 * Math.sin(t * 7 + ph));
    left.push([cx - half, y]);
    right.push([cx + half, y]);
  }
  cuts.push(smooth([...left, ...right.reverse().slice(1)], true, 0.9));
}
// Stars: dots and a few four-point sparks in the sky outside the vault.
const outside = ([x, y]) => Math.hypot(x - C[0], y - C[1]) > RO + 10 && y < C[1];
const sparks = [];
for (let i = 0; i < 14; i++) {
  let p;
  do p = [rr(12, 388), rr(10, 150)];
  while (!outside(p) || Math.hypot(p[0] - 70, p[1] - 72) < 44);
  const s = rr(3, 6.5);
  sparks.push(lens([p[0] - s, p[1]], [p[0] + s, p[1]], 1, 0), lens([p[0], p[1] - s], [p[0], p[1] + s], 1, 0));
}
cuts.push(...sparks);
// The vault: the extrados and the intrados as thin cut lines, radial joints between voussoirs, a gouge in each brick.
const arc = (r, w) => {
  const out = [];
  for (let i = 0; i < 24; i++) {
    const a0 = Math.PI + (i / 24) * Math.PI, a1 = Math.PI + ((i + 1) / 24) * Math.PI;
    out.push(lens(pol(C[0], C[1], r, a0), pol(C[0], C[1], r, a1), w, 0));
  }
  return out;
};
cuts.push(...arc(RO, 1.6), ...arc(RI + 4, 1.4));
const N = 15;
for (let i = 1; i < N; i++) {
  const a = Math.PI + (i / N) * Math.PI;
  cuts.push(lens(pol(C[0], C[1], RI + 6, a), pol(C[0], C[1], RO - 2, a), 1.3, 0));
  const am = Math.PI + ((i - 0.5) / N) * Math.PI;
  cuts.push(lens(pol(C[0], C[1], RI + 20, am - 0.04), pol(C[0], C[1], RO - 18, am + 0.03), 1.6, 0.6));
}
// Jambs: brick courses either side of the mouth, staggered joints.
for (const [x0, x1] of [[C[0] - RO, C[0] - RI - 4], [C[0] + RI + 4, C[0] + RO]]) {
  for (let k = 0, y = C[1] + 16; y < HEARTH - 4; k++, y += 16) {
    cuts.push(lens([x0 + 2, y], [x1 - 2, y], 1.3, 0));
    const off = k % 2 ? 0.25 : 0.65;
    const xj = x0 + (x1 - x0) * off;
    cuts.push(lens([xj, y - 14], [xj, y - 2], 1.1, 0));
  }
}
// The hearth stone across the front, and the ground line.
cuts.push(lens([30, HEARTH + 4], [370, HEARTH + 4], 2.2, 0), lens([20, HEARTH + 30], [380, HEARTH + 30], 1.6, 0.5));
// Gouges in the sky: short horizontal strokes, sparse, thinning away from the moon.
for (let i = 0; i < 46; i++) {
  const p = [rr(8, 392), rr(8, 196)];
  if (!outside(p) || Math.hypot(p[0] - 70, p[1] - 72) < 40) continue;
  const l = rr(8, 22);
  cuts.push(lens(p, [p[0] + l, p[1] + rr(-1.5, 1.5)], rr(0.7, 1.3), rr(-0.6, 0.6)));
}
// Gouges in the ground below the hearth.
for (let i = 0; i < 30; i++) {
  const y = rr(HEARTH + 40, 396), x = rr(4, 380), l = rr(14, 40);
  cuts.push(lens([x, y], [x + l, y + rr(-2, 2)], rr(0.8, 1.6), rr(-1, 1)));
}
fill("background", cuts);

// --- 5. The peel and the loaf, sliding into the mouth: paper first (a cut halo so the ink reads against the ink), then ink.
const LC = [198, 294], LRX = 76, LH = 54;
const loafPts = [];
for (let i = 0; i <= 28; i++) {
  const t = Math.PI + (i / 28) * Math.PI;
  const x = LC[0] + LRX * Math.cos(t), y = LC[1] + LH * Math.sin(t) * Math.pow(Math.abs(Math.sin(t)), 0.15);
  loafPts.push([x, y]);
}
for (let i = 1; i < 12; i++) {
  const t = (i / 12) * Math.PI;
  loafPts.push([LC[0] + LRX * Math.cos(t), LC[1] + 8 * Math.sin(t)]);
}
const blade = ellipsePts(204, 300, 86, 9, -0.03, 32);
const handle = (w) => {
  const a = [262, 300], b = [404, 386], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = [(-(b[1] - a[1]) / L) * (w / 2), ((b[0] - a[0]) / L) * (w / 2)];
  return poly([[a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]], [b[0] - n[0], b[1] - n[1]], [a[0] - n[0], a[1] - n[1]]]);
};
fill("background", [handle(20), smooth(ellipsePts(204, 300, 92, 14, -0.03, 32), true, 1)]);
fill("text", [handle(12), smooth(blade, true, 1), smooth(loafPts, true, 0.9)]);

// --- 6. Paper cuts on the loaf (its curved score and its ear, gouge marks following the dome, flour specks) and the peel.
const loafCuts = [];
// The score: one long curved cut across the top, open, with the ear above it.
loafCuts.push(lens([142, 268], [252, 256], 7.5, -6));
loafCuts.push(lens([152, 259], [242, 249], 2, -5));
// Gouge marks round the dome, lit side (left) wider.
for (let ring = 1; ring <= 6; ring++) {
  const f = ring / 7;
  for (let t = Math.PI + 0.15; t < 2 * Math.PI - 0.1; t += 0.2) {
    const ry = LH * (1 - f * 0.55), rx = LRX * (1 - f * 0.25);
    const a = [LC[0] + rx * Math.cos(t), LC[1] - 4 + ry * Math.sin(t)];
    const b = [LC[0] + rx * Math.cos(t + 0.18), LC[1] - 4 + ry * Math.sin(t + 0.18)];
    const lit = 0.5 - 0.5 * Math.cos(t + 0.5);
    if (Math.abs(a[1] - (262 - (a[0] - 142) * 0.11)) < 9 && a[0] > 140 && a[0] < 254) continue;
    loafCuts.push(lens(a, b, 0.6 + 2.4 * lit * (1 - f * 0.5), 0.5));
  }
}
// The dome's front face below the score: contour gouges across it, bowed with the form, wider where the fire lights it (left).
for (const [y, bow] of [[268, 3], [276, 4], [284, 4.5], [292, 5]]) {
  const half = LRX * Math.sqrt(Math.max(0, 1 - ((LC[1] - y) / LH) ** 2)) - 6;
  for (let x = LC[0] - half; x < LC[0] + half - 8; x += rr(11, 16)) {
    const l = rr(7, 12), u = (x - (LC[0] - half)) / (2 * half);
    const yy = (xx) => y + bow * (1 - (((xx - LC[0]) / half) ** 2));
    loafCuts.push(lens([x, yy(x)], [x + l, yy(x + l)], 0.5 + 1.8 * (1 - u), 0.3));
  }
}
// Flour specks on the crown.
for (let i = 0; i < 26; i++) {
  const t = rr(Math.PI * 1.15, Math.PI * 1.85), r = Math.sqrt(rr(0.1, 1));
  loafCuts.push(lens([LC[0] + LRX * 0.8 * r * Math.cos(t), LC[1] - 6 + LH * 0.9 * r * Math.sin(t)], [LC[0] + LRX * 0.8 * r * Math.cos(t) + 1.6, LC[1] - 6 + LH * 0.9 * r * Math.sin(t)], 0.7, 0));
}
// The handle's highlight and the blade's lip.
loafCuts.push(lens([272, 302], [396, 377], 1.3, 0), lens([126, 300], [282, 298], 1.2, 0.4));
fill("background", loafCuts);

// --- 7. A glint of the fire on the loaf's crown, in the second colour.
fill("accent", [lens([150, 254], [214, 246], 2.6, -3), lens([128, 286], [140, 262], 2, -1.5)]);

const art = new Art(400, 400);
for (const l of layers) {
  if (l.stroke) art.stroke(l.role, l.stroke, l.d);
  else art.add(l.role, l.d);
}
const stats = art.check();
console.log(stats, "bytes≈", stats.chars + stats.paths * 120);
if (stats.paths > 24) throw new Error(`${stats.paths} paths; the Drawing format takes 24`);
const preview = art.svg.bind(art);
art.svg = () => preview(HEX);
await art.preview(`${PREVIEW_DIR}/oven-night-linocut.png`);
if (process.argv[2] === "write")
  art.writeTs(`${DRAW_DIR}/motif-bakery-oven-night-linocut-solid.ts`, {
    exportName: "ovenNightLinocutSolid",
    id: "motif/bakery/oven-night-linocut-solid",
    style: "solid",
    doc: "Hero bar C (two-colour linocut, \"vzhaja čez noč\"): the mouth of a brick bread oven at night, the fire in the second colour (accent) with white-hot tongues, a scored loaf going in on a long peel, the vault's bricks, a crescent moon and stars in the black. One ink with the paper cut out of it, gouge marks following the forms. Drawn new by the hero-art script.",
  });
