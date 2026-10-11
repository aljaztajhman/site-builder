/* global Buffer */
// Shared helpers for the hero-style drawings: geometry, path writing, preview, and the Drawing .ts writer.
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { fileURLToPath } from "node:url";
const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const require = createRequire(`${WT}/packages/engine/package.json`);
const sharp = require("sharp");

export const HEX = {
  background: "#ffffff", surface: "#edf2ef", text: "#221b17", muted: "#5b504a", primary: "#b4441f", onPrimary: "#ffffff",
  accent: "#c65a2e", border: "#d9e0dc", inverse: "#2b211c", onInverse: "#f5f5f5", band: "#b4441f", onBand: "#ffffff",
};

// Deterministic random.
let seed = 7;
export function srand(s) { seed = s >>> 0; }
export function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
export const rr = (a, b) => a + (b - a) * rnd();

export function f(n) {
  let s = (Math.round(n * 10) / 10).toFixed(1);
  if (s.endsWith(".0")) s = s.slice(0, -2);
  if (s === "-0") s = "0";
  if (s.startsWith("0.")) s = s.slice(1);
  else if (s.startsWith("-0.")) s = "-" + s.slice(2);
  return s;
}
export function fi(n) { const s = String(Math.round(n)); return s === "-0" ? "0" : s; }
/** Join numbers with the shortest separators. */
export function nums(arr) {
  let out = "";
  for (const v of arr) {
    const s = typeof v === "string" ? v : f(v);
    if (out === "" || s.startsWith("-")) out += s;
    else out += " " + s;
  }
  return out;
}
const cmd = (c, arr) => c + nums(arr);

export const poly = (pts, close = true) => cmd("M", [pts[0][0], pts[0][1]]) + cmd("L", pts.slice(1).flat()) + (close ? "Z" : "");

/** Closed or open smooth curve through points (Catmull-Rom → cubic). */
export function smooth(pts, close = true, t = 1) {
  const n = pts.length;
  const P = (i) => (close ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = cmd("M", pts[0]);
  const segs = close ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * t, p1[1] + ((p2[1] - p0[1]) / 6) * t];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * t, p2[1] - ((p3[1] - p1[1]) / 6) * t];
    d += cmd("C", [...c1, ...c2, ...p2]);
  }
  return d + (close ? "Z" : "");
}

export function ellipsePts(cx, cy, rx, ry, rot = 0, n = 48, a0 = 0, a1 = Math.PI * 2) {
  const out = [];
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / (a1 - a0 === Math.PI * 2 ? n : n - 1);
    const x = rx * Math.cos(a), y = ry * Math.sin(a);
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}
export function ellipse(cx, cy, rx, ry, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const p1 = [cx - rx * c, cy - rx * s], p2 = [cx + rx * c, cy + rx * s];
  const deg = (rot * 180) / Math.PI;
  return cmd("M", p1) + cmd("A", [rx, ry, deg, "0", "1", ...p2]) + cmd("A", [rx, ry, deg, "0", "1", ...p1]) + "Z";
}
export const circle = (cx, cy, r) => ellipse(cx, cy, r, r);

/** A tapered mark (gouge cut / brush stroke) from p0 to p1, half-width w at its middle, its centre bent by `bend`. */
export function lens(p0, p1, w, bend = 0) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
  const c1 = [mx + nx * 2 * (bend + w), my + ny * 2 * (bend + w)];
  const c2 = [mx + nx * 2 * (bend - w), my + ny * 2 * (bend - w)];
  // Relative after the first point: shorter numbers. Rounded positions so the relative steps add up exactly.
  const r = (v) => Math.round(v * 10) / 10;
  const a = [r(p0[0]), r(p0[1])], b = [r(p1[0]), r(p1[1])];
  const k1 = [r(c1[0]), r(c1[1])], k2 = [r(c2[0]), r(c2[1])];
  return cmd("M", a) + cmd("q", [k1[0] - a[0], k1[1] - a[1], b[0] - a[0], b[1] - a[1]]) + cmd("q", [k2[0] - b[0], k2[1] - b[1], a[0] - b[0], a[1] - b[1]]) + "z";
}
/** A mark along a polyline: tapered at both ends, width profile w(t). */
export function ribbon(pts, wOf) {
  const n = pts.length;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    const w = wOf(i / (n - 1), pts[i]);
    left.push([pts[i][0] - (dy / L) * w, pts[i][1] + (dx / L) * w]);
    right.push([pts[i][0] + (dy / L) * w, pts[i][1] - (dx / L) * w]);
  }
  return smooth([...left, ...right.reverse()], true, 0.9);
}
export const dot = (x, y) => cmd("M", [x, y]) + "h0";

