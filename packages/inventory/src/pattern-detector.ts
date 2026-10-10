/**
 * The dot/grid detector (docs/plans/studio-phase1-design.md G19; docs/PRODUCT.md banned patterns): textures and
 * REPEATABLE drawings must not read as a dot grid, polka, halftone, graph paper or a lattice of crosses.
 *
 * Pure geometry, no browser: the SVG is parsed into primitives (circle, ellipse, rect, line, polyline, polygon and path
 * subpaths with M/L/H/V/C/S/Q/T/A/Z, under translate/scale/rotate/matrix transforms), and the primitives are tested for
 * 2-D repetition:
 * - small marks (dots, small squares, small crosses) whose centres sit on a 2-D lattice: two non-parallel translation
 *   vectors that map at least 80 % of the marks onto marks, with about one mark per lattice cell;
 * - long straight lines (strokes, or thin filled bars) in two directions at least 30° apart: in a tile, one of each is
 *   enough (tiling repeats them); in a drawing, at least three of each that cross.
 *
 * A tile (a texture's data-URI tile, a `<pattern>`) repeats in x and y with its own size as the period; a REPEATABLE
 * drawing repeats in x with its width; a plain drawing does not repeat. Parallel lines in one direction, an edge, a
 * single motif and scattered grain pass.
 */

export type PatternReason = "dot-grid" | "cross-lattice" | "grid-lines";
export type PatternVerdict = { ok: true } | { ok: false; reason: PatternReason; detail: string };

/** A Drawing-like value (the composition `decor.svg` shape). */
export interface DrawingLike {
  width: number;
  height: number;
  paths: readonly { d: string; fill: string; stroke?: string; width?: number }[];
}

/** How the input repeats on a page: xy a tile, x a strip (REPEATABLE drawing), none a single drawing. */
export type Repeat = "xy" | "x" | "none";

export interface DetectOptions {
  /** Default: "xy" for SVG strings and data URIs (texture tiles), "none" for drawings. */
  repeat?: Repeat;
}

type Pt = { x: number; y: number };
type Box = { x0: number; y0: number; x1: number; y1: number };
type Seg = { a: Pt; b: Pt };
/** One drawn shape: its bounding box and its straight segments (only when it is drawn as a line, not a filled area). */
interface Prim {
  box: Box;
  segs: Seg[];
  filled: boolean;
  stroked: boolean;
}
interface Scene {
  width: number;
  height: number;
  prims: Prim[];
}

// ---------------------------------------------------------------------------------------------------------------
// Affine transforms

type M = [number, number, number, number, number, number];
const ID: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: M, p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const nums = (s: string): number[] => (s.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);

function parseTransform(t: string | undefined): M {
  let m = ID;
  if (!t) return m;
  for (const [, fn, args] of t.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const a = nums(args!);
    let n: M = ID;
    if (fn === "matrix" && a.length === 6) n = a as M;
    else if (fn === "translate") n = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    else if (fn === "scale") n = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (fn === "rotate") {
      const r = ((a[0] ?? 0) * Math.PI) / 180;
      const [cx, cy] = [a[1] ?? 0, a[2] ?? 0];
      n = mul(mul([1, 0, 0, 1, cx, cy], [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (fn === "skewX") n = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (fn === "skewY") n = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = mul(m, n);
  }
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
// Primitives

const boxOf = (pts: readonly Pt[]): Box => ({
  x0: Math.min(...pts.map((p) => p.x)),
  y0: Math.min(...pts.map((p) => p.y)),
  x1: Math.max(...pts.map((p) => p.x)),
  y1: Math.max(...pts.map((p) => p.y)),
});
const bw = (b: Box): number => b.x1 - b.x0;
const bh = (b: Box): number => b.y1 - b.y0;
const centre = (b: Box): Pt => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });

/** Points on an ellipse (a circle, ellipse or arc sampled), transformed. */
function ellipsePts(m: M, cx: number, cy: number, rx: number, ry: number, from = 0, sweep = 2 * Math.PI, rot = 0): Pt[] {
  const out: Pt[] = [];
  const n = Math.max(4, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * 16));
  for (let i = 0; i <= n; i++) {
    const t = from + (sweep * i) / n;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    out.push(apply(m, { x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) }));
  }
  return out;
}

/** SVG arc endpoint parametrisation to centre form (SVG 1.1 F.6.5), sampled. */
function arcPts(m: M, p0: Pt, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, p1: Pt): Pt[] {
  if (!rx || !ry || (p0.x === p1.x && p0.y === p1.y)) return [apply(m, p0), apply(m, p1)];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180;
  const [c, s] = [Math.cos(phi), Math.sin(phi)];
  const dx = (p0.x - p1.x) / 2;
  const dy = (p0.y - p1.y) / 2;
  const x1 = c * dx + s * dy;
  const y1 = -s * dx + c * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (k * rx * y1) / ry;
  const cyp = (-k * ry * x1) / rx;
  const cx = c * cxp - s * cyp + (p0.x + p1.x) / 2;
  const cy = s * cxp + c * cyp + (p0.y + p1.y) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number): number => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  return ellipsePts(m, cx, cy, rx, ry, t1, dt, phi);
}

