/**
 * Builds the self-hosted font files: one variable woff2 per family in packages/render/assets/fonts/.
 *
 * @fontsource-variable packages ship Google Fonts' unicode-range subsets as separate files ("latin",
 * "latin-ext", ...), and neither the latin nor the latin-ext file alone covers Slovene (latin lacks
 * č š ž ć đ, latin-ext lacks ASCII and punctuation). This script merges the two upright `wght` files:
 *
 * 1. harfbuzz-subsets "latin" to the target set minus U+0100–017F and "latin-ext" to U+0100–017F,
 *    both keeping glyph names;
 * 2. appends the latin-ext glyphs (with their components, gvar deltas and metrics) to the latin font,
 *    extends cmap and GDEF, and gives each new accented letter the kerning of its base letter
 *    (č kerns like c) by rewriting the PairPos subtables of GPOS;
 * 3. harfbuzz-subsets the merged font to the target set and writes woff2.
 *
 * HVAR is dropped from the merged font (it does not cover the appended glyphs); advance-width variation
 * then comes from the gvar phantom points, which harfbuzz and browsers support.
 *
 * Run with `pnpm fonts`. Output is committed.
 */
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allFontFaces, type FontFace } from "@sb/spec";

type SubsetFont = (
  buf: Buffer,
  text: string,
  opts: { targetFormat: "sfnt" | "woff2"; glyphNames?: boolean; variationAxes?: Record<string, number>; keepFeatures?: string[] },
) => Promise<Buffer>;
interface FkGlyph {
  id: number;
  name: string | undefined;
  advanceWidth: number;
}
interface FkFont {
  characterSet: number[];
  numGlyphs: number;
  variationAxes: Record<string, { min: number; max: number; default: number }>;
  glyphForCodePoint(cp: number): FkGlyph;
  getGlyph(id: number): FkGlyph;
  layout(text: string): { glyphs: FkGlyph[]; positions: { xAdvance: number }[] };
}

const require = createRequire(import.meta.url);
const subsetFont = require("subset-font") as SubsetFont;
const fontkit = require("fontkit") as { create(buf: Buffer): FkFont };

const here = path.dirname(fileURLToPath(import.meta.url));
const renderDir = path.resolve(here, "..");
const OUT_DIR = path.join(renderDir, "assets/fonts");

// ---------------------------------------------------------------------------------------------
// Target character set

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}
/** Basic Latin, Latin-1 (incl. NBSP), Latin Extended-A, typographic punctuation, €, ™. */
export const TARGET_CODEPOINTS = [...range(0x20, 0x7e), ...range(0xa0, 0x17f), ...range(0x2010, 0x2027), 0x20ac, 0x2122];
const EXT_A = (cp: number) => cp >= 0x100 && cp <= 0x17f;
const text = (cps: number[]) => String.fromCodePoint(...cps);

/** OpenType features kept: shaping and kerning basics plus the numeral styles the CSS uses. Stylistic sets etc. are dropped to save bytes. */
const FEATURES = ["kern", "liga", "clig", "calt", "ccmp", "locl", "mark", "mkmk", "rlig", "case", "tnum", "lnum", "pnum"];

/** Base letter whose kerning an accented letter inherits, for letters NFD does not decompose. */
const BASE_OVERRIDES: Record<number, string> = {
  0x0110: "D", 0x0111: "d", 0x0126: "H", 0x0127: "h", 0x013f: "L", 0x0140: "l", 0x0141: "L", 0x0142: "l",
  0x014a: "N", 0x014b: "n", 0x0166: "T", 0x0167: "t", 0x0149: "n",
};
function baseChar(cp: number): number | undefined {
  const o = BASE_OVERRIDES[cp];
  if (o) return o.codePointAt(0);
  const d = String.fromCodePoint(cp).normalize("NFD");
  const b = d.codePointAt(0);
  return b !== undefined && b !== cp && b < 0x100 ? b : undefined;
}

// ---------------------------------------------------------------------------------------------
// sfnt container

function readSfnt(buf: Buffer): Map<string, Buffer> {
  const n = buf.readUInt16BE(4);
  const tables = new Map<string, Buffer>();
  for (let i = 0; i < n; i++) {
    const rec = 12 + 16 * i;
    const tag = buf.toString("latin1", rec, rec + 4);
    const off = buf.readUInt32BE(rec + 8);
    const len = buf.readUInt32BE(rec + 12);
    tables.set(tag, Buffer.from(buf.subarray(off, off + len)));
  }
  return tables;
}

