/* global process, console */
// Hero bar G (HQ it-studio-hero-art-trades): a printed poster for a heating installer, no photos needed. Outside and
// inside, split by the house wall: on the cold side (the accent colour, snow falling) an outdoor heat pump; its pipes run
// through the wall to a white column radiator on the warm side, in front of a big hot-coloured disc, heat rising off it.
// The flow pipe in the hot colour (primary), the return in the cold one (accent). Flat poster planes in the palette's
// roles, a dark key line, stipple grain; drawn to bleed off the drawing's right and bottom edges.
//   node packages/inventory/scripts/hero-art/heat-pump-poster.mjs [write]
import { Art, srand, rr, poly, smooth, circle, ellipse, dot, lens, PREVIEW_DIR, DRAW_DIR } from "./lib.mjs";

const HEX = {
  background: "#ffffff", surface: "#e6ebf0", text: "#101820", muted: "#465361", primary: "#d63c22", onPrimary: "#ffffff",
  accent: "#1f6fe0", border: "#d3dae1", inverse: "#101820", onInverse: "#f5f5f5", band: "#1f6fe0", onBand: "#ffffff",
};
srand(17);

// Paint in order; consecutive pieces of the same paint merge into one path (the format allows 24).
const layers = [];
function paint(role, d, stroke) {
  const key = stroke ? `s:${role}:${stroke}` : `f:${role}`;
  const list = Array.isArray(d) ? d : [d];
  const last = layers[layers.length - 1];
  if (last && last.key === key) last.d.push(...list);
  else layers.push({ key, role, stroke, d: [...list] });
}
const fill = (role, d) => paint(role, d);
const line = (role, width, d) => paint(role, d, width);

const r1 = (n) => Math.round(n * 10) / 10;
/** A rounded rectangle as one subpath. */
function rrect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  const k = 0.5523 * r;
  const n = (...v) => v.map(r1).join(" ");
  return `M${n(x + r, y)}H${r1(x + w - r)}C${n(x + w - r + k, y, x + w, y + r - k, x + w, y + r)}V${r1(y + h - r)}C${n(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h)}H${r1(x + r)}C${n(x + r - k, y + h, x, y + h - r + k, x, y + h - r)}V${r1(y + r)}C${n(x, y + r - k, x + r - k, y, x + r, y)}Z`;
}
const rect = (x, y, w, h) => poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);

const FLOOR = 340;
const WALL0 = 146, WALL1 = 166;
const DISC = { x: 292, y: 196, r: 156 };

// --- Planes: the cold outside (accent) left of the wall, the warm inside (surface) right of it, the hot disc, the floor.
// (The inside is the page itself: no plane right of the wall.)
fill("accent", rect(0, 0, WALL0, FLOOR));
fill("primary", circle(DISC.x, DISC.y, DISC.r));
// Snow on the ground outside, the floor inside.
fill("background", smooth([[0, FLOOR - 8], [40, FLOOR - 14], [90, FLOOR - 9], [WALL0, FLOOR - 12], [WALL0, 400], [0, 400]], true, 0.6));
fill("border", rect(WALL1, FLOOR, 400 - WALL1, 60));

// --- Floor shadows, then the wall in section: dark, top to bottom.
fill("muted", [ellipse(300, FLOOR + 12, 100, 8), ellipse(74, FLOOR + 6, 70, 6)]);
fill("text", rect(WALL0, 0, WALL1 - WALL0, 400));

// --- Radiator: eight columns joined at top and bottom, on two feet, a dark key line round it.
const RX = 200, RT = 118, RB = 316, COLS = 8, CW = 20, GAP = 3;
const RW = COLS * CW + (COLS - 1) * GAP;
const key = [rect(RX + 14, RB - 2, 10, FLOOR - RB + 2), rect(RX + RW - 24, RB - 2, 10, FLOOR - RB + 2)];
for (let i = 0; i < COLS; i++) key.push(rrect(RX + i * (CW + GAP) - 2.5, RT - 2.5, CW + 5, RB - RT + 5, 12));
fill("text", key);
const cols = [], shade = [], shine = [], hubs = [];
for (let i = 0; i < COLS; i++) {
  const x = RX + i * (CW + GAP);
  cols.push(rrect(x, RT, CW, RB - RT, 10));
  shade.push(rrect(x + CW * 0.62, RT + 4, CW * 0.38 - 1, RB - RT - 8, 6));
  shine.push(rrect(x + 4, RT + 16, 3.2, RB - RT - 32, 1.6));
  if (i < COLS - 1) {
    const g = x + CW - 1;
    hubs.push(rect(g, RT + 12, GAP + 2, 14), rect(g, RB - 26, GAP + 2, 14));
  }
}
fill("background", cols);