/** A path's subpaths: every point that bounds it (end and control points, sampled arcs) and its straight segments. */
function pathSubpaths(d: string, m: M): { pts: Pt[]; segs: Seg[] }[] {
  const out: { pts: Pt[]; segs: Seg[] }[] = [];
  let cur: { pts: Pt[]; segs: Seg[] } | undefined;
  let p: Pt = { x: 0, y: 0 };
  let start: Pt = p;
  let lastCtrl: Pt | undefined;
  let lastCmd = "";
  const line = (q: Pt): void => {
    cur!.segs.push({ a: apply(m, p), b: apply(m, q) });
    cur!.pts.push(apply(m, q));
  };
  const begin = (q: Pt): void => {
    cur = { pts: [apply(m, q)], segs: [] };
    out.push(cur);
    start = q;
  };
  for (const [, cmd, args] of d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g)) {
    const a = nums(args!);
    const rel = cmd === cmd!.toLowerCase();
    const C = cmd!.toUpperCase();
    const at = (x: number, y: number): Pt => (rel ? { x: p.x + x, y: p.y + y } : { x, y });
    if (C === "Z") {
      if (cur && (p.x !== start.x || p.y !== start.y)) line(start);
      p = start;
      lastCmd = C;
      continue;
    }
    const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 }[C]!;
    for (let i = 0; i + arity <= a.length; i += arity) {
      const v = a.slice(i, i + arity);
      let C2 = C;
      if (C === "M" && i > 0) C2 = "L"; // extra M pairs are line-tos
      if (!cur || C2 === "M") {
        const q = C2 === "M" ? at(v[0]!, v[1]!) : p;
        begin(q);
        p = q;
        if (C2 === "M") {
          lastCtrl = undefined;
          lastCmd = "M";
          continue;
        }
      }
      if (C2 === "L") {
        const q = at(v[0]!, v[1]!);
        line(q);
        p = q;
        lastCtrl = undefined;
      } else if (C2 === "H") {
        const q = { x: rel ? p.x + v[0]! : v[0]!, y: p.y };
        line(q);
        p = q;
        lastCtrl = undefined;
      } else if (C2 === "V") {
        const q = { x: p.x, y: rel ? p.y + v[0]! : v[0]! };
        line(q);
        p = q;
        lastCtrl = undefined;
      } else if (C2 === "C" || C2 === "S" || C2 === "Q" || C2 === "T") {
        const reflect = (): Pt => (lastCtrl && "CSQT".includes(lastCmd) ? { x: 2 * p.x - lastCtrl.x, y: 2 * p.y - lastCtrl.y } : p);
        let ctrls: Pt[];
        let q: Pt;
        if (C2 === "C") [ctrls, q] = [[at(v[0]!, v[1]!), at(v[2]!, v[3]!)], at(v[4]!, v[5]!)];
        else if (C2 === "S") [ctrls, q] = [[reflect(), at(v[0]!, v[1]!)], at(v[2]!, v[3]!)];
        else if (C2 === "Q") [ctrls, q] = [[at(v[0]!, v[1]!)], at(v[2]!, v[3]!)];
        else [ctrls, q] = [[reflect()], at(v[0]!, v[1]!)];
        cur!.pts.push(...ctrls.map((c) => apply(m, c)), apply(m, q));
        lastCtrl = ctrls.at(-1);
        p = q;
      } else if (C2 === "A") {
        const q = at(v[5]!, v[6]!);
        cur!.pts.push(...arcPts(m, p, v[0]!, v[1]!, v[2]!, v[3] === 1, v[4] === 1, q));
        p = q;
        lastCtrl = undefined;
      }
      lastCmd = C2;
    }
  }
  return out;
}