function checksum(b: Buffer): number {
  const padded = b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b;
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

function writeSfnt(tables: Map<string, Buffer>): Buffer {
  const tags = [...tables.keys()].sort();
  const n = tags.length;
  const header = Buffer.alloc(12 + 16 * n);
  header.writeUInt32BE(0x00010000, 0);
  header.writeUInt16BE(n, 4);
  const es = Math.floor(Math.log2(n));
  header.writeUInt16BE(2 ** es * 16, 6);
  header.writeUInt16BE(es, 8);
  header.writeUInt16BE(n * 16 - 2 ** es * 16, 10);
  const head = tables.get("head");
  if (head) head.writeUInt32BE(0, 8);
  const bodies: Buffer[] = [];
  let off = header.length;
  tags.forEach((tag, i) => {
    const t = tables.get(tag)!;
    const rec = 12 + 16 * i;
    header.write(tag, rec, 4, "latin1");
    header.writeUInt32BE(checksum(t), rec + 4);
    header.writeUInt32BE(off, rec + 8);
    header.writeUInt32BE(t.length, rec + 12);
    const padded = Buffer.concat([t, Buffer.alloc((4 - (t.length % 4)) % 4)]);
    bodies.push(padded);
    off += padded.length;
  });
  const out = Buffer.concat([header, ...bodies]);
  if (head) {
    const headOff = header.readUInt32BE(12 + 16 * tags.indexOf("head") + 8);
    out.writeUInt32BE((0xb1b0afba - checksum(out)) >>> 0, headOff + 8);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Glyph-level tables

interface GlyphTables {
  glyphs: Buffer[];
  advances: number[];
  lsbs: number[];
  axisCount: number;
  sharedTuples: string[];
  sharedTupleBytes: Buffer[];
  variations: Buffer[];
}

function readGlyphTables(t: Map<string, Buffer>): GlyphTables {
  const head = t.get("head")!;
  const maxp = t.get("maxp")!;
  const loca = t.get("loca")!;
  const glyf = t.get("glyf")!;
  const hhea = t.get("hhea")!;
  const hmtx = t.get("hmtx")!;
  const gvar = t.get("gvar")!;
  const n = maxp.readUInt16BE(4);
  const longLoca = head.readInt16BE(50) === 1;
  const locaAt = (i: number) => (longLoca ? loca.readUInt32BE(i * 4) : loca.readUInt16BE(i * 2) * 2);
  const glyphs = range(0, n - 1).map((i) => Buffer.from(glyf.subarray(locaAt(i), locaAt(i + 1))));
  const numH = hhea.readUInt16BE(34);
  const advances: number[] = [];
  const lsbs: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i < numH) {
      advances.push(hmtx.readUInt16BE(i * 4));
      lsbs.push(hmtx.readInt16BE(i * 4 + 2));
    } else {
      advances.push(advances[numH - 1]!);
      lsbs.push(hmtx.readInt16BE(numH * 4 + (i - numH) * 2));
    }
  }
  const axisCount = gvar.readUInt16BE(4);
  const sharedCount = gvar.readUInt16BE(6);
  const sharedOff = gvar.readUInt32BE(8);
  const gvGlyphs = gvar.readUInt16BE(12);
  if (gvGlyphs !== n) throw new Error(`gvar glyphCount ${gvGlyphs} != ${n}`);
  const longOff = (gvar.readUInt16BE(14) & 1) === 1;
  const dataOff = gvar.readUInt32BE(16);
  const offAt = (i: number) => (longOff ? gvar.readUInt32BE(20 + i * 4) : gvar.readUInt16BE(20 + i * 2) * 2);
  const variations = range(0, n - 1).map((i) => Buffer.from(gvar.subarray(dataOff + offAt(i), dataOff + offAt(i + 1))));
  const sharedTupleBytes = range(0, sharedCount - 1).map((i) =>
    Buffer.from(gvar.subarray(sharedOff + i * axisCount * 2, sharedOff + (i + 1) * axisCount * 2)),
  );
  return { glyphs, advances, lsbs, axisCount, sharedTupleBytes, sharedTuples: sharedTupleBytes.map((b) => b.toString("hex")), variations };
}

/** Positions of the glyphIndex fields of a composite glyph (empty for simple glyphs). */
function componentRefs(g: Buffer): number[] {
  if (g.length === 0 || g.readInt16BE(0) >= 0) return [];
  const refs: number[] = [];
  let p = 10;
  for (;;) {
    const flags = g.readUInt16BE(p);
    refs.push(p + 2);
    p += 4 + (flags & 0x0001 ? 4 : 2);
    if (flags & 0x0008) p += 2;
    else if (flags & 0x0040) p += 4;
    else if (flags & 0x0080) p += 8;
    if (!(flags & 0x0020)) break;
  }
  return refs;
}

/** Rewrites shared-tuple indices in one glyph's GlyphVariationData. */
function remapTupleIndices(data: Buffer, axisCount: number, map: number[]): Buffer {
  if (data.length === 0) return data;
  const out = Buffer.from(data);
  const count = out.readUInt16BE(0) & 0x0fff;
  let p = 4;
  for (let i = 0; i < count; i++) {
    const idx = out.readUInt16BE(p + 2);
    if (!(idx & 0x8000)) out.writeUInt16BE((idx & 0xf000) | map[idx & 0x0fff]!, p + 2);
    p += 4 + (idx & 0x8000 ? axisCount * 2 : 0) + (idx & 0x4000 ? axisCount * 4 : 0);
  }
  return out;
}

function writeGvar(g: GlyphTables): Buffer {
  const n = g.glyphs.length;
  const sharedOff = 20 + 4 * (n + 1);
  const dataOff = sharedOff + g.sharedTupleBytes.length * g.axisCount * 2;
  const header = Buffer.alloc(dataOff);
  header.writeUInt16BE(1, 0);
  header.writeUInt16BE(0, 2);
  header.writeUInt16BE(g.axisCount, 4);
  header.writeUInt16BE(g.sharedTupleBytes.length, 6);
  header.writeUInt32BE(sharedOff, 8);
  header.writeUInt16BE(n, 12);
  header.writeUInt16BE(1, 14);
  header.writeUInt32BE(dataOff, 16);
  let o = 0;
  for (let i = 0; i < n; i++) {
    header.writeUInt32BE(o, 20 + i * 4);
    o += g.variations[i]!.length;
  }
  header.writeUInt32BE(o, 20 + n * 4);
  g.sharedTupleBytes.forEach((b, i) => b.copy(header, sharedOff + i * g.axisCount * 2));
  return Buffer.concat([header, ...g.variations]);
}

function writeCmap(map: Map<number, number>): Buffer {
  const cps = [...map.keys()].filter((c) => c <= 0xffff).sort((a, b) => a - b);
  const segs: { start: number; end: number; delta: number }[] = [];
  for (const cp of cps) {
    const delta = map.get(cp)! - cp;
    const last = segs[segs.length - 1];
    if (last && last.end === cp - 1 && last.delta === delta) last.end = cp;
    else segs.push({ start: cp, end: cp, delta });
  }
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const segCount = segs.length;
  const len = 16 + segCount * 8;
  const st = Buffer.alloc(len);
  st.writeUInt16BE(4, 0);
  st.writeUInt16BE(len, 2);
  st.writeUInt16BE(0, 4);
  st.writeUInt16BE(segCount * 2, 6);
  const es = Math.floor(Math.log2(segCount));
  st.writeUInt16BE(2 * 2 ** es, 8);
  st.writeUInt16BE(es, 10);
  st.writeUInt16BE(2 * segCount - 2 * 2 ** es, 12);
  segs.forEach((s, i) => {
    st.writeUInt16BE(s.end, 14 + i * 2);
    st.writeUInt16BE(s.start, 16 + segCount * 2 + i * 2);
    st.writeUInt16BE((s.delta + 0x10000) & 0xffff, 16 + segCount * 4 + i * 2);
    st.writeUInt16BE(0, 16 + segCount * 6 + i * 2);
  });
  const hdr = Buffer.alloc(4 + 8 * 2);
  hdr.writeUInt16BE(0, 0);
  hdr.writeUInt16BE(2, 2);
  hdr.writeUInt16BE(0, 4);
  hdr.writeUInt16BE(3, 6);
  hdr.writeUInt32BE(hdr.length, 8);
  hdr.writeUInt16BE(3, 12);
  hdr.writeUInt16BE(1, 14);
  hdr.writeUInt32BE(hdr.length, 16);
  return Buffer.concat([hdr, st]);
}

// ---------------------------------------------------------------------------------------------
// OpenType layout helpers (Coverage, ClassDef, ValueRecord, PairPos)

function readCoverage(b: Buffer, off: number): number[] {
  const fmt = b.readUInt16BE(off);
  const count = b.readUInt16BE(off + 2);
  const out: number[] = [];
  if (fmt === 1) for (let i = 0; i < count; i++) out.push(b.readUInt16BE(off + 4 + i * 2));
  else if (fmt === 2)
    for (let i = 0; i < count; i++) {
      const r = off + 4 + i * 6;
      for (let g = b.readUInt16BE(r); g <= b.readUInt16BE(r + 2); g++) out.push(g);
    }
  else throw new Error(`coverage format ${fmt}`);
  return out;
}

function writeCoverage(glyphs: number[]): Buffer {
  const gs = [...new Set(glyphs)].sort((a, b) => a - b);
  const ranges: [number, number][] = [];
  for (const g of gs) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === g - 1) last[1] = g;
    else ranges.push([g, g]);
  }
  if (gs.length * 2 <= ranges.length * 6) {
    const out = Buffer.alloc(4 + gs.length * 2);
    out.writeUInt16BE(1, 0);
    out.writeUInt16BE(gs.length, 2);
    gs.forEach((g, i) => out.writeUInt16BE(g, 4 + i * 2));
    return out;
  }
  const out = Buffer.alloc(4 + ranges.length * 6);
  out.writeUInt16BE(2, 0);
  out.writeUInt16BE(ranges.length, 2);
  let idx = 0;
  ranges.forEach(([s, e], i) => {
    out.writeUInt16BE(s, 4 + i * 6);
    out.writeUInt16BE(e, 6 + i * 6);
    out.writeUInt16BE(idx, 8 + i * 6);
    idx += e - s + 1;
  });
  return out;
}

