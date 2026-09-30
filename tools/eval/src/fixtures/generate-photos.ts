/**
 * Generates stand-in photos for every fixture: tools/eval/fixtures/<id>/photos/NN.jpg.
 *
 *   pnpm fixtures:photos [--force] [--only <id>]
 *
 * Each photo is an SVG scene composed in code (colour fields, soft shapes suggesting the subject,
 * film grain) rendered with sharp, with a caption naming the subject so a vision model can write
 * sensible alt text. Deterministic: seeded by fixture id + photo index. Existing files are kept
 * unless --force is given, so the committed realistic photos (pnpm fixtures:ai-photos) are never replaced;
 * this only fills a fixture that has none.
 */
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadFixtures } from "./load.ts";

type Rng = () => number;

/** FNV-1a 32-bit hash. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG. */
function makeRng(seed: number): Rng {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (r: Rng, lo: number, hi: number) => lo + (hi - lo) * r();
const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

/** Lighten (amt > 0) or darken (amt < 0) a hex colour by a fraction. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt)),
  );
  return `#${ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")}`;
}

/** Nudge a colour slightly so repeated scenes don't look identical. */
function vary(r: Rng, hex: string, spread = 0.12): string {
  return shade(hex, between(r, -spread, spread));
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface Ctx {
  w: number;
  h: number;
  r: Rng;
  subject: string;
}

// ---------- scene building blocks ----------

function room(c: Ctx, wall: string, floor: string, horizon = 0.66): string {
  const { w, h, r } = c;
  const y = h * horizon;
  const winX = between(r, 0.08, 0.6) * w;
  return `
    <rect width="${w}" height="${y}" fill="url(#wall)"/>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(wall, 0.12)}"/><stop offset="1" stop-color="${shade(wall, -0.12)}"/></linearGradient>
    <rect y="${y}" width="${w}" height="${h - y}" fill="url(#floor)"/>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(floor, -0.15)}"/><stop offset="1" stop-color="${shade(floor, 0.1)}"/></linearGradient>
    <rect x="${winX}" y="${h * 0.1}" width="${w * 0.26}" height="${h * 0.34}" fill="${shade(wall, 0.55)}" opacity="0.85" filter="url(#soft)"/>
    <rect x="${winX - w * 0.1}" y="${h * 0.05}" width="${w * 0.46}" height="${h * 0.6}" fill="#fff8e8" opacity="0.08" filter="url(#blur)"/>`;
}

function table(c: Ctx, top: string, y: number): string {
  const { w, h } = c;
  return `
    <rect y="${y}" width="${w}" height="${h - y}" fill="url(#tbl)"/>
    <linearGradient id="tbl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(top, 0.08)}"/><stop offset="1" stop-color="${shade(top, -0.3)}"/></linearGradient>
    ${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${y + (i + 1) * (h - y) / 8}" x2="${w}" y2="${y + (i + 1) * (h - y) / 8 + c.r() * 20}" stroke="${shade(top, -0.2)}" stroke-width="3" opacity="0.35"/>`).join("")}`;
}

function person(c: Ctx, x: number, baseY: number, scale: number, clothes: string, skin = "#d9a88a", hair = "#3a2a20"): string {
  const s = scale;
  return `<g filter="url(#soft)">
    <path d="M${x - 110 * s} ${baseY} C ${x - 120 * s} ${baseY - 260 * s}, ${x - 90 * s} ${baseY - 360 * s}, ${x} ${baseY - 370 * s} C ${x + 90 * s} ${baseY - 360 * s}, ${x + 120 * s} ${baseY - 260 * s}, ${x + 110 * s} ${baseY} Z" fill="${clothes}"/>
    <rect x="${x - 22 * s}" y="${baseY - 410 * s}" width="${44 * s}" height="${50 * s}" fill="${shade(skin, -0.1)}"/>
    <ellipse cx="${x}" cy="${baseY - 460 * s}" rx="${58 * s}" ry="${70 * s}" fill="${skin}"/>
    <path d="M${x - 62 * s} ${baseY - 470 * s} C ${x - 60 * s} ${baseY - 560 * s}, ${x + 60 * s} ${baseY - 560 * s}, ${x + 62 * s} ${baseY - 470 * s} C ${x + 40 * s} ${baseY - 510 * s}, ${x - 40 * s} ${baseY - 510 * s}, ${x - 62 * s} ${baseY - 470 * s} Z" fill="${hair}"/>
  </g>`;
}

function loaf(x: number, y: number, rx: number, ry: number, crust: string): string {
  return `<g><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#crust)"/>
    <path d="M${x - rx * 0.5} ${y - ry * 0.3} L${x - rx * 0.2} ${y + ry * 0.2} M${x - rx * 0.05} ${y - ry * 0.45} L${x + rx * 0.25} ${y + ry * 0.1} M${x + rx * 0.35} ${y - ry * 0.4} L${x + rx * 0.6} ${y}" stroke="${shade(crust, 0.45)}" stroke-width="${rx * 0.06}" stroke-linecap="round"/>
    <radialGradient id="crust" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="${shade(crust, 0.25)}"/><stop offset="1" stop-color="${shade(crust, -0.35)}"/></radialGradient></g>`;
}

function plate(c: Ctx, x: number, y: number, rx: number, food: string, style: "mound" | "rolls" | "soup" | "slices"): string {
  const { r } = c;
  const ry = rx * 0.42;
  let inner = "";
  if (style === "soup") inner = `<ellipse cx="${x}" cy="${y}" rx="${rx * 0.72}" ry="${ry * 0.68}" fill="${food}"/>${Array.from({ length: 9 }, () => `<circle cx="${x + between(r, -0.5, 0.5) * rx}" cy="${y + between(r, -0.35, 0.35) * ry}" r="${rx * 0.05}" fill="${shade(food, pick(r, [0.4, -0.3]))}"/>`).join("")}`;
  if (style === "mound") inner = Array.from({ length: 22 }, () => `<circle cx="${x + between(r, -0.5, 0.5) * rx}" cy="${y + between(r, -0.4, 0.2) * ry}" r="${rx * between(r, 0.06, 0.12)}" fill="${vary(r, food, 0.2)}"/>`).join("");
  if (style === "rolls") inner = [-0.35, 0, 0.35].map((d) => `<ellipse cx="${x + d * rx}" cy="${y}" rx="${rx * 0.2}" ry="${ry * 0.5}" fill="${vary(r, food)}"/><ellipse cx="${x + d * rx}" cy="${y}" rx="${rx * 0.1}" ry="${ry * 0.25}" fill="${shade(food, -0.35)}"/>`).join("");
  if (style === "slices") inner = [-0.3, 0.05, 0.4].map((d) => `<path d="M${x + d * rx - rx * 0.2} ${y + ry * 0.3} L${x + d * rx} ${y - ry * 0.5} L${x + d * rx + rx * 0.2} ${y + ry * 0.3} Z" fill="${vary(r, food)}"/>`).join("");
  return `<g filter="url(#soft)">
    <ellipse cx="${x + rx * 0.06}" cy="${y + ry * 0.22}" rx="${rx * 1.02}" ry="${ry * 1.02}" fill="#000" opacity="0.25" filter="url(#blur)"/>
    <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#f4f1ea"/>
    <ellipse cx="${x}" cy="${y}" rx="${rx * 0.8}" ry="${ry * 0.8}" fill="#e7e2d8"/>
    ${inner}</g>`;
}

function mountains(c: Ctx, y: number): string {
  const { w, h, r } = c;
  const peaks = (base: number, amp: number, col: string) => {
    let d = `M0 ${base}`;
    for (let x = 0; x <= w; x += w / 8) d += ` L${x} ${base - between(r, 0.2, 1) * amp}`;
    return `<path d="${d} L${w} ${h} L0 ${h} Z" fill="${col}"/>`;
  };
  return `
    <rect width="${w}" height="${h}" fill="url(#sky)"/>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f9fcf"/><stop offset="1" stop-color="#d8e6ef"/></linearGradient>
    ${peaks(y, h * 0.3, "#8a9bb0")}
    ${peaks(y + h * 0.06, h * 0.18, "#5d7a6a")}
    <path d="M0 ${y + h * 0.16} C ${w * 0.3} ${y + h * 0.1}, ${w * 0.7} ${y + h * 0.2}, ${w} ${y + h * 0.13} L${w} ${h} L0 ${h} Z" fill="url(#meadow)"/>
    <linearGradient id="meadow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f9a45"/><stop offset="1" stop-color="#3f6a2a"/></linearGradient>`;
}

function animal(x: number, y: number, s: number, body: string, patches: string | null): string {
  return `<g filter="url(#soft)">
    <ellipse cx="${x}" cy="${y}" rx="${90 * s}" ry="${48 * s}" fill="${body}"/>
    ${patches ? `<ellipse cx="${x - 20 * s}" cy="${y - 10 * s}" rx="${30 * s}" ry="${20 * s}" fill="${patches}"/>` : ""}
    <ellipse cx="${x + 95 * s}" cy="${y - 30 * s}" rx="${32 * s}" ry="${24 * s}" fill="${body}"/>
    ${[-60, -30, 40, 65].map((dx) => `<rect x="${x + dx * s}" y="${y + 30 * s}" width="${12 * s}" height="${55 * s}" fill="${shade(body, -0.25)}"/>`).join("")}
  </g>`;
}

function house(c: Ctx, x: number, baseY: number, wdt: number, walls: string, roof: string, wood: boolean): string {
  const hgt = wdt * 0.55;
  const win = (wx: number, wy: number) => `<rect x="${wx}" y="${wy}" width="${wdt * 0.1}" height="${wdt * 0.12}" fill="#3b4a55"/><rect x="${wx}" y="${wy}" width="${wdt * 0.1}" height="${wdt * 0.12}" fill="none" stroke="${shade(walls, -0.3)}" stroke-width="6"/>`;
  return `<g filter="url(#soft)">
    <rect x="${x}" y="${baseY - hgt}" width="${wdt}" height="${hgt}" fill="${walls}"/>
    <path d="M${x - wdt * 0.06} ${baseY - hgt} L${x + wdt / 2} ${baseY - hgt - wdt * 0.32} L${x + wdt * 1.06} ${baseY - hgt} Z" fill="${roof}"/>
    ${wood ? `<rect x="${x}" y="${baseY - hgt * 0.62}" width="${wdt}" height="${hgt * 0.08}" fill="#6b4226"/>${Array.from({ length: 14 }, (_, i) => `<rect x="${x + (i * wdt) / 14}" y="${baseY - hgt * 0.62}" width="${wdt * 0.012}" height="${hgt * 0.2}" fill="#6b4226"/>`).join("")}` : ""}
    ${[0.12, 0.35, 0.58, 0.78].map((f) => win(x + wdt * f, baseY - hgt * 0.9)).join("")}
    ${[0.12, 0.78].map((f) => win(x + wdt * f, baseY - hgt * 0.4)).join("")}
    <rect x="${x + wdt * 0.44}" y="${baseY - hgt * 0.42}" width="${wdt * 0.13}" height="${hgt * 0.42}" fill="#4a3020"/>
  </g>`;
}

function tree(x: number, baseY: number, s: number): string {
  return `<g filter="url(#soft)"><rect x="${x - 18 * s}" y="${baseY - 260 * s}" width="${36 * s}" height="${260 * s}" fill="#4d3524"/>
    <ellipse cx="${x}" cy="${baseY - 360 * s}" rx="${200 * s}" ry="${170 * s}" fill="#4f7a34"/>
    <ellipse cx="${x - 90 * s}" cy="${baseY - 300 * s}" rx="${120 * s}" ry="${100 * s}" fill="#5f8d3f"/>
    <ellipse cx="${x + 100 * s}" cy="${baseY - 320 * s}" rx="${120 * s}" ry="${110 * s}" fill="#436b2c"/></g>`;
}

function shelf(c: Ctx, item: (x: number, y: number, s: number) => string, back: string): string {
  const { w, h, r } = c;
  const rows = 3;
  let out = `<rect width="${w}" height="${h}" fill="${back}"/>`;
  for (let i = 0; i < rows; i++) {
    const y = h * (0.3 + i * 0.26);
    out += `<rect x="0" y="${y}" width="${w}" height="${h * 0.025}" fill="#7a5436"/><rect x="0" y="${y + h * 0.025}" width="${w}" height="${h * 0.02}" fill="#000" opacity="0.2" filter="url(#blur)"/>`;
    const n = 6 + Math.floor(r() * 3);
    for (let j = 0; j < n; j++) out += item(((j + 0.5) / n) * w + between(r, -12, 12), y, Math.min(w, h) / 1200);
  }
  return out;
}

function bottle(r: Rng) {
  return (x: number, y: number, s: number) => {
    const col = pick(r, ["#4b5d1e", "#5e6f24", "#2f4a1c", "#6b5a1a"]);
    return `<g filter="url(#soft)"><rect x="${x - 34 * s}" y="${y - 210 * s}" width="${68 * s}" height="${210 * s}" rx="${14 * s}" fill="${col}"/><rect x="${x - 12 * s}" y="${y - 280 * s}" width="${24 * s}" height="${80 * s}" fill="${col}"/><rect x="${x - 30 * s}" y="${y - 150 * s}" width="${60 * s}" height="${70 * s}" fill="#efe6cf"/><rect x="${x - 20 * s}" y="${y - 200 * s}" width="${10 * s}" height="${170 * s}" fill="#fff" opacity="0.18"/></g>`;
  };
}

function jar(r: Rng, colors: string[]) {
  return (x: number, y: number, s: number) => {
    const col = pick(r, colors);
    return `<g filter="url(#soft)"><rect x="${x - 50 * s}" y="${y - 140 * s}" width="${100 * s}" height="${140 * s}" rx="${16 * s}" fill="${col}"/><rect x="${x - 54 * s}" y="${y - 165 * s}" width="${108 * s}" height="${32 * s}" fill="${pick(r, ["#b8322a", "#d8c9a0", "#2d5b8a"])}"/><rect x="${x - 36 * s}" y="${y - 100 * s}" width="${72 * s}" height="${44 * s}" fill="#f4ecd8"/></g>`;
  };
}