const attr = (attrs: string, name: string): string | undefined => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  return m ? (m[1] ?? m[2]) : undefined;
};
const num = (attrs: string, name: string, dflt = 0): number => {
  const v = attr(attrs, name);
  return v === undefined ? dflt : (nums(v)[0] ?? dflt);
};
/** fill/stroke from an attribute or an inline style. */
const paint = (attrs: string, name: "fill" | "stroke"): string | undefined => {
  const style = attr(attrs, "style");
  const fromStyle = style && new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(style)?.[1]?.trim();
  return fromStyle || attr(attrs, name);
};

interface Ctx {
  m: M;
  fill: string;
  stroke: string;
}

function primFrom(pts: Pt[], segs: Seg[], ctx: Ctx, closedShape: boolean): Prim | undefined {
  const filled = ctx.fill !== "none" && (closedShape || pts.length > 2);
  const stroked = ctx.stroke !== "none";
  if (!filled && !stroked) return undefined;
  if (pts.length === 0) return undefined;
  return { box: boxOf(pts), segs: stroked ? segs : [], filled, stroked };
}

/** One SVG fragment (the children of a root `<svg>` or a `<pattern>`) to primitives. */
function scanElements(markup: string, base: Ctx): Prim[] {
  const prims: Prim[] = [];
  const stack: Ctx[] = [base];
  for (const [, close, tag, attrs, self] of markup.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    if (close) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const parent = stack.at(-1)!;
    const ctx: Ctx = {
      m: mul(parent.m, parseTransform(attr(attrs!, "transform"))),
      fill: paint(attrs!, "fill") ?? parent.fill,
      stroke: paint(attrs!, "stroke") ?? parent.stroke,
    };
    const t = tag!.toLowerCase();
    const a = attrs!;
    if (t === "circle" || t === "ellipse") {
      const r = num(a, "r");
      const pts = ellipsePts(ctx.m, num(a, "cx"), num(a, "cy"), t === "circle" ? r : num(a, "rx"), t === "circle" ? r : num(a, "ry"));
      const p = primFrom(pts, [], ctx, true);
      if (p) prims.push(p);
    } else if (t === "rect") {
      const [x, y, w, h] = [num(a, "x"), num(a, "y"), num(a, "width"), num(a, "height")];
      const c = [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ].map((q) => apply(ctx.m, q));
      const p = primFrom(c, c.map((q, i) => ({ a: q, b: c[(i + 1) % 4]! })), ctx, true);
      if (p) prims.push(p);
    } else if (t === "line") {
      const ends = [apply(ctx.m, { x: num(a, "x1"), y: num(a, "y1") }), apply(ctx.m, { x: num(a, "x2"), y: num(a, "y2") })];
      const p = primFrom(ends, [{ a: ends[0]!, b: ends[1]! }], { ...ctx, fill: "none" }, false);
      if (p) prims.push(p);
    } else if (t === "polyline" || t === "polygon") {
      const v = nums(attr(a, "points") ?? "");
      const pts: Pt[] = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push(apply(ctx.m, { x: v[i]!, y: v[i + 1]! }));
      const segs = pts.slice(1).map((q, i) => ({ a: pts[i]!, b: q }));
      if (t === "polygon" && pts.length > 2) segs.push({ a: pts.at(-1)!, b: pts[0]! });
      const p = primFrom(pts, segs, ctx, t === "polygon");
      if (p) prims.push(p);
    } else if (t === "path") {
      for (const sp of pathSubpaths(attr(a, "d") ?? "", ctx.m)) {
        const p = primFrom(sp.pts, sp.segs, ctx, false);
        if (p) prims.push(p);
      }
    }
    if (!self) stack.push(ctx); // popped by its closing tag
  }
  return prims;
}