function readClassDef(b: Buffer, off: number): Map<number, number> {
  const m = new Map<number, number>();
  if (off === 0) return m;
  const fmt = b.readUInt16BE(off);
  if (fmt === 1) {
    const start = b.readUInt16BE(off + 2);
    const count = b.readUInt16BE(off + 4);
    for (let i = 0; i < count; i++) {
      const c = b.readUInt16BE(off + 6 + i * 2);
      if (c) m.set(start + i, c);
    }
  } else if (fmt === 2) {
    const count = b.readUInt16BE(off + 2);
    for (let i = 0; i < count; i++) {
      const r = off + 4 + i * 6;
      const c = b.readUInt16BE(r + 4);
      if (c) for (let g = b.readUInt16BE(r); g <= b.readUInt16BE(r + 2); g++) m.set(g, c);
    }
  } else throw new Error(`classdef format ${fmt}`);
  return m;
}

function writeClassDef(m: Map<number, number>): Buffer {
  const gs = [...m.keys()].filter((g) => m.get(g)! > 0).sort((a, b) => a - b);
  const ranges: [number, number, number][] = [];
  for (const g of gs) {
    const c = m.get(g)!;
    const last = ranges[ranges.length - 1];
    if (last && last[1] === g - 1 && last[2] === c) last[1] = g;
    else ranges.push([g, g, c]);
  }
  const out = Buffer.alloc(4 + ranges.length * 6);
  out.writeUInt16BE(2, 0);
  out.writeUInt16BE(ranges.length, 2);
  ranges.forEach(([s, e, c], i) => {
    out.writeUInt16BE(s, 4 + i * 6);
    out.writeUInt16BE(e, 6 + i * 6);
    out.writeUInt16BE(c, 8 + i * 6);
  });
  return out;
}

