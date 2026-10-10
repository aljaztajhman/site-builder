/**
 * Builds the design inventory's font files (@sb/spec INVENTORY_FONTS): one woff2 per family in
 * packages/render/assets/fonts/, plus LICENSES/<file>.txt (source URL and the family's OFL.txt).
 *
 * Unlike `pnpm fonts` (FONTS, from @fontsource-variable's split latin / latin-ext files), the source here is the whole
 * upright font from the google/fonts repository at GOOGLE_FONTS_COMMIT, so one harfbuzz subset to the same target set
 * (Basic Latin, Latin-1, Latin Extended-A, typographic punctuation, €, ™) keeps every glyph, its kerning included.
 * Axes other than wght are pinned (to the face's `pin` or the axis default); wght is cut to the face's declared weights.
 * Hinting is dropped (as in the fontsource files).
 *
 * Sources are downloaded once into the OS temp directory. Run with `pnpm fonts:inventory [--only <file>]`. Output is
 * committed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GOOGLE_FONTS_COMMIT, inventoryFontFaces, type InventoryFontFace } from "@sb/spec";

type AxisSetting = number | { min: number; max: number; default: number };
type SubsetFont = (
  buf: Buffer,
  text: string,
  opts: { targetFormat: "sfnt" | "woff2"; noHinting?: boolean; variationAxes?: Record<string, AxisSetting>; keepFeatures?: string[] },
) => Promise<Buffer>;
interface FkFont {
  variationAxes: Record<string, { min: number; max: number; default: number }>;
  glyphForCodePoint(cp: number): { id: number; advanceWidth: number; path: { commands: unknown[] } };
  layout(text: string): { glyphs: { advanceWidth: number }[]; positions: { xAdvance: number }[] };
}

const require = createRequire(import.meta.url);
const subsetFont = require("subset-font") as SubsetFont;
const fontkit = require("fontkit") as { create(buf: Buffer): FkFont };

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/fonts");
const CACHE = path.join(os.tmpdir(), "sb-google-fonts", GOOGLE_FONTS_COMMIT);
const RAW = `https://raw.githubusercontent.com/google/fonts/${GOOGLE_FONTS_COMMIT}/ofl`;
/** Per-file budget (packages/inventory BYTE_BUDGET.font). */
const MAX_BYTES = 120 * 1024;

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
/** Same target set as build-fonts.ts (TARGET_CODEPOINTS). */
const TARGET = [...range(0x20, 0x7e), ...range(0xa0, 0x17f), ...range(0x2010, 0x2027), 0x20ac, 0x2122];
const FEATURES = ["kern", "liga", "clig", "calt", "ccmp", "locl", "mark", "mkmk", "rlig", "case", "tnum", "lnum", "pnum"];
const REQUIRED = "čšžćđČŠŽĆĐ€„“”‚‘’–—…";

async function download(rel: string): Promise<Buffer> {
  const file = path.join(CACHE, rel);
  if (existsSync(file)) return readFileSync(file);
  const res = await fetch(`${RAW}/${rel.split("/").map(encodeURIComponent).join("/")}`);
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, buf);
  return buf;
}