/** Point-in-polygon. */
export function inside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** Segments of a polyline that lie inside a region (inside(pt) true), split where it leaves. */
export function clipLine(pts, test) {
  const out = [];
  let cur = [];
  for (const p of pts) {
    if (test(p)) cur.push(p);
    else if (cur.length) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out.filter((c) => c.length >= 2);
}

/** Splits long path data into ≤ max-char chunks at subpath boundaries. */
export function chunk(subpaths, max = 1990) {
  const out = [];
  let cur = "";
  for (const s of subpaths) {
    if (s.length > max) throw new Error(`subpath longer than ${max}: ${s.length}`);
    if (cur.length + s.length > max) { out.push(cur); cur = ""; }
    cur += s;
  }
  if (cur) out.push(cur);
  return out;
}

export class Art {
  constructor(w, h) { this.w = w; this.h = h; this.layers = []; }
  /** Adds one or more subpaths in a role, chunked into paths of ≤ 2000 characters. */
  add(fill, subpaths, opts = {}) {
    const list = Array.isArray(subpaths) ? subpaths : [subpaths];
    for (const d of chunk(list)) this.layers.push({ d, fill, ...(opts.stroke ? { stroke: opts.stroke, width: opts.width } : {}) });
  }
  stroke(role, width, subpaths) {
    const list = Array.isArray(subpaths) ? subpaths : [subpaths];
    for (const d of chunk(list)) this.layers.push({ d, fill: "none", stroke: role, width });
  }
  check() {
    const re = /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.-]{1,2000}$/;
    for (const l of this.layers) if (!re.test(l.d)) throw new Error(`bad path (${l.d.length} chars): ${l.d.slice(0, 80)}`);
    return { paths: this.layers.length, chars: this.layers.reduce((s, l) => s + l.d.length, 0) };
  }
  svg(hex = HEX, bg = "#ffffff") {
    const ps = this.layers
      .map((l) => `<path d="${l.d}" fill="${l.fill === "none" ? "none" : hex[l.fill]}" stroke="${l.stroke ? hex[l.stroke] : "none"}" stroke-width="${l.width ?? 1}" stroke-linecap="round" stroke-linejoin="round"/>`)
      .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" width="${this.w * 2}" height="${this.h * 2}"><rect width="100%" height="100%" fill="${bg}"/>${ps}</svg>`;
  }
  async preview(file) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file.replace(/\.png$/, ".svg"), this.svg());
    await sharp(Buffer.from(this.svg())).png().toFile(file);
  }
  /** Writes the Drawing data file into the components package. */
  writeTs(file, { exportName, id, style, doc }) {
    const paths = this.layers
      .map((l) => `    { d: ${JSON.stringify(l.d)}, fill: ${JSON.stringify(l.fill)}${l.stroke ? `, stroke: ${JSON.stringify(l.stroke)}, width: ${l.width}` : ""} },`)
      .join("\n");
    const src = `import type { Drawing } from "@sb/spec";\n\n/** ${doc} */\nexport const ${exportName}: Drawing = {\n  id: ${JSON.stringify(id)},\n  style: ${JSON.stringify(style)},\n  viewBox: [${this.w}, ${this.h}],\n  paths: [\n${paths}\n  ],\n};\n`;
    writeFileSync(file, src);
  }
}
export const DRAW_DIR = `${WT}/packages/components/src/groups/composed/drawings`;
export const PREVIEW_DIR = `${WT}/eval/runs/hero-styles/art-preview`;