function deviceSize(b: Buffer, off: number): number {
  const fmt = b.readUInt16BE(off + 4);
  if (fmt === 0x8000) return 6;
  const count = b.readUInt16BE(off + 2) - b.readUInt16BE(off) + 1;
  const bits = fmt === 1 ? 2 : fmt === 2 ? 4 : 8;
  return 6 + 2 * Math.ceil((count * bits) / 16);
}

/** 8 fields in ValueFormat bit order; numbers for placements/advances, device table bytes (or null) for devices. */
type ValueRecord = (number | Buffer | null)[];
const vrSize = (fmt: number) => 2 * [0, 1, 2, 3, 4, 5, 6, 7].filter((bit) => fmt & (1 << bit)).length;

function readValueRecord(b: Buffer, pos: number, fmt: number, base: number): ValueRecord {
  const vr: ValueRecord = [];
  for (let bit = 0; bit < 8; bit++) {
    if (!(fmt & (1 << bit))) {
      vr.push(null);
      continue;
    }
    if (bit < 4) vr.push(b.readInt16BE(pos));
    else {
      const o = b.readUInt16BE(pos);
      vr.push(o ? Buffer.from(b.subarray(base + o, base + o + deviceSize(b, base + o))) : null);
    }
    pos += 2;
  }
  return vr;
}

/** Collects device tables for one offset base; dedups identical ones. */
class DeviceArea {
  private readonly items: Buffer[] = [];
  private readonly index = new Map<string, number>();
  private size = 0;
  /** Returns the device's offset relative to the start of the area. */
  add(d: Buffer): number {
    const key = d.toString("hex");
    const hit = this.index.get(key);
    if (hit !== undefined) return hit;
    const at = this.size;
    this.items.push(d);
    this.index.set(key, at);
    this.size += d.length;
    return at;
  }
  get length(): number {
    return this.size;
  }
  bytes(): Buffer {
    return Buffer.concat(this.items);
  }
}

function writeValueRecord(out: Buffer, pos: number, fmt: number, vr: ValueRecord, deviceOffset: (d: Buffer) => number): number {
  for (let bit = 0; bit < 8; bit++) {
    if (!(fmt & (1 << bit))) continue;
    const v = vr[bit];
    if (bit < 4) out.writeInt16BE(typeof v === "number" ? v : 0, pos);
    else out.writeUInt16BE(v instanceof Buffer ? deviceOffset(v) : 0, pos);
    pos += 2;
  }
  return pos;
}

interface PairRecord {
  second: number;
  v1: ValueRecord;
  v2: ValueRecord;
}

const MAX16 = 0xffff;
class TooLarge extends Error {}

/** Serializes PairPos format 1 for the given first glyphs; device tables shared at the end. */
function writePairPos1(firsts: number[], sets: Map<number, PairRecord[]>, vf1: number, vf2: number): Buffer {
  const s1 = vrSize(vf1);
  const s2 = vrSize(vf2);
  const headerLen = 10 + firsts.length * 2;
  const psStarts: number[] = [];
  let p = headerLen;
  for (const g of firsts) {
    psStarts.push(p);
    p += 2 + sets.get(g)!.length * (2 + s1 + s2);
  }
  const coverage = writeCoverage(firsts);
  const covOff = p;
  const devStart = covOff + coverage.length;
  if (covOff > MAX16) throw new TooLarge();
  const dev = new DeviceArea();
  const body = Buffer.alloc(devStart);
  body.writeUInt16BE(1, 0);
  body.writeUInt16BE(covOff, 2);
  body.writeUInt16BE(vf1, 4);
  body.writeUInt16BE(vf2, 6);
  body.writeUInt16BE(firsts.length, 8);
  firsts.forEach((g, i) => {
    const ps = psStarts[i]!;
    body.writeUInt16BE(ps, 10 + i * 2);
    const recs = sets.get(g)!;
    body.writeUInt16BE(recs.length, ps);
    const ref = (d: Buffer) => {
      const o = devStart + dev.add(d) - ps;
      if (o > MAX16) throw new TooLarge();
      return o;
    };
    let q = ps + 2;
    for (const r of recs) {
      body.writeUInt16BE(r.second, q);
      q = writeValueRecord(body, q + 2, vf1, r.v1, ref);
      q = writeValueRecord(body, q, vf2, r.v2, ref);
    }
  });
  coverage.copy(body, covOff);
  return Buffer.concat([body, dev.bytes()]);
}