/** A texture's data URI (base64 or percent-encoded) or plain SVG markup to SVG markup. */
function svgText(input: string): string {
  const s = input.trim().replace(/^url\((['"]?)(.*)\1\)$/s, "$2");
  const m = /^data:image\/svg\+xml(;[^,]*)?,(.*)$/s.exec(s);
  if (!m) return s;
  return /;base64/i.test(m[1] ?? "") ? Buffer.from(m[2]!, "base64").toString("utf8") : decodeURIComponent(m[2]!);
}

/** The scenes to test: each `<pattern>` (a tile of its own size), else the root SVG's content at its size. */
function scenesOf(svg: string): Scene[] {
  const base: Ctx = { m: ID, fill: "black", stroke: "none" };
  const patterns = [...svg.matchAll(/<pattern\b([^>]*)>([\s\S]*?)<\/pattern>/g)];
  if (patterns.length)
    return patterns.map(([, a, body]) => ({ width: num(a!, "width"), height: num(a!, "height"), prims: scanElements(body!, base) }));
  const root = /<svg\b([^>]*)>/.exec(svg)?.[1] ?? "";
  const vb = nums(attr(root, "viewBox") ?? "");
  const width = vb.length === 4 ? vb[2]! : num(root, "width");
  const height = vb.length === 4 ? vb[3]! : num(root, "height");
  const shift: M = vb.length === 4 ? [1, 0, 0, 1, -vb[0]!, -vb[1]!] : ID;
  const body = svg.replace(/<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<defs\b[\s\S]*?<\/defs>/g, "");
  return [{ width, height, prims: scanElements(body, { ...base, m: shift }) }];
}

function drawingScene(d: DrawingLike): Scene {
  const prims: Prim[] = [];
  for (const p of d.paths) {
    const ctx: Ctx = { m: ID, fill: p.fill, stroke: p.stroke ?? "none" };
    for (const sp of pathSubpaths(p.d, ID)) {
      const prim = primFrom(sp.pts, sp.segs, ctx, false);
      if (prim) prims.push(prim);
    }
  }
  return { width: d.width, height: d.height, prims };
}

// ---------------------------------------------------------------------------------------------------------------
// Repetition tests

interface Mark {
  box: Box;
  /** Has a horizontal-ish and a vertical-ish bar crossing inside it (a plus or an x). */
  cross: boolean;
}

const isThin = (b: Box): boolean => Math.min(bw(b), bh(b)) <= 0.15 * Math.max(bw(b), bh(b));
const boxesTouch = (a: Box, b: Box, pad: number): boolean => a.x0 <= b.x1 + pad && b.x0 <= a.x1 + pad && a.y0 <= b.y1 + pad && b.y0 <= a.y1 + pad;
const dirOf = (s: Seg): number => {
  const a = (Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x) * 180) / Math.PI;
  return ((a % 180) + 180) % 180;
};
const angleGap = (a: number, b: number): number => Math.min(Math.abs(a - b), 180 - Math.abs(a - b));
const len = (s: Seg): number => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);

/** Small shapes, touching ones merged (the two bars of a plus are one mark). */
function marksOf(prims: readonly Prim[], maxSize: number): Mark[] {
  const small = prims.filter((p) => Math.max(bw(p.box), bh(p.box)) <= maxSize);
  const groups: { box: Box; members: Prim[] }[] = [];
  for (const p of small) {
    const hits = groups.filter((g) => boxesTouch(g.box, p.box, 0));
    const merged = { box: p.box, members: [p] };
    for (const g of hits) {
      merged.box = { x0: Math.min(merged.box.x0, g.box.x0), y0: Math.min(merged.box.y0, g.box.y0), x1: Math.max(merged.box.x1, g.box.x1), y1: Math.max(merged.box.y1, g.box.y1) };
      merged.members.push(...g.members);
      groups.splice(groups.indexOf(g), 1);
    }
    groups.push(merged);
  }
  return groups
    .filter((g) => Math.max(bw(g.box), bh(g.box)) <= maxSize)
    .map((g) => {
      const bar = (b: Box): boolean => Math.max(bw(b), bh(b)) > 0 && Math.min(bw(b), bh(b)) <= 0.34 * Math.max(bw(b), bh(b));
      const bars = g.members.flatMap((p) => (p.filled && bar(p.box) ? [bw(p.box) >= bh(p.box) ? 0 : 90] : p.segs.filter((s) => len(s) > 0).map(dirOf)));
      const cross = bars.some((a) => bars.some((b) => angleGap(a, b) >= 45));
      return { box: g.box, cross };
    });
}

/** Points repeated by the scene's repeat (xy: 3×3 tiles; x: 3 copies across). */
function replicate<T extends Pt>(pts: readonly T[], s: Scene, repeat: Repeat): T[] {
  const out: T[] = [];
  const ys = repeat === "xy" ? [-1, 0, 1] : [0];
  const xs = repeat === "none" ? [0] : [-1, 0, 1];
  for (const i of xs) for (const j of ys) for (const p of pts) out.push({ ...p, x: p.x + i * s.width, y: p.y + j * s.height });
  return out;
}

/** Mark centres folded into the period (a dot split over a tile corner is one dot), duplicates dropped. */
function centres(marks: readonly Mark[], s: Scene, repeat: Repeat, tol: number): (Pt & { cross: boolean })[] {
  const out: (Pt & { cross: boolean })[] = [];
  const mod = (v: number, p: number): number => (p > 0 ? ((v % p) + p) % p : v);
  for (const m of marks) {
    const c = centre(m.box);
    const q = { x: repeat === "none" ? c.x : mod(c.x, s.width), y: repeat === "xy" ? mod(c.y, s.height) : c.y, cross: m.cross };
    const near = (a: number, b: number, p: number): boolean => {
      const d = Math.abs(a - b);
      return d <= tol || (p > 0 && Math.abs(d - p) <= tol);
    };
    const dup = out.find((o) => near(o.x, q.x, repeat === "none" ? 0 : s.width) && near(o.y, q.y, repeat === "xy" ? s.height : 0));
    if (dup) dup.cross ||= q.cross;
    else out.push(q);
  }
  return out;
}

/** Number of distinct rows the points form across direction v (their offsets along v's normal, clustered). */
function rowsAcross(pts: readonly Pt[], v: Pt, tol: number): number {
  const n = Math.hypot(v.x, v.y);
  const offs = pts.map((p) => (p.x * -v.y + p.y * v.x) / n).sort((a, b) => a - b);
  let rows = offs.length ? 1 : 0;
  for (let i = 1; i < offs.length; i++) if (offs[i]! - offs[i - 1]! > tol) rows++;
  return rows;
}

/**
 * Stroke-only pieces that continue a long line (a diagonal hatch's corner stubs, which join the next tile's line): part
 * of that line, not marks.
 */
function lineStubs(s: Scene, repeat: Repeat, lines: readonly Seg[]): Set<Prim> {
  const unit = Math.min(s.width, s.height) || 1;
  const tol = Math.max(0.02 * unit, 0.25);
  const shifts: Pt[] = [];
  for (const i of repeat === "none" ? [0] : [-1, 0, 1]) for (const j of repeat === "xy" ? [-1, 0, 1] : [0]) shifts.push({ x: i * s.width, y: j * s.height });
  const offLine = (p: Pt, l: Seg): number => Math.abs((l.b.x - l.a.x) * (l.a.y - p.y) - (l.a.x - p.x) * (l.b.y - l.a.y)) / len(l);
  const out = new Set<Prim>();
  for (const p of s.prims) {
    if (p.filled || p.segs.length === 0) continue;
    const onSome = p.segs.every((g) =>
      lines.some((l) => shifts.some((d) => [g.a, g.b].every((q) => offLine({ x: q.x + d.x, y: q.y + d.y }, l) <= tol))),
    );
    if (onSome) out.add(p);
  }
  return out;
}

function dotLattice(s: Scene, repeat: Repeat): PatternVerdict {
  const unit = Math.min(s.width, s.height) || Math.max(s.width, s.height) || 1;
  const maxSize = repeat === "none" ? Math.max(0.25 * unit, 0.05 * Math.max(s.width, s.height)) : 0.5 * unit;
  const stubs = lineStubs(s, repeat, longLines(s, repeat));
  const marks = marksOf(
    s.prims.filter((p) => !stubs.has(p)),
    maxSize,
  );
  if (marks.length === 0) return { ok: true };
  const sizes = marks.map((m) => Math.max(bw(m.box), bh(m.box), 0.5)).sort((a, b) => a - b);
  const tol = Math.max(0.35 * sizes[Math.floor(sizes.length / 2)]!, 0.01 * unit, 0.25);
  const central = centres(marks, s, repeat, tol);
  // A drawing needs a 3×3 block of marks (counted with its repeats) to read as a grid; a tile repeats on its own.
  if (repeat === "none" && central.length < 6) return { ok: true };
  const all = replicate(central, s, repeat);
  const has = (q: Pt): boolean => all.some((p) => Math.abs(p.x - q.x) <= tol && Math.abs(p.y - q.y) <= tol);

  // Candidate translations: from each central mark to its 8 nearest marks.
  const cands: Pt[] = [];
  for (const p of central) {
    const near = all
      .map((q) => ({ x: q.x - p.x, y: q.y - p.y }))
      .filter((d) => Math.hypot(d.x, d.y) > tol)
      .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))
      .slice(0, 8);
    for (const d of near) {
      const v = d.x < -1e-9 || (Math.abs(d.x) <= 1e-9 && d.y < 0) ? { x: -d.x, y: -d.y } : d;
      if (!cands.some((c) => Math.abs(c.x - v.x) <= tol && Math.abs(c.y - v.y) <= tol)) cands.push(v);
    }
  }
  const need = repeat === "xy" ? 0.8 : 0.6;
  const coverage = (v: Pt): number => central.filter((p) => has({ x: p.x + v.x, y: p.y + v.y }) || has({ x: p.x - v.x, y: p.y - v.y })).length / central.length;
  const lattice = cands.filter((v) => coverage(v) >= need).sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
  const v1 = lattice[0];
  if (!v1) return { ok: true };
  const l1 = Math.hypot(v1.x, v1.y);
  const v2 = lattice.find((v) => Math.abs(v1.x * v.y - v1.y * v.x) / (l1 * Math.hypot(v.x, v.y)) >= Math.sin((20 * Math.PI) / 180));
  if (!v2) return { ok: true };
  const cell = Math.abs(v1.x * v2.y - v1.y * v2.x);
  // Marks per lattice cell: about one in a dot grid; many in grain (the tile itself is the only period).
  if (repeat === "xy") {
    const perCell = (central.length * cell) / (s.width * s.height);
    if (perCell > 4) return { ok: true };
  } else if (rowsAcross(all, v1, tol) < 3 || rowsAcross(all, v2, tol) < 3) return { ok: true };
  // Dots, not tiles: a lattice of shapes that nearly touch is a fill, not dots.
  const median = sizes[Math.floor(sizes.length / 2)]!;
  if (median > 0.75 * l1) return { ok: true };
  const crosses = central.filter((p) => p.cross).length;
  const spacing = `${round(l1)} × ${round(Math.hypot(v2.x, v2.y))}`;
  return crosses >= central.length / 2
    ? { ok: false, reason: "cross-lattice", detail: `${central.length} crosses on a lattice ${spacing}` }
    : { ok: false, reason: "dot-grid", detail: `${central.length} marks on a lattice ${spacing}` };
}