function tyre(x: number, y: number, s: number): string {
  return `<g filter="url(#soft)"><ellipse cx="${x}" cy="${y - 110 * s}" rx="${70 * s}" ry="${110 * s}" fill="#1d1d1f"/><ellipse cx="${x}" cy="${y - 110 * s}" rx="${34 * s}" ry="${58 * s}" fill="#4a4a4e"/>${[-40, -15, 10, 35].map((d) => `<line x1="${x - 60 * s}" y1="${y - 110 * s + d * s}" x2="${x - 40 * s}" y2="${y - 110 * s + d * s}" stroke="#333" stroke-width="${6 * s}"/>`).join("")}</g>`;
}

function car(c: Ctx, x: number, baseY: number, wdt: number, col: string, lifted: boolean): string {
  const hgt = wdt * 0.3;
  const y = lifted ? baseY - wdt * 0.2 : baseY;
  return `<g filter="url(#soft)">
    ${lifted ? `<rect x="${x + wdt * 0.1}" y="${y}" width="${wdt * 0.8}" height="${wdt * 0.03}" fill="#c9a227"/><rect x="${x + wdt * 0.15}" y="${y}" width="${wdt * 0.04}" height="${baseY - y}" fill="#8a8f96"/><rect x="${x + wdt * 0.8}" y="${y}" width="${wdt * 0.04}" height="${baseY - y}" fill="#8a8f96"/>` : ""}
    <path d="M${x} ${y - hgt * 0.35} L${x + wdt * 0.05} ${y - hgt * 0.7} L${x + wdt * 0.28} ${y - hgt * 0.78} L${x + wdt * 0.4} ${y - hgt * 1.15} L${x + wdt * 0.72} ${y - hgt * 1.15} L${x + wdt * 0.85} ${y - hgt * 0.78} L${x + wdt} ${y - hgt * 0.65} L${x + wdt} ${y - hgt * 0.3} Z" fill="${col}"/>
    <path d="M${x + wdt * 0.43} ${y - hgt * 1.08} L${x + wdt * 0.55} ${y - hgt * 1.08} L${x + wdt * 0.55} ${y - hgt * 0.8} L${x + wdt * 0.33} ${y - hgt * 0.8} Z M${x + wdt * 0.58} ${y - hgt * 1.08} L${x + wdt * 0.7} ${y - hgt * 1.08} L${x + wdt * 0.8} ${y - hgt * 0.8} L${x + wdt * 0.58} ${y - hgt * 0.8} Z" fill="#2c3a46" opacity="0.9"/>
    <rect x="${x}" y="${y - hgt * 0.36}" width="${wdt}" height="${hgt * 0.1}" fill="${shade(col, -0.3)}"/>
    ${[0.2, 0.8].map((f) => `<circle cx="${x + wdt * f}" cy="${y - hgt * 0.25}" r="${hgt * 0.3}" fill="#18181a"/><circle cx="${x + wdt * f}" cy="${y - hgt * 0.25}" r="${hgt * 0.14}" fill="#9aa0a6"/>`).join("")}
  </g>`;
}

