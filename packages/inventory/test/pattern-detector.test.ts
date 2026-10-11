import { describe, expect, it } from "vitest";
import { detectPattern, needsPatternCheck, patternCheck, type DrawingLike } from "../src/index.ts";

const svg = (w: number, h: number, body: string): string => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const dataUri = (s: string): string => `data:image/svg+xml;base64,${Buffer.from(s).toString("base64")}`;
const pctUri = (s: string): string => `data:image/svg+xml;utf8,${encodeURIComponent(s)}`;

/** A fixed pseudo-random sequence (LCG), so the grain fixture is the same on every run. */
function lcg(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
}
const grain = (() => {
  const r = lcg(7);
  const dots = Array.from({ length: 40 }, () => `<circle cx="${(r() * 60).toFixed(2)}" cy="${(r() * 60).toFixed(2)}" r="${(0.4 + r() * 0.5).toFixed(2)}" fill="#3a3a3a" fill-opacity="0.08"/>`);
  return svg(60, 60, dots.join(""));
})();

// Must fail: they read as a dot grid, polka, halftone, graph paper or a lattice of crosses once repeated.
const FAIL: [string, string | DrawingLike, "dot-grid" | "cross-lattice" | "grid-lines", { repeat?: "xy" | "x" | "none" }?][] = [
  ["dot grid tile (one dot per tile)", svg(20, 20, `<circle cx="10" cy="10" r="2" fill="#333"/>`), "dot-grid"],
  ["dot grid tile as a base64 data URI", dataUri(svg(16, 16, `<rect x="7" y="7" width="2" height="2" fill="#333"/>`)), "dot-grid"],
  ["dot grid split over the tile corners (four quarter dots)", svg(20, 20, ["0 0", "20 0", "0 20", "20 20"].map((c) => `<circle cx="${c.split(" ")[0]}" cy="${c.split(" ")[1]}" r="2"/>`).join("")), "dot-grid"],
  ["polka, offset rows", svg(24, 24, `<circle cx="6" cy="6" r="3" fill="#c33"/><circle cx="18" cy="18" r="3" fill="#c33"/>`), "dot-grid"],
  [
    "halftone (dots of falling size on a lattice)",
    svg(40, 40, [0, 1, 2, 3].flatMap((i) => [0, 1, 2, 3].map((j) => `<circle cx="${5 + 10 * i}" cy="${5 + 10 * j}" r="${(3 - 0.5 * j).toFixed(1)}"/>`)).join("")),
    "dot-grid",
  ],
  ["graph paper tile (one rule each way)", svg(20, 20, `<path d="M0 0.5 H20 M0.5 0 V20" stroke="#bcd" stroke-width="1" fill="none"/>`), "grid-lines"],
  ["graph paper from thin filled bars, percent-encoded", pctUri(svg(24, 24, `<rect x="0" y="0" width="24" height="1" fill="#ccc"/><rect x="0" y="0" width="1" height="24" fill="#ccc"/>`)), "grid-lines"],
  ["graph paper inside a <pattern>", `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><pattern id="g" width="10" height="10" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="10" y2="0" stroke="#999"/><line x1="0" y1="0" x2="0" y2="10" stroke="#999"/></pattern></defs><rect width="200" height="200" fill="url(#g)"/></svg>`, "grid-lines"],
  ["plus-sign lattice", svg(16, 16, `<path d="M6 8 H10 M8 6 V10" stroke="#333" stroke-width="1" fill="none"/>`), "cross-lattice"],
  ["plus-sign lattice, translated group of filled bars", svg(20, 20, `<g transform="translate(10 10)" fill="#333"><rect x="-3" y="-0.5" width="6" height="1"/><rect x="-0.5" y="-3" width="1" height="6"/></g>`), "cross-lattice"],
  [
    "a drawing that is a 5×5 dot grid (no repeat)",
    { width: 100, height: 100, paths: [{ d: [0, 1, 2, 3, 4].flatMap((i) => [0, 1, 2, 3, 4].map((j) => `M${10 + 20 * i} ${10 + 20 * j}a2 2 0 1 0 4 0a2 2 0 1 0 -4 0`)).join(""), fill: "ink" }] },
    "dot-grid",
  ],
  [
    "a drawing that is graph paper (5 × 5 rules)",
    { width: 100, height: 100, paths: [{ d: [10, 30, 50, 70, 90].map((v) => `M0 ${v}H100M${v} 0V100`).join(""), fill: "none", stroke: "ink", width: 1 }] },
    "grid-lines",
  ],
  [
    "a REPEATABLE strip with three rows of dots",
    { width: 12, height: 36, paths: [{ d: "M4 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M4 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M4 30a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", fill: "ink" }] },
    "dot-grid",
    { repeat: "x" },
  ],
];