function writePairPos2(
  cov: number[],
  cd1: Map<number, number>,
  cd2: Map<number, number>,
  c1n: number,
  c2n: number,
  recs: [ValueRecord, ValueRecord][],
  vf1: number,
  vf2: number,
): Buffer {
  const s1 = vrSize(vf1);
  const s2 = vrSize(vf2);
  const covSet = new Set(cov);
  // Only first-glyph classes of covered glyphs matter; keeps ClassDef1 small when split.
  const cd1Sub = new Map([...cd1].filter(([g]) => covSet.has(g)));
  const covBytes = writeCoverage(cov);
  const cd1Bytes = writeClassDef(cd1Sub);
  const cd2Bytes = writeClassDef(cd2);
  const covOff = 16 + c1n * c2n * (s1 + s2);
  const cd1Off = covOff + covBytes.length;
  const cd2Off = cd1Off + cd1Bytes.length;
  const devOff = cd2Off + cd2Bytes.length;
  if (cd2Off > MAX16) throw new TooLarge();
  const dev = new DeviceArea();
  const head = Buffer.alloc(covOff);
  head.writeUInt16BE(2, 0);
  head.writeUInt16BE(covOff, 2);
  head.writeUInt16BE(vf1, 4);
  head.writeUInt16BE(vf2, 6);
  head.writeUInt16BE(cd1Off, 8);
  head.writeUInt16BE(cd2Off, 10);
  head.writeUInt16BE(c1n, 12);
  head.writeUInt16BE(c2n, 14);
  const ref = (d: Buffer) => {
    const o = devOff + dev.add(d);
    if (o > MAX16) throw new TooLarge();
    return o;
  };
  let p = 16;
  for (const [v1, v2] of recs) {
    p = writeValueRecord(head, p, vf1, v1, ref);
    p = writeValueRecord(head, p, vf2, v2, ref);
  }
  return Buffer.concat([head, covBytes, cd1Bytes, cd2Bytes, dev.bytes()]);
}

/** Serializes for a sorted list of first glyphs, splitting into several subtables if Offset16 overflows. */
function splitSerialize(firsts: number[], write: (firsts: number[]) => Buffer): Buffer[] {
  try {
    return [write(firsts)];
  } catch (e) {
    if (!(e instanceof TooLarge) || firsts.length < 2) throw e;
    const mid = Math.ceil(firsts.length / 2);
    return [...splitSerialize(firsts.slice(0, mid), write), ...splitSerialize(firsts.slice(mid), write)];
  }
}

/**
 * Parses a PairPos subtable, lets each new glyph inherit its base glyph's kerning, and re-serializes it
 * (as one or more subtables with disjoint coverage). Returns the new subtables and whether anything changed.
 */