function chair(x: number, baseY: number, s: number, col: string): string {
  return `<g filter="url(#soft)"><rect x="${x - 70 * s}" y="${baseY - 330 * s}" width="${140 * s}" height="${170 * s}" rx="${30 * s}" fill="${col}"/><rect x="${x - 85 * s}" y="${baseY - 180 * s}" width="${170 * s}" height="${60 * s}" rx="${20 * s}" fill="${shade(col, 0.1)}"/><rect x="${x - 8 * s}" y="${baseY - 120 * s}" width="${16 * s}" height="${100 * s}" fill="#8a8f96"/><ellipse cx="${x}" cy="${baseY - 15 * s}" rx="${80 * s}" ry="${16 * s}" fill="#5a5e63"/></g>`;
}

function hair(c: Ctx, col: string): string {
  const { w, h, r } = c;
  let out = `<rect width="${w}" height="${h}" fill="url(#bg)"/><radialGradient id="bg" cx="0.5" cy="0.3" r="0.9"><stop offset="0" stop-color="#e9ddd4"/><stop offset="1" stop-color="#8d7b70"/></radialGradient>`;
  out += `<ellipse cx="${w / 2}" cy="${h * 0.22}" rx="${w * 0.2}" ry="${h * 0.14}" fill="${col}" filter="url(#soft)"/>`;
  for (let i = 0; i < 70; i++) {
    const x0 = w / 2 + between(r, -0.2, 0.2) * w;
    const light = r() < 0.35;
    out += `<path d="M${x0} ${h * 0.2} C ${x0 + between(r, -80, 80)} ${h * 0.45}, ${x0 + between(r, -120, 120)} ${h * 0.7}, ${x0 + between(r, -60, 60)} ${h * between(r, 0.82, 0.97)}" stroke="${light ? shade(col, 0.55) : vary(r, col, 0.15)}" stroke-width="${between(r, 8, 22)}" fill="none" stroke-linecap="round" opacity="0.9"/>`;
  }
  return `<g filter="url(#soft)">${out}</g>`;
}