// --- Heat rising off the radiator: three tapered waves in the paper colour, on the hot disc.
const waves = [];
for (const [x0, h] of [[232, 70], [282, 88], [332, 70]]) {
  const pts = [];
  for (let t = 0; t <= 1.0001; t += 0.05) pts.push([x0 + Math.sin(t * Math.PI * 2.2) * 9, RT - 16 - t * h]);
  const n = pts.length, left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const w = 4.4 * (1 - (i / (n - 1)) * 0.8);
    left.push([pts[i][0] - (dy / L) * w, pts[i][1] + (dx / L) * w]);
    right.push([pts[i][0] + (dy / L) * w, pts[i][1] - (dx / L) * w]);
  }
  waves.push(smooth([...left, ...right.reverse()], true, 0.9));
}
fill("background", waves);
fill("border", shade);

// --- Pipes: the flow leaves the pump's top, rises, turns through the wall and enters the radiator high; the return runs
// low and straight through the wall. A dark key line under each; filled outlines (a stroke in the format is at most 8 wide).
const P = 15;
const flowX = 112, flowTop = RT + 30, retY = RB - 22;
function pipe(pts, r) {
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], [cx, cy] = pts[i + 1];
    const l1 = Math.hypot(bx - ax, by - ay), l2 = Math.hypot(cx - bx, cy - by);
    const p1 = [bx - ((bx - ax) / l1) * r, by - ((by - ay) / l1) * r], p2 = [bx + ((cx - bx) / l2) * r, by + ((cy - by) / l2) * r];
    d += `L${r1(p1[0])} ${r1(p1[1])}Q${bx} ${by} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  const last = pts[pts.length - 1];
  return `${d}L${r1(last[0])} ${r1(last[1])}`;
}
/** The pipe's centreline as points: straight runs and quarter-arc elbows of radius r. */
function pipePts(pts, r) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], [cx, cy] = pts[i + 1];
    const l1 = Math.hypot(bx - ax, by - ay), l2 = Math.hypot(cx - bx, cy - by);
    const p1 = [bx - ((bx - ax) / l1) * r, by - ((by - ay) / l1) * r], p2 = [bx + ((cx - bx) / l2) * r, by + ((cy - by) / l2) * r];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10, u = 1 - t;
      out.push([u * u * p1[0] + 2 * u * t * bx + t * t * p2[0], u * u * p1[1] + 2 * u * t * by + t * t * p2[1]]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
/** A pipe of width w as a filled outline (the Drawing format caps a stroke at 8 units): its centreline offset both ways. */
function pipeBody(cl, w) {
  const left = [], right = [];
  for (let i = 0; i < cl.length; i++) {
    const a = cl[Math.max(0, i - 1)], b = cl[Math.min(cl.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    left.push([cl[i][0] - (dy / L) * (w / 2), cl[i][1] + (dx / L) * (w / 2)]);
    right.push([cl[i][0] + (dy / L) * (w / 2), cl[i][1] - (dx / L) * (w / 2)]);
  }
  return poly([...left, ...right.reverse()]);
}
const flowCl = pipePts([[flowX, 214], [flowX, flowTop], [RX + 2, flowTop]], 22);
const retCl = [[132, retY], [RX + 2, retY]];
fill("text", [pipeBody(flowCl, P + 5), pipeBody(retCl, P + 5)]);
fill("primary", pipeBody(flowCl, P));
fill("accent", pipeBody(retCl, P));
const shineLines = [pipe([[flowX - 3.5, 206], [flowX - 3.5, flowTop - 4], [RX - 6, flowTop - 4]], 18), `M136 ${retY - 4}H${RX - 6}`];
// Collars at the radiator, the pump and both sides of the wall; the valve on the flow with its red cap.
fill("text", [
  rect(RX - 9, flowTop - 11, 8, 22),
  rect(RX - 9, retY - 11, 8, 22),
  rect(flowX - 11, 206, 22, 8),
  rect(WALL0 - 6, flowTop - 12, 6, 24),
  rect(WALL1, flowTop - 12, 6, 24),
  rect(WALL0 - 6, retY - 12, 6, 24),
  rect(WALL1, retY - 12, 6, 24),
  rect(RX - 22, flowTop - 20, 10, 10),
]);

// --- The heat pump outside: a white case with a dark key line, a big fan grille, side vents, two feet, snow on its lid.
const HX = 8, HY = 214, HW = 130, HH = 112;
const FX = HX + 54, FY = HY + HH / 2, FR = 40;
fill("text", [rect(HX + 12, HY + HH, 14, 8), rect(HX + HW - 28, HY + HH, 14, 8), rrect(HX - 3.5, HY - 3.5, HW + 7, HH + 7, 9)]);
fill("primary", rrect(RX - 28, flowTop - 34, 22, 15, 4));
// The case, and snow on its lid.
fill("background", [rrect(HX, HY, HW, HH, 6), smooth([[HX - 4, HY - 2], [HX + 30, HY - 9], [HX + 80, HY - 7], [HX + HW + 4, HY - 10], [HX + HW + 4, HY + 2], [HX - 4, HY + 3]], true, 0.6)]);
fill("border", rrect(HX + HW - 28, HY + 6, 22, HH - 12, 3));
const vents = [];
for (let i = 0; i < 6; i++) vents.push(rect(HX + HW - 23, HY + 18 + i * 13, 12, 3.2));
fill("text", [circle(FX, FY, FR), ...vents]);
fill("muted", circle(FX, FY, FR - 5));
const blades = [];
for (let k = 0; k < 3; k++) {
  const a = (k / 3) * Math.PI * 2 - 0.4;
  blades.push(lens([FX + Math.cos(a) * 7, FY + Math.sin(a) * 7], [FX + Math.cos(a + 0.5) * (FR - 8), FY + Math.sin(a + 0.5) * (FR - 8)], 6.8, 3.2));
}
fill("surface", blades);
fill("text", circle(FX, FY, 6));
const guard = [];
for (let y = FY - FR + 9; y < FY + FR - 5; y += 10) {
  const half = Math.sqrt(Math.max(0, FR * FR - (y - FY) ** 2)) - 4;
  guard.push(`M${r1(FX - half)} ${r1(y)}H${r1(FX + half)}`);
}

// --- Snow falling outside, cold air leaving the fan, grain on the hot disc and in the grille.
const snow = [];
for (let i = 0; i < 96; i++) {
  const x = rr(4, WALL0 - 6), y = rr(6, HY - 16);
  if (!(x > flowX - 14 && y > flowTop - 14)) snow.push(dot(x, y));
}
line("background", 3.4, [...snow, ...shineLines]);
const inkDots = [];
for (let i = 0; i < 260; i++) {
  const a = rr(0, Math.PI * 2), r = Math.sqrt(rr(0, 1)) * (DISC.r - 4);
  const x = DISC.x + Math.cos(a) * r, y = DISC.y + Math.sin(a) * r;
  const onRad = x > RX - 6 && x < RX + RW + 6 && y > RT - 6 && y < FLOOR;
  const onWave = y < RT - 8 && y > RT - 110 && [232, 282, 332].some((w) => Math.abs(x - w) < 14);
  const onPipe = x < RX && Math.abs(y - flowTop) < 40;
  if (!onRad && !onWave && !onPipe && x > WALL1 && y < FLOOR) inkDots.push(dot(x, y));
}
line("text", 1.6, [...guard, ...inkDots]);

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
await art.preview(`${PREVIEW_DIR}/heat-pump-poster.png`);
if (process.argv[2] === "write")
  art.writeTs(`${DRAW_DIR}/motif-plumbing-heat-pump-radiator-solid.ts`, {
    exportName: "heatPumpRadiatorSolid",
    id: "motif/plumbing/heat-pump-radiator-solid",
    style: "solid",
    doc: "Hero bar G (printed poster, no photos): outside and inside split by the house wall. On the cold side (accent, snow falling) an outdoor heat pump; its pipes run through the wall, the flow in the hot colour (primary) and the return in the cold one (accent), to a white column radiator in front of a big hot disc, heat rising off it. Flat planes, a dark key line, stipple grain. Drawn new by the hero-art script.",
  });