function augmentPairPos(b: Buffer, off: number, newToBase: Map<number, number>): { tables: Buffer[]; changed: boolean } {
  const fmt = b.readUInt16BE(off);
  const cov = readCoverage(b, off + b.readUInt16BE(off + 2));
  const vf1 = b.readUInt16BE(off + 4);
  const vf2 = b.readUInt16BE(off + 6);
  const s1 = vrSize(vf1);
  const s2 = vrSize(vf2);
  let changed = false;
  if (fmt === 1) {
    const count = b.readUInt16BE(off + 8);
    const sets = new Map<number, PairRecord[]>();
    for (let i = 0; i < count; i++) {
      const ps = off + b.readUInt16BE(off + 10 + i * 2);
      const n = b.readUInt16BE(ps);
      const recs: PairRecord[] = [];
      for (let j = 0; j < n; j++) {
        const r = ps + 2 + j * (2 + s1 + s2);
        recs.push({ second: b.readUInt16BE(r), v1: readValueRecord(b, r + 2, vf1, ps), v2: readValueRecord(b, r + 2 + s1, vf2, ps) });
      }
      sets.set(cov[i]!, recs);
    }
    for (const [ng, bg] of newToBase) {
      const src = sets.get(bg);
      if (src && !sets.has(ng)) {
        sets.set(ng, src.map((r) => ({ ...r })));
        changed = true;
      }
    }
    for (const recs of sets.values()) {
      for (const [ng, bg] of newToBase) {
        const r = recs.find((x) => x.second === bg);
        if (r && !recs.some((x) => x.second === ng)) {
          recs.push({ ...r, second: ng });
          changed = true;
        }
      }
      recs.sort((x, y) => x.second - y.second);
    }
    const firsts = [...sets.keys()].sort((a, c) => a - c);
    return { tables: splitSerialize(firsts, (f) => writePairPos1(f, sets, vf1, vf2)), changed };
  }
  if (fmt !== 2) throw new Error(`PairPos format ${fmt}`);
  const cd1 = readClassDef(b, off + b.readUInt16BE(off + 8));
  const cd2 = readClassDef(b, off + b.readUInt16BE(off + 10));
  const c1n = b.readUInt16BE(off + 12);
  const c2n = b.readUInt16BE(off + 14);
  const recs: [ValueRecord, ValueRecord][] = [];
  for (let i = 0; i < c1n * c2n; i++) {
    const r = off + 16 + i * (s1 + s2);
    recs.push([readValueRecord(b, r, vf1, off), readValueRecord(b, r + s1, vf2, off)]);
  }
  const covSet = new Set(cov);
  for (const [ng, bg] of newToBase) {
    if (covSet.has(bg) && !covSet.has(ng)) {
      covSet.add(ng);
      const c = cd1.get(bg);
      if (c) cd1.set(ng, c);
      changed = true;
    }
    const c2 = cd2.get(bg);
    if (c2 && !cd2.has(ng)) {
      cd2.set(ng, c2);
      changed = true;
    }
  }
  const firsts = [...covSet].sort((a, c) => a - c);
  return { tables: splitSerialize(firsts, (f) => writePairPos2(f, cd1, cd2, c1n, c2n, recs, vf1, vf2)), changed };
}

/**
 * Rewrites every PairPos lookup so new glyphs kern like their base glyphs. Each modified lookup is
 * replaced by a new Extension (type 9) lookup appended to the table; its subtables sit behind 32-bit
 * offsets, so the Offset16 limits of the original layout do not apply.
 */
function augmentGpos(gposIn: Buffer, newToBase: Map<number, number>): { gpos: Buffer; subtables: number } {
  const gpos = Buffer.from(gposIn);
  const ll = gpos.readUInt16BE(8);
  const lookupCount = gpos.readUInt16BE(ll);
  const rebuilt: { index: number; flag: number; markSet: number | null; tables: Buffer[] }[] = [];
  let touched = 0;
  for (let i = 0; i < lookupCount; i++) {
    const lk = ll + gpos.readUInt16BE(ll + 2 + i * 2);
    const type = gpos.readUInt16BE(lk);
    const flag = gpos.readUInt16BE(lk + 2);
    const subCount = gpos.readUInt16BE(lk + 4);
    const markSet = flag & 0x0010 ? gpos.readUInt16BE(lk + 6 + subCount * 2) : null;
    let subs = range(0, subCount - 1).map((j) => lk + gpos.readUInt16BE(lk + 6 + j * 2));
    if (type === 9) {
      if (subs.some((s) => gpos.readUInt16BE(s + 2) !== 2)) continue;
      subs = subs.map((s) => s + gpos.readUInt32BE(s + 4));
    } else if (type !== 2) continue;
    const results = subs.map((s) => augmentPairPos(gpos, s, newToBase));
    if (!results.some((r) => r.changed)) continue;
    touched += results.filter((r) => r.changed).length;
    rebuilt.push({ index: i, flag, markSet, tables: results.flatMap((r) => r.tables) });
  }
  // Appended region: [lookups][extension subtables][PairPos subtables].
  const lookupBufs = rebuilt.map((r) => Buffer.alloc(6 + r.tables.length * 2 + (r.markSet === null ? 0 : 2)));
  const extBufs = rebuilt.map((r) => Buffer.alloc(8 * r.tables.length));
  let pos = gpos.length;
  const place = (b: Buffer) => {
    const at = pos;
    pos += b.length;
    return at;
  };
  const lookupPos = lookupBufs.map(place);
  const extPos = extBufs.map(place);
  const contents: Buffer[] = [];
  rebuilt.forEach((r, k) => {
    const lb = lookupBufs[k]!;
    const eb = extBufs[k]!;
    const lp = lookupPos[k]!;
    if (lp - ll > MAX16) throw new Error("rebuilt lookup out of Offset16 range");
    gpos.writeUInt16BE(lp - ll, ll + 2 + r.index * 2);
    lb.writeUInt16BE(9, 0);
    lb.writeUInt16BE(r.flag, 2);
    lb.writeUInt16BE(r.tables.length, 4);
    if (r.markSet !== null) lb.writeUInt16BE(r.markSet, 6 + r.tables.length * 2);
    r.tables.forEach((t, j) => {
      const ep = extPos[k]! + j * 8;
      if (ep - lp > MAX16) throw new Error("extension subtable out of Offset16 range");
      lb.writeUInt16BE(ep - lp, 6 + j * 2);
      eb.writeUInt16BE(1, j * 8);
      eb.writeUInt16BE(2, j * 8 + 2);
      eb.writeUInt32BE(place(t) - ep, j * 8 + 4);
      contents.push(t);
    });
  });
  return { gpos: Buffer.concat([gpos, ...lookupBufs, ...extBufs, ...contents]), subtables: touched };
}