// ---------- scenes ----------

type Scene = (c: Ctx) => string;

const has = (s: string, ...words: string[]) => words.some((w) => s.includes(w));

function sceneFor(subject: string): Scene {
  const s = subject.toLowerCase();

  // People at work
  if (has(s, "frizerka striže")) return (c) => room(c, "#d8c7bd", "#6b5d55") + chair(c.w * 0.45, c.h * 0.95, c.h / 1000, "#2b2b2e") + person(c, c.w * 0.45, c.h * 0.8, c.h / 1300, "#3b3b3e", "#e0b49a", "#6b4a2e") + person(c, c.w * 0.7, c.h * 0.98, c.h / 1000, "#1f1f22");
  if (has(s, "kuhar")) return (c) => room(c, "#c9c6c0", "#5b5b5b", 0.6) + `<rect x="0" y="${c.h * 0.6}" width="${c.w}" height="${c.h * 0.4}" fill="#9aa0a6"/><rect x="${c.w * 0.1}" y="${c.h * 0.55}" width="${c.w * 0.25}" height="${c.h * 0.06}" fill="#3a3a3a"/><ellipse cx="${c.w * 0.22}" cy="${c.h * 0.5}" rx="${c.w * 0.08}" ry="${c.h * 0.05}" fill="#6d6d70"/>` + person(c, c.w * 0.6, c.h * 1.0, c.h / 1000, "#f3f3f0");
  if (has(s, "mehanik")) return (c) => room(c, "#8b9096", "#4a4d52", 0.6) + car(c, c.w * 0.05, c.h * 0.95, c.w * 0.75, "#a33a2e", false) + `<path d="M${c.w * 0.2} ${c.h * 0.6} L${c.w * 0.45} ${c.h * 0.35} L${c.w * 0.5} ${c.h * 0.38} L${c.w * 0.3} ${c.h * 0.62} Z" fill="#8e2f25"/>` + person(c, c.w * 0.78, c.h * 1.0, c.h / 1100, "#2d4c7a");
  if (has(s, "zobozdravnica")) return (c) => room(c, "#e6eef0", "#b9c4c7") + chair(c.w * 0.35, c.h * 0.95, c.h / 900, "#3d8f8a") + person(c, c.w * 0.65, c.h * 1.0, c.h / 1000, "#fbfbfb", "#e8bfa6", "#5a3b24");
  if (has(s, "pek oblikuje")) return (c) => room(c, "#d9cbb4", "#8a6a4a", 0.55) + person(c, c.w * 0.5, c.h * 0.85, c.h / 1050, "#f2efe8") + table(c, "#b8895a", c.h * 0.72) + `<ellipse cx="${c.w * 0.45}" cy="${c.h * 0.82}" rx="${c.w * 0.14}" ry="${c.h * 0.05}" fill="#efe3cc" filter="url(#soft)"/><rect x="0" y="${c.h * 0.72}" width="${c.w}" height="${c.h * 0.28}" fill="#fff" opacity="0.15"/>`;
  if (has(s, "koze", "krmita")) return (c) => mountains(c, c.h * 0.45) + `<rect x="0" y="${c.h * 0.7}" width="${c.w}" height="${c.h * 0.03}" fill="#8b6a45"/>` + animal(c.w * 0.3, c.h * 0.82, c.h / 1300, "#e9e4da", null) + animal(c.w * 0.6, c.h * 0.84, c.h / 1400, "#6d5238", null) + person(c, c.w * 0.82, c.h * 0.98, c.h / 1900, "#c0392b", "#e8bfa6", "#c79a50") + person(c, c.w * 0.92, c.h * 0.98, c.h / 2100, "#2f6fb0", "#e8bfa6", "#5a3b24");

  // Hair
  if (has(s, "lasje", "pričesk")) return (c) => hair(c, has(s, "pramen") ? "#8a5a33" : "#4a3222");

  // Food on a table
  if (has(s, "zajtrk")) return (c) => table(c, "#a8784c", 0) + plate(c, c.w * 0.3, c.h * 0.45, c.w * 0.18, "#f1d98a", "slices") + plate(c, c.w * 0.7, c.h * 0.5, c.w * 0.14, "#f6f2e8", "mound") + jar(c.r, ["#8e1f2a", "#c8641a"])(c.w * 0.5, c.h * 0.85, c.h / 900) + loaf(c.w * 0.25, c.h * 0.85, c.w * 0.12, c.h * 0.07, "#9a5a1f");
  if (has(s, "žganc")) return (c) => table(c, "#7a5234", 0) + plate(c, c.w / 2, c.h * 0.55, c.w * 0.32, "#8a6a4a", "mound");
  if (has(s, "štrukl")) return (c) => table(c, "#6b4a32", 0) + plate(c, c.w / 2, c.h * 0.55, c.w * 0.32, "#e8d2a0", "rolls");
  if (has(s, "obar")) return (c) => table(c, "#8a6446", 0) + plate(c, c.w / 2, c.h * 0.55, c.w * 0.3, "#d9a441", "soup");
  if (has(s, "zavitek")) return (c) => table(c, "#9b7450", 0) + plate(c, c.w / 2, c.h * 0.55, c.w * 0.3, "#e0b56a", "rolls");
  if (has(s, "rogljič", "pladnj")) return (c) => table(c, "#8a5a33", 0) + `<rect x="${c.w * 0.1}" y="${c.h * 0.25}" width="${c.w * 0.8}" height="${c.h * 0.55}" rx="20" fill="#3c3c3e" filter="url(#soft)"/>` + Array.from({ length: 8 }, (_, i) => loaf(c.w * (0.2 + (i % 4) * 0.2), c.h * (0.4 + Math.floor(i / 4) * 0.25), c.w * 0.07, c.h * 0.06, i % 2 ? "#c07a2a" : "#8a4e1e")).join("");
  if (has(s, "hlebc", "kruh")) return (c) => shelf(c, (x, y, sc) => loaf(x, y - 70 * sc, 110 * sc, 70 * sc, vary(c.r, "#9a5a1f", 0.15)), "#c9a57a");
  if (has(s, "pršut", "pult")) return (c) => room(c, "#d8cfc0", "#5c4a3a", 0.55) + `<rect x="0" y="${c.h * 0.55}" width="${c.w}" height="${c.h * 0.45}" fill="#6b4a32"/><rect x="0" y="${c.h * 0.5}" width="${c.w}" height="${c.h * 0.06}" fill="#e8e2d6"/>` + `<path d="M${c.w * 0.15} ${c.h * 0.5} C ${c.w * 0.18} ${c.h * 0.3}, ${c.w * 0.4} ${c.h * 0.28}, ${c.w * 0.45} ${c.h * 0.5} Z" fill="#a8423a" filter="url(#soft)"/>` + `<rect x="${c.w * 0.55}" y="${c.h * 0.36}" width="${c.w * 0.25}" height="${c.h * 0.14}" rx="18" fill="#f0d27a" filter="url(#soft)"/>`;
  if (has(s, "pogrnjena miza", "kozarc")) return (c) => room(c, "#cdbca6", "#6a5040", 0.5) + `<rect x="0" y="${c.h * 0.55}" width="${c.w}" height="${c.h * 0.45}" fill="#f2efe8"/>` + Array.from({ length: 5 }, (_, i) => `<path d="M${c.w * (0.15 + i * 0.17) - 30} ${c.h * 0.5} L${c.w * (0.15 + i * 0.17) + 30} ${c.h * 0.5} L${c.w * (0.15 + i * 0.17) + 10} ${c.h * 0.62} L${c.w * (0.15 + i * 0.17) - 10} ${c.h * 0.62} Z" fill="#7a1f2a" opacity="0.85" filter="url(#soft)"/><rect x="${c.w * (0.15 + i * 0.17) - 4}" y="${c.h * 0.62}" width="8" height="${c.h * 0.08}" fill="#ddd"/>`).join("") + plate(c, c.w * 0.3, c.h * 0.85, c.w * 0.14, "#f4f1ea", "mound") + plate(c, c.w * 0.7, c.h * 0.85, c.w * 0.14, "#f4f1ea", "mound");

  // Shelves and containers
  if (has(s, "oljčnega olja", "steklenic")) return (c) => shelf(c, bottle(c.r), "#d9c9a8");
  if (has(s, "marmelad")) return (c) => shelf(c, jar(c.r, ["#8e1f2a", "#c8641a", "#6b2a4a", "#b34a1e"]), "#cdb89a");
  if (has(s, "frizerskimi izdelki", "izdelki")) return (c) => shelf(c, jar(c.r, ["#1f1f22", "#e8e2da", "#b98a7a", "#6d7f8a"]), "#e6dcd6");
  if (has(s, "pnevmatik")) return (c) => shelf(c, tyre, "#7d8288");
  if (has(s, "soli", "košar")) return (c) => table(c, "#9b7a55", 0) + `<ellipse cx="${c.w / 2}" cy="${c.h * 0.62}" rx="${c.w * 0.36}" ry="${c.h * 0.24}" fill="#8a6038" filter="url(#soft)"/>` + Array.from({ length: 6 }, (_, i) => `<rect x="${c.w * (0.22 + (i % 3) * 0.19)}" y="${c.h * (0.38 + Math.floor(i / 3) * 0.16)}" width="${c.w * 0.15}" height="${c.h * 0.2}" rx="16" fill="${vary(c.r, "#f3f1ec", 0.05)}" filter="url(#soft)"/><rect x="${c.w * (0.24 + (i % 3) * 0.19)}" y="${c.h * (0.45 + Math.floor(i / 3) * 0.16)}" width="${c.w * 0.11}" height="${c.h * 0.05}" fill="#2d5b8a"/>`).join("");
  if (has(s, "darilni paket")) return (c) => table(c, "#a07a55", 0) + `<rect x="${c.w * 0.2}" y="${c.h * 0.35}" width="${c.w * 0.6}" height="${c.h * 0.5}" fill="#c9a36a" filter="url(#soft)"/><rect x="${c.w * 0.47}" y="${c.h * 0.35}" width="${c.w * 0.06}" height="${c.h * 0.5}" fill="#8e1f2a"/>` + bottle(c.r)(c.w * 0.32, c.h * 0.6, c.h / 1000) + jar(c.r, ["#d89a2a"])(c.w * 0.68, c.h * 0.6, c.h / 1000);

  // Buildings and views
  if (has(s, "kmečka hiša")) return (c) => mountains(c, c.h * 0.4) + house(c, c.w * 0.2, c.h * 0.85, c.w * 0.6, "#efe8da", "#6d3b2a", true);
  if (has(s, "gostiln", "pročelje")) return (c) => `<rect width="${c.w}" height="${c.h}" fill="#9fc0dc"/><rect y="${c.h * 0.85}" width="${c.w}" height="${c.h * 0.15}" fill="#8e8a82"/>` + house(c, c.w * 0.3, c.h * 0.85, c.w * 0.65, "#e9dcc2", "#7a3b2a", false) + tree(c.w * 0.18, c.h * 0.88, c.h / 900);
  if (has(s, "kamniti hiši", "vhod v trgovino")) return (c) => `<rect width="${c.w}" height="${c.h}" fill="#bfae94"/>` + Array.from({ length: 60 }, () => `<rect x="${c.r() * c.w}" y="${c.r() * c.h}" width="${between(c.r, 60, 160)}" height="${between(c.r, 40, 90)}" fill="${vary(c.r, "#bfae94", 0.15)}" stroke="#9c8c74" stroke-width="3"/>`).join("") + `<path d="M${c.w * 0.3} ${c.h} L${c.w * 0.3} ${c.h * 0.4} C ${c.w * 0.3} ${c.h * 0.25}, ${c.w * 0.7} ${c.h * 0.25}, ${c.w * 0.7} ${c.h * 0.4} L${c.w * 0.7} ${c.h} Z" fill="#3d4a3a" filter="url(#soft)"/><rect x="${c.w * 0.36}" y="${c.h * 0.5}" width="${c.w * 0.28}" height="${c.h * 0.3}" fill="#e8d59a" opacity="0.5"/>`;
  if (has(s, "terasa pod lipo")) return (c) => `<rect width="${c.w}" height="${c.h}" fill="#a9c7de"/>` + tree(c.w * 0.5, c.h * 0.7, c.h / 650) + `<rect y="${c.h * 0.68}" width="${c.w}" height="${c.h * 0.32}" fill="#9c8f7e"/>` + [0.2, 0.5, 0.8].map((f) => `<ellipse cx="${c.w * f}" cy="${c.h * 0.8}" rx="${c.w * 0.1}" ry="${c.h * 0.04}" fill="#f4f1ea" filter="url(#soft)"/><rect x="${c.w * f - 6}" y="${c.h * 0.8}" width="12" height="${c.h * 0.12}" fill="#5a4a3a"/>`).join("");
  if (has(s, "pašnik")) return (c) => mountains(c, c.h * 0.45) + animal(c.w * 0.3, c.h * 0.8, c.h / 1100, "#f1ede4", "#3a2a22") + animal(c.w * 0.65, c.h * 0.76, c.h / 1400, "#8a5a3a", "#f1ede4");
  if (has(s, "pogled", "dolin")) return (c) => mountains(c, c.h * 0.5) + `<rect y="${c.h * 0.85}" width="${c.w}" height="${c.h * 0.03}" fill="#6b4226"/>` + Array.from({ length: 9 }, (_, i) => `<rect x="${(i * c.w) / 8}" y="${c.h * 0.8}" width="14" height="${c.h * 0.2}" fill="#6b4226"/>`).join("");

  // Vehicles
  if (has(s, "avto", "dvigal")) return (c) => room(c, "#8b9096", "#4a4d52", 0.62) + car(c, c.w * 0.12, c.h * 0.9, c.w * 0.76, "#2e5f9a", true);

  // Interiors
  if (has(s, "soba", "postelj")) return (c) => room(c, "#e8dcc8", "#8a6446") + [0.12, 0.55].map((f) => `<g filter="url(#soft)"><rect x="${c.w * f}" y="${c.h * 0.55}" width="${c.w * 0.33}" height="${c.h * 0.25}" fill="#8a5a33"/><rect x="${c.w * f}" y="${c.h * 0.4}" width="${c.w * 0.33}" height="${c.h * 0.16}" fill="#7a4a28"/><rect x="${c.w * (f + 0.01)}" y="${c.h * 0.55}" width="${c.w * 0.31}" height="${c.h * 0.16}" fill="url(#check)"/></g>`).join("") + `<pattern id="check" width="60" height="60" patternUnits="userSpaceOnUse"><rect width="60" height="60" fill="#f2ede4"/><rect width="30" height="30" fill="#b3322a" opacity="0.8"/><rect x="30" y="30" width="30" height="30" fill="#b3322a" opacity="0.8"/></pattern>`;
  if (has(s, "zobozdravniš", "ordinacij")) return (c) => room(c, "#eef3f4", "#c5ced1") + chair(c.w * 0.5, c.h * 0.95, c.h / 800, "#3d8f8a") + `<circle cx="${c.w * 0.62}" cy="${c.h * 0.22}" r="${c.h * 0.05}" fill="#fffbe6" filter="url(#soft)"/><line x1="${c.w * 0.62}" y1="${c.h * 0.22}" x2="${c.w * 0.75}" y2="0" stroke="#9aa3a8" stroke-width="10"/>`;
  if (has(s, "čakalnic")) return (c) => room(c, "#f1efe9", "#a89f92") + Array.from({ length: 4 }, (_, i) => chair(c.w * (0.18 + i * 0.16), c.h * 0.92, c.h / 1300, "#3f7d4a")).join("") + `<g filter="url(#soft)"><rect x="${c.w * 0.82}" y="${c.h * 0.72}" width="${c.w * 0.08}" height="${c.h * 0.18}" fill="#c9b8a0"/><ellipse cx="${c.w * 0.86}" cy="${c.h * 0.6}" rx="${c.w * 0.08}" ry="${c.h * 0.14}" fill="#3f7a3a"/></g>`;
  if (has(s, "terapevtska miza", "fizioterap")) return (c) => room(c, "#eef0ec", "#b5a58e") + `<g filter="url(#soft)"><rect x="${c.w * 0.2}" y="${c.h * 0.58}" width="${c.w * 0.6}" height="${c.h * 0.07}" rx="16" fill="#2f6f68"/><rect x="${c.w * 0.25}" y="${c.h * 0.65}" width="${c.w * 0.03}" height="${c.h * 0.2}" fill="#9aa0a6"/><rect x="${c.w * 0.72}" y="${c.h * 0.65}" width="${c.w * 0.03}" height="${c.h * 0.2}" fill="#9aa0a6"/><rect x="${c.w * 0.62}" y="${c.h * 0.54}" width="${c.w * 0.15}" height="${c.h * 0.04}" rx="12" fill="#f4f4f0"/></g>`;
  if (has(s, "jedilnic")) return (c) => room(c, "#d9c6a8", "#6b4a32", 0.55) + [0.2, 0.5, 0.8].map((f) => `<g filter="url(#soft)"><rect x="${c.w * f - c.w * 0.12}" y="${c.h * 0.62}" width="${c.w * 0.24}" height="${c.h * 0.06}" fill="#f4f1ea"/><rect x="${c.w * f - c.w * 0.12}" y="${c.h * 0.68}" width="${c.w * 0.24}" height="${c.h * 0.1}" fill="#e6e0d4"/><rect x="${c.w * f - c.w * 0.1}" y="${c.h * 0.78}" width="${c.w * 0.02}" height="${c.h * 0.12}" fill="#5a3a24"/><rect x="${c.w * f + c.w * 0.08}" y="${c.h * 0.78}" width="${c.w * 0.02}" height="${c.h * 0.12}" fill="#5a3a24"/></g>`).join("");
  // Salon interior and fallback
  return (c) => room(c, "#d8c7bd", "#5f5550") + [0.3, 0.7].map((f) => `<rect x="${c.w * f - c.w * 0.1}" y="${c.h * 0.16}" width="${c.w * 0.2}" height="${c.h * 0.32}" fill="#dfe7ea" stroke="#2b2b2e" stroke-width="10" filter="url(#soft)"/>` + chair(c.w * f, c.h * 0.95, c.h / 1000, "#2b2b2e")).join("");
}