// Must pass: one direction of lines, an edge, a single motif, grain.
const PASS: [string, string | DrawingLike, { repeat?: "xy" | "x" | "none" }?][] = [
  ["pinstripe tile (lines in one direction)", svg(12, 12, `<path d="M0 6 H12" stroke="#ddd" stroke-width="1" fill="none"/>`)],
  ["diagonal hatch tile (one direction)", svg(10, 10, `<path d="M-1 1 L1 -1 M0 10 L10 0 M9 11 L11 9" stroke="#ddd" stroke-width="1" fill="none"/>`)],
  ["ruled lines drawing (four horizontal rules)", { width: 200, height: 60, paths: [{ d: "M0 10H200M0 25H200M0 40H200M0 55H200", fill: "none", stroke: "line", width: 1 }] }],
  [
    "lace / scallop edge, REPEATABLE, with one row of holes",
    {
      width: 40,
      height: 16,
      paths: [
        { d: "M0 0H40V6A5 5 0 0 1 30 6A5 5 0 0 1 20 6A5 5 0 0 1 10 6A5 5 0 0 1 0 6Z", fill: "surface" },
        { d: "M3.5 3a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M13.5 3a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M23.5 3a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M33.5 3a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0", fill: "background" },
      ],
    },
    { repeat: "x" },
  ],
  [
    "single drawing (a house with two windows)",
    {
      width: 48,
      height: 48,
      paths: [
        { d: "M8 40V20L24 8L40 20V40Z", fill: "none", stroke: "ink", width: 2 },
        { d: "M20 40V30H28V40", fill: "none", stroke: "ink", width: 2 },
        { d: "M12 24h5v5h-5ZM31 24h5v5h-5Z", fill: "accent" },
      ],
    },
  ],
  ["single drawing as an SVG string, not tiled", svg(64, 64, `<path d="M8 56 C 20 20, 44 20, 56 56" stroke="#333" fill="none" stroke-width="2"/><circle cx="32" cy="30" r="4"/>`), { repeat: "none" }],
  ["scattered grain tile", grain],
  ["scattered grain tile as a data URI", dataUri(grain)],
];

describe("dot/grid detector", () => {
  it.each(FAIL)("fails: %s", (_name, input, reason, opts) => {
    const v = detectPattern(input, opts);
    expect(v.ok).toBe(false);
    expect(v.ok ? undefined : v.reason).toBe(reason);
  });

  it.each(PASS)("passes: %s", (_name, input, opts) => {
    expect(detectPattern(input, opts)).toEqual({ ok: true });
  });

  it("a pinstripe tile becomes graph paper when a crossing rule is added", () => {
    expect(detectPattern(svg(12, 12, `<path d="M0 6 H12" stroke="#ddd"/>`)).ok).toBe(true);
    expect(detectPattern(svg(12, 12, `<path d="M0 6 H12 M6 0 V12" stroke="#ddd"/>`))).toMatchObject({ ok: false, reason: "grid-lines" });
  });

  it("a single dot drawing is fine; tiled it is a dot grid", () => {
    const dot = svg(20, 20, `<circle cx="10" cy="10" r="2"/>`);
    expect(detectPattern(dot, { repeat: "none" })).toEqual({ ok: true });
    expect(detectPattern(dot, { repeat: "x" })).toEqual({ ok: true });
    expect(detectPattern(dot)).toMatchObject({ ok: false, reason: "dot-grid" });
  });

  it("refuses an SVG without a size", () => {
    expect(() => detectPattern(`<svg><circle cx="1" cy="1" r="1"/></svg>`)).toThrow(/no size/);
  });
});

describe("the per-asset check", () => {
  it("runs for textures (REPEATABLE drawings join with I5) and fails a texture without a tile", () => {
    expect(needsPatternCheck({ kind: "texture" })).toBe(true);
    expect(needsPatternCheck({ kind: "motif" })).toBe(false);
    expect(patternCheck({ id: "texture/paper" }, {})).toMatchObject({ ok: false, reason: "no-tile" });
    expect(patternCheck({ id: "texture/dots" }, { "texture/dots": { tile: svg(20, 20, `<circle cx="10" cy="10" r="2"/>`) } })).toMatchObject({ ok: false, reason: "dot-grid" });
    expect(patternCheck({ id: "texture/grain" }, { "texture/grain": { tile: grain } })).toEqual({ ok: true });
  });
});