const round = (n: number): number => Math.round(n * 10) / 10;

/** Long straight lines: stroked segments and thin filled bars. */
function longLines(s: Scene, repeat: Repeat): Seg[] {
  const unit = Math.min(s.width, s.height) || Math.max(s.width, s.height) || 1;
  const min = repeat === "xy" ? 0.8 * unit : 0.4 * unit;
  const out: Seg[] = [];
  for (const p of s.prims) {
    if (p.filled && isThin(p.box)) {
      const c = centre(p.box);
      const seg = bw(p.box) >= bh(p.box) ? { a: { x: p.box.x0, y: c.y }, b: { x: p.box.x1, y: c.y } } : { a: { x: c.x, y: p.box.y0 }, b: { x: c.x, y: p.box.y1 } };
      if (len(seg) >= min) out.push(seg);
      continue;
    }
    if (!p.stroked) continue;
    for (const seg of p.segs) if (len(seg) >= min) out.push(seg);
  }
  return out;
}

function gridLines(s: Scene, repeat: Repeat): PatternVerdict {
  const lines = longLines(s, repeat);
  const families: { dir: number; segs: Seg[] }[] = [];
  for (const l of lines) {
    const d = dirOf(l);
    const f = families.find((x) => angleGap(x.dir, d) <= 5);
    if (f) f.segs.push(l);
    else families.push({ dir: d, segs: [l] });
  }
  const unit = Math.min(s.width, s.height) || 1;
  const distinct = (f: { dir: number; segs: Seg[] }): number => {
    const segs = repeat === "x" ? f.segs.flatMap((g) => [-1, 0, 1].map((i) => ({ a: { x: g.a.x + i * s.width, y: g.a.y }, b: { x: g.b.x + i * s.width, y: g.b.y } }))) : f.segs;
    const v = { x: Math.cos((f.dir * Math.PI) / 180), y: Math.sin((f.dir * Math.PI) / 180) };
    return rowsAcross(
      segs.map((g) => centre(boxOf([g.a, g.b]))),
      v,
      0.02 * unit,
    );
  };
  for (let i = 0; i < families.length; i++)
    for (let j = i + 1; j < families.length; j++) {
      const [a, b] = [families[i]!, families[j]!];
      if (angleGap(a.dir, b.dir) < 30) continue;
      if (repeat === "xy") return { ok: false, reason: "grid-lines", detail: `lines at ${round(a.dir)}° and ${round(b.dir)}° across the tile` };
      const [na, nb] = [distinct(a), distinct(b)];
      if (na >= 3 && nb >= 3) {
        const ba = boxOf(a.segs.flatMap((g) => [g.a, g.b]));
        const bb = boxOf(b.segs.flatMap((g) => [g.a, g.b]));
        if (boxesTouch(ba, bb, 0)) return { ok: false, reason: "grid-lines", detail: `${na} lines at ${round(a.dir)}° cross ${nb} at ${round(b.dir)}°` };
      }
    }
  return { ok: true };
}

/**
 * Whether a tile or drawing reads as a dot grid, a lattice of crosses or grid paper. A string is SVG markup or a data
 * URI (a texture tile); an object is a Drawing.
 */
export function detectPattern(input: string | DrawingLike, opts: DetectOptions = {}): PatternVerdict {
  const scenes = typeof input === "string" ? scenesOf(svgText(input)) : [drawingScene(input)];
  const repeat = opts.repeat ?? (typeof input === "string" ? "xy" : "none");
  for (const s of scenes) {
    if (!(s.width > 0 && s.height > 0)) throw new Error("detectPattern: the SVG has no size (width/height or viewBox)");
    const grid = gridLines(s, repeat);
    if (!grid.ok) return grid;
    const dots = dotLattice(s, repeat);
    if (!dots.ok) return dots;
  }
  return { ok: true };
}