function caption(w: number, h: number, subject: string): string {
  const size = Math.round(Math.min(w, h) * 0.03);
  const words = `${subject} (nadomestna fotografija)`.split(" ");
  const maxChars = Math.floor((w * 0.6) / (size * 0.52));
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && (line + " " + word).length > maxChars) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  lines.push(line);
  const pad = size * 0.6;
  const boxH = lines.length * size * 1.3 + pad * 1.2;
  const boxW = Math.max(...lines.map((l) => l.length)) * size * 0.5 + pad * 2;
  const x = size;
  const y = h - size - boxH;
  return `<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="6" fill="#000" opacity="0.62"/>
    ${lines.map((l, i) => `<text x="${x + pad}" y="${y + pad + size * (1 + i * 1.3) - size * 0.15}" font-family="DejaVu Sans, Segoe UI, Arial, sans-serif" font-size="${size}" fill="#fff">${esc(l)}</text>`).join("")}`;
}

/** Compose one stand-in photo as SVG. */
function photoSvg(fixtureId: string, index: number, subject: string): { svg: string; width: number; height: number } {
  const r = makeRng(hash(`${fixtureId}:${index}`));
  const portrait = index % 3 === 1;
  const w = portrait ? 1200 : 1600;
  const h = portrait ? 1600 : 1200;
  const body = sceneFor(subject)({ w, h, r, subject });
  const tint = pick(r, ["#ffb870", "#ffd9a0", "#a0c0ff", "#ffe6c0"]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <filter id="soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="2.2"/></filter>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="30"/></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${Math.floor(r() * 1000)}"/><feColorMatrix type="saturate" values="0"/></filter>
    <radialGradient id="vignette" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#777"/>
  ${body}
  <rect width="${w}" height="${h}" fill="${tint}" opacity="0.08"/>
  <rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.1"/>
  <rect width="${w}" height="${h}" fill="url(#vignette)"/>
  ${caption(w, h, subject)}
</svg>`;
  return { svg, width: w, height: h };
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : undefined;

  let made = 0;
  let skipped = 0;
  for (const f of loadFixtures()) {
    if (only && f.id !== only) continue;
    for (const [i, p] of f.photos.entries()) {
      if (!force && existsSync(p.path)) {
        skipped++;
        continue;
      }
      mkdirSync(path.dirname(p.path), { recursive: true });
      const { svg } = photoSvg(f.id, i, p.subject);
      await sharp(Buffer.from(svg)).jpeg({ quality: 82, mozjpeg: true }).toFile(p.path);
      made++;
    }
  }
  console.log(`fixtures:photos: ${made} generated, ${skipped} kept (use --force to regenerate)`);
}

await main();