// ---------------------------------------------------------------------------------------------
// Merge

interface MergeResult {
  sfnt: Buffer;
  added: number;
  kernSubtables: number;
}

function mergeFonts(latinBuf: Buffer, extBuf: Buffer): MergeResult {
  const A = readSfnt(latinBuf);
  const B = readSfnt(extBuf);
  const fa = fontkit.create(latinBuf);
  const fb = fontkit.create(extBuf);
  const ga = readGlyphTables(A);
  const gb = readGlyphTables(B);
  if (ga.axisCount !== gb.axisCount) throw new Error("axis count mismatch");

  // Shared tuples: A's list, then B's that A lacks.
  const tupleMap = gb.sharedTuples.map((key, i) => {
    const hit = ga.sharedTuples.indexOf(key);
    if (hit >= 0) return hit;
    ga.sharedTuples.push(key);
    ga.sharedTupleBytes.push(gb.sharedTupleBytes[i]!);
    return ga.sharedTuples.length - 1;
  });
  if (ga.sharedTuples.length > 0x0fff) throw new Error("too many shared tuples");

  const nameToA = new Map<string, number>();
  for (let i = fa.numGlyphs - 1; i >= 0; i--) {
    const name = fa.getGlyph(i).name;
    if (name) nameToA.set(name, i);
  }
  const memo = new Map<number, number>([[0, 0]]);
  const origin = new Map<number, number>(); // merged gid -> B gid
  const importGlyph = (bg: number): number => {
    const hit = memo.get(bg);
    if (hit !== undefined) return hit;
    const name = fb.getGlyph(bg).name;
    const inA = name ? nameToA.get(name) : undefined;
    if (inA !== undefined) {
      memo.set(bg, inA);
      return inA;
    }
    const g = Buffer.from(gb.glyphs[bg]!);
    for (const ref of componentRefs(g)) g.writeUInt16BE(importGlyph(g.readUInt16BE(ref)), ref);
    const id = ga.glyphs.length;
    ga.glyphs.push(g);
    ga.advances.push(gb.advances[bg]!);
    ga.lsbs.push(gb.lsbs[bg]!);
    ga.variations.push(remapTupleIndices(gb.variations[bg]!, gb.axisCount, tupleMap));
    memo.set(bg, id);
    origin.set(id, bg);
    return id;
  };

  const cmap = new Map<number, number>();
  for (const cp of fa.characterSet) cmap.set(cp, fa.glyphForCodePoint(cp).id);
  const newToBase = new Map<number, number>();
  for (const cp of fb.characterSet) {
    if (!EXT_A(cp) || cmap.has(cp)) continue;
    const gid = importGlyph(fb.glyphForCodePoint(cp).id);
    cmap.set(cp, gid);
    const base = baseChar(cp);
    const baseGid = base !== undefined ? cmap.get(base) : undefined;
    if (baseGid !== undefined && gid >= fa.numGlyphs) newToBase.set(gid, baseGid);
  }
  const n = ga.glyphs.length;
  if (n > MAX16) throw new Error("too many glyphs");

  // glyf + loca (long)
  const loca = Buffer.alloc((n + 1) * 4);
  let o = 0;
  const glyfParts = ga.glyphs.map((g, i) => {
    loca.writeUInt32BE(o, i * 4);
    const padded = g.length % 4 ? Buffer.concat([g, Buffer.alloc(4 - (g.length % 4))]) : g;
    o += padded.length;
    return padded;
  });
  loca.writeUInt32BE(o, n * 4);
  const hmtx = Buffer.alloc(n * 4);
  ga.advances.forEach((a, i) => {
    hmtx.writeUInt16BE(a, i * 4);
    hmtx.writeInt16BE(ga.lsbs[i]!, i * 4 + 2);
  });

  const head = Buffer.from(A.get("head")!);
  head.writeInt16BE(1, 50);
  const hhea = Buffer.from(A.get("hhea")!);
  hhea.writeUInt16BE(n, 34);
  hhea.writeUInt16BE(Math.max(...ga.advances), 10);
  const maxp = Buffer.from(A.get("maxp")!);
  const maxpB = B.get("maxp")!;
  maxp.writeUInt16BE(n, 4);
  if (maxp.length >= 32 && maxpB.length >= 32)
    for (let p = 6; p < 32; p += 2) maxp.writeUInt16BE(Math.max(maxp.readUInt16BE(p), maxpB.readUInt16BE(p)), p);
  const post = Buffer.from(A.get("post")!.subarray(0, 32));
  post.writeUInt32BE(0x00030000, 0);

  const out = new Map(A);
  out.delete("HVAR");
  out.delete("DSIG");
  out.set("glyf", Buffer.concat(glyfParts));
  out.set("loca", loca);
  out.set("hmtx", hmtx);
  out.set("head", head);
  out.set("hhea", hhea);
  out.set("maxp", maxp);
  out.set("post", post);
  out.set("gvar", writeGvar(ga));
  out.set("cmap", writeCmap(cmap));

  // GDEF glyph classes for the new glyphs (taken from latin-ext's GDEF), appended as a new ClassDef.
  const gdefA = A.get("GDEF");
  const gdefB = B.get("GDEF");
  if (gdefA && gdefB) {
    const classes = readClassDef(gdefA, gdefA.readUInt16BE(4));
    const classesB = readClassDef(gdefB, gdefB.readUInt16BE(4));
    for (const [id, bg] of origin) {
      const c = classesB.get(bg);
      if (c) classes.set(id, c);
    }
    if (gdefA.length > MAX16) throw new Error("GDEF too large to append ClassDef");
    const gdef = Buffer.concat([gdefA, writeClassDef(classes)]);
    gdef.writeUInt16BE(gdefA.length, 4);
    out.set("GDEF", gdef);
  }
  let kernSubtables = 0;
  const gposA = A.get("GPOS");
  if (gposA) {
    const r = augmentGpos(gposA, newToBase);
    out.set("GPOS", r.gpos);
    kernSubtables = r.subtables;
  }
  return { sfnt: writeSfnt(out), added: n - fa.numGlyphs, kernSubtables };
}