async function buildFace(face: InventoryFontFace): Promise<string> {
  const src = await download(face.source);
  const axes = fontkit.create(src).variationAxes;
  const pin: Record<string, AxisSetting> = {};
  for (const [tag, a] of Object.entries(axes)) {
    if (tag === "wght") continue;
    const v = face.pin?.[tag] ?? a.default;
    if (v < a.min || v > a.max) throw new Error(`${face.family}: ${tag} ${v} outside ${a.min}–${a.max}`);
    pin[tag] = v;
  }
  for (const tag of Object.keys(face.pin ?? {})) if (!axes[tag]) throw new Error(`${face.family}: no ${tag} axis to pin`);
  const [lo, hi] = face.weights;
  const w = axes.wght;
  if (w) {
    if (lo < w.min || hi > w.max) throw new Error(`${face.family}: weights ${lo}–${hi} outside the font's ${w.min}–${w.max}`);
    if (lo > w.min || hi < w.max) pin.wght = { min: lo, max: hi, default: Math.min(Math.max(w.default, lo), hi) };
  } else if (lo !== hi) throw new Error(`${face.family}: static font, but weights ${lo}–${hi}`);
  const woff2 = await subsetFont(src, String.fromCodePoint(...TARGET), {
    targetFormat: "woff2",
    noHinting: true,
    keepFeatures: FEATURES,
    ...(Object.keys(pin).length ? { variationAxes: pin } : {}),
  });

  // Self-check: coverage (non-empty glyphs), the declared weights, the byte budget, and that č kerns like c.
  const final = fontkit.create(await subsetFont(woff2, String.fromCodePoint(...TARGET), { targetFormat: "sfnt" }));
  const missing = [...REQUIRED, ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"].filter((ch) => {
    const g = final.glyphForCodePoint(ch.codePointAt(0)!);
    return g.id === 0 || (/\p{L}/u.test(ch) && g.path.commands.length === 0);
  });
  if (missing.length) throw new Error(`${face.family}: missing glyphs ${missing.join("")}`);
  const fw = final.variationAxes.wght;
  if (w && (!fw || fw.min !== lo || fw.max !== hi)) throw new Error(`${face.family}: wght ${fw?.min}–${fw?.max}, declared ${lo}–${hi}`);
  if (woff2.length > MAX_BYTES) throw new Error(`${face.family}: ${(woff2.length / 1024).toFixed(1)} KB > ${MAX_BYTES / 1024} KB; cut its weights`);
  const kernOf = (s: string) => {
    const run = final.layout(s);
    return run.positions[0]!.xAdvance - run.glyphs[0]!.advanceWidth;
  };
  const kern = [["Tc", "Tč"], ["Vo", "Všo"], ["Ta", "Ťa"]].map(([x, y]) => `${x}:${kernOf(x!)}/${y}:${kernOf(y!)}`).join(" ");

  writeFileSync(path.join(OUT_DIR, `${face.file}.woff2`), woff2);
  const ofl = (await download(`${path.posix.dirname(face.source)}/OFL.txt`)).toString("utf8");
  if (!/SIL Open Font License,\s+Version 1\.1/.test(ofl)) throw new Error(`${face.family}: OFL.txt is not OFL 1.1`);
  const header = `${face.family}: https://github.com/google/fonts/blob/${GOOGLE_FONTS_COMMIT}/ofl/${face.source}\nSubset to Latin + Latin Extended-A (packages/render/scripts/build-inventory-fonts.ts).\n\n`;
  writeFileSync(path.join(OUT_DIR, "LICENSES", `${face.file}.txt`), header + ofl.replace(/\r\n/g, "\n"));
  const axesNote = Object.entries(pin).map(([t, v]) => `${t}=${typeof v === "number" ? v : `${v.min}–${v.max}`}`).join(" ");
  return `${`${face.file}.woff2`.padEnd(34)} ${(woff2.length / 1024).toFixed(1).padStart(6)} KB  ${face.role.padEnd(8)} ${axesNote.padEnd(22)} ${kern}`;
}

async function main(): Promise<void> {
  const i = process.argv.indexOf("--only");
  const only = i >= 0 ? process.argv[i + 1] : undefined;
  mkdirSync(path.join(OUT_DIR, "LICENSES"), { recursive: true });
  const faces = inventoryFontFaces().filter((f) => !only || f.file === only);
  if (!faces.length) throw new Error(`No inventory face ${only}`);
  const failed: string[] = [];
  for (const face of faces) {
    try {
      console.log(await buildFace(face));
    } catch (e) {
      failed.push((e as Error).message);
    }
  }
  if (failed.length) throw new Error(`Not built:\n${failed.join("\n")}`);
}

await main();