// ---------------------------------------------------------------------------------------------

function sourceFile(face: FontFace, subset: "latin" | "latin-ext"): string {
  const pkgDir = path.dirname(require.resolve(`${face.source}/package.json`));
  return path.join(pkgDir, "files", `${face.file}-${subset}-wght-normal.woff2`);
}

const REQUIRED = "čšžćđČŠŽĆĐ€„“”‚‘’–—…";

async function buildFace(face: FontFace): Promise<{ file: string; bytes: number; added: number; kern: number; kernCheck: string }> {
  const latin = readFileSync(sourceFile(face, "latin"));
  const ext = readFileSync(sourceFile(face, "latin-ext"));
  const axes = fontkit.create(await subsetFont(latin, "a", { targetFormat: "sfnt" })).variationAxes;
  if (!axes.wght) throw new Error(`${face.family}: no wght axis`);
  const pin: Record<string, number> = {};
  for (const [tag, a] of Object.entries(axes)) if (tag !== "wght") pin[tag] = a.default;
  const pinOpt = Object.keys(pin).length ? { variationAxes: pin } : {};
  const a = await subsetFont(latin, text(TARGET_CODEPOINTS.filter((c) => !EXT_A(c))), { targetFormat: "sfnt", glyphNames: true, keepFeatures: FEATURES, ...pinOpt });
  const b = await subsetFont(ext, text(TARGET_CODEPOINTS.filter(EXT_A)), { targetFormat: "sfnt", glyphNames: true, keepFeatures: FEATURES, ...pinOpt });
  const merged = mergeFonts(a, b);
  const woff2 = await subsetFont(merged.sfnt, text(TARGET_CODEPOINTS), { targetFormat: "woff2", keepFeatures: FEATURES });
  const outFile = path.join(OUT_DIR, `${face.file}.woff2`);
  writeFileSync(outFile, woff2);

  // Self-check: coverage, and that č kerns like c after the final harfbuzz pass.
  const final = fontkit.create(await subsetFont(woff2, text(TARGET_CODEPOINTS), { targetFormat: "sfnt" }));
  const missing = [...REQUIRED, ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"].filter(
    (ch) => final.glyphForCodePoint(ch.codePointAt(0)!).id === 0,
  );
  if (missing.length) throw new Error(`${face.family}: missing glyphs ${missing.join("")}`);
  const kernOf = (s: string) => {
    const run = final.layout(s);
    return run.positions[0]!.xAdvance - run.glyphs[0]!.advanceWidth;
  };
  const checks = [
    ["Tc", "Tč"],
    ["Cz", "Čz"],
    ["Ta", "Ťa"],
  ].map(([x, y]) => `${x}:${kernOf(x!)}/${y}:${kernOf(y!)}`);
  return { file: `${face.file}.woff2`, bytes: woff2.length, added: merged.added, kern: merged.kernSubtables, kernCheck: checks.join(" ") };
}

async function main(): Promise<void> {
  mkdirSync(path.join(OUT_DIR, "LICENSES"), { recursive: true });
  const rows: string[] = [];
  let total = 0;
  for (const face of allFontFaces()) {
    const r = await buildFace(face);
    const pkgDir = path.dirname(require.resolve(`${face.source}/package.json`));
    copyFileSync(path.join(pkgDir, "LICENSE"), path.join(OUT_DIR, "LICENSES", `${face.file}.txt`));
    total += r.bytes;
    rows.push(`${r.file.padEnd(30)} ${(r.bytes / 1024).toFixed(1).padStart(6)} KB  +${r.added} glyphs, ${r.kern} kern subtables  ${r.kernCheck}`);
    if (statSync(path.join(OUT_DIR, r.file)).size !== r.bytes) throw new Error("write failed");
  }
  console.log(rows.join("\n"));
  console.log(`total ${(total / 1024).toFixed(1)} KB for ${rows.length} families`);
}

await main();
