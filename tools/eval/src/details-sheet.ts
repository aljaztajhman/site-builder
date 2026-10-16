/**
 * pnpm details-sheet --before <dir> --after <dir> --out <dir> [--kind desk|phone|both]
 *
 * M1 type and details proof (docs/plans/m1-type-details.md C): the same pages before and after the detail switches and
 * type voices, side by side. Reads both runs' manifest.json (structure-proof.ts writes it: id, desk, phone, structure,
 * voice) and writes contact sheets of "before | after" pairs, labelled with the id and, on the after tile, the structure
 * and voice. Split over several JPEGs so each stays readable (at most MAX_PIXELS). Free: no model call.
 *
 * The pure parts (pairRows, planPairSheet) are tested in tools/eval/test/details-sheet.test.ts.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import sharp from "sharp";
import type { SheetKind } from "./set-review.ts";

// ---------------------------------------------------------------------------------------------------------------
// The pure parts

export interface RunRow {
  id: string;
  /** Absolute paths of the first-screen pictures. */
  desk: string;
  phone: string;
  structure?: string;
  voice?: string;
}

export interface Pair {
  id: string;
  before: RunRow;
  after: RunRow;
}

/** The pages both runs rendered, in the after run's order; `missing` names the ids only one run has. */
export function pairRows(before: readonly RunRow[], after: readonly RunRow[]): { pairs: Pair[]; missing: string[] } {
  const was = new Map(before.map((r) => [r.id, r]));
  const pairs = after.flatMap((a) => (was.has(a.id) ? [{ id: a.id, before: was.get(a.id)!, after: a }] : []));
  const both = new Set(pairs.map((p) => p.id));
  const missing = [...before.map((r) => r.id), ...after.map((r) => r.id)].filter((id) => !both.has(id));
  return { pairs, missing: [...new Set(missing)] };
}

/** Pixels one sheet may hold, as structure-proof's sheets (about 2 MB as a JPEG, and a size vision models read). */
export const MAX_PIXELS = 2_150_000;

const GAP = 8;
/** The space between the before and the after tile of one pair. */
const INNER = 4;
// cols: pairs per row. tileW/aspect: a 1280×800 first screen at 400 px; a 360×800 one at 170 px. labelH: two text lines.
const LAYOUT = {
  desk: { cols: 2, tileW: 400, aspect: 800 / 1280, labelH: 44 },
  phone: { cols: 4, tileW: 170, aspect: 800 / 360, labelH: 40 },
} as const;

export interface PairSheetPlan {
  cols: number;
  tileW: number;
  tileH: number;
  labelH: number;
  rowH: number;
  width: number;
  /** Pair indexes of each sheet, in order. */
  sheets: number[][];
  heights: number[];
}

/** The layout for `n` pairs: fixed tile size, as many rows per sheet as fit in `maxPixels`, then another sheet. */
export function planPairSheet(n: number, kind: SheetKind, maxPixels = MAX_PIXELS): PairSheetPlan {
  const L = LAYOUT[kind];
  const cols = Math.max(1, Math.min(L.cols, n));
  const tileH = Math.round(L.tileW * L.aspect);
  const width = cols * (2 * L.tileW + INNER + GAP) + GAP;
  const rowH = tileH + L.labelH + GAP;
  const rowsPerSheet = Math.max(1, Math.floor((maxPixels / width - GAP) / rowH));
  const perSheet = rowsPerSheet * cols;
  const sheets: number[][] = [];
  for (let i = 0; i < n; i += perSheet) sheets.push(Array.from({ length: Math.min(perSheet, n - i) }, (_, k) => i + k));
  return { cols, tileW: L.tileW, tileH, labelH: L.labelH, rowH, width, sheets, heights: sheets.map((s) => Math.ceil(s.length / cols) * rowH + GAP) };
}

// ---------------------------------------------------------------------------------------------------------------
// Rendering

function loadRun(dir: string): RunRow[] {
  const file = path.join(path.resolve(dir), "manifest.json");
  const list = JSON.parse(readFileSync(file, "utf8")) as { id: string; desk: string; phone: string; structure?: string; voice?: string }[];
  return list.map((e) => ({
    id: e.id,
    desk: path.resolve(path.dirname(file), e.desk),
    phone: path.resolve(path.dirname(file), e.phone),
    ...(e.structure ? { structure: e.structure } : {}),
    ...(e.voice ? { voice: e.voice } : {}),
  }));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A two-line label, the second line cut to fit the width. */
function label(w: number, h: number, bold: string, plain: string): Buffer {
  const size = Math.max(9, Math.round((h / 2) * 0.62));
  const max = Math.max(6, Math.floor(w / (size * 0.58)));
  const cut = (t: string) => esc(t.length > max ? `${t.slice(0, max - 1)}…` : t);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#fff"/>` +
      `<text x="3" y="${Math.round(h * 0.4)}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="bold" fill="#111">${cut(bold)}</text>` +
      `<text x="3" y="${Math.round(h * 0.86)}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" fill="#333">${cut(plain)}</text></svg>`,
  );
}

export async function writePairSheets(pairs: readonly Pair[], kind: SheetKind, dir: string): Promise<string[]> {
  const plan = planPairSheet(pairs.length, kind);
  const files: string[] = [];
  for (const [si, indexes] of plan.sheets.entries()) {
    const layers: { input: Buffer; left: number; top: number }[] = [];
    for (const [k, i] of indexes.entries()) {
      const p = pairs[i]!;
      const left = GAP + (k % plan.cols) * (2 * plan.tileW + INNER + GAP);
      const top = GAP + Math.floor(k / plan.cols) * plan.rowH;
      const tile = (r: RunRow) => sharp(readFileSync(kind === "desk" ? r.desk : r.phone)).removeAlpha().resize(plan.tileW, plan.tileH, { fit: "cover", position: "top" }).toBuffer();
      const meta = [p.after.structure, p.after.voice].filter(Boolean).join(" · ");
      layers.push(
        { input: await tile(p.before), left, top },
        { input: label(plan.tileW, plan.labelH, p.id, "before"), left, top: top + plan.tileH },
        { input: await tile(p.after), left: left + plan.tileW + INNER, top },
        { input: label(plan.tileW, plan.labelH, `${p.id} · after`, meta), left: left + plan.tileW + INNER, top: top + plan.tileH },
      );
    }
    const jpeg = await sharp({ create: { width: plan.width, height: plan.heights[si]!, channels: 3, background: "#e4e4e4" } }).composite(layers).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    const file = path.join(dir, `pairs-${kind}-${si + 1}.jpg`);
    writeFileSync(file, jpeg);
    files.push(file);
  }
  return files;
}

// ---------------------------------------------------------------------------------------------------------------
// CLI

const USAGE = "Usage: pnpm details-sheet --before <dir> --after <dir> --out <dir> [--kind desk|phone|both]";

export async function main(argv: string[], print: (line: string) => void = console.log): Promise<number> {
  let v;
  try {
    v = parseArgs({ args: argv, options: { before: { type: "string" }, after: { type: "string" }, out: { type: "string" }, kind: { type: "string" } } }).values;
  } catch (e) {
    print(`${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
    return 2;
  }
  if (!v.before || !v.after || !v.out) {
    print(`--before, --after and --out are needed.\n${USAGE}`);
    return 2;
  }
  const kind = v.kind ?? "both";
  if (kind !== "desk" && kind !== "phone" && kind !== "both") {
    print(`--kind needs desk, phone or both, got "${kind}".\n${USAGE}`);
    return 2;
  }
  let run;
  try {
    run = pairRows(loadRun(v.before), loadRun(v.after));
  } catch (e) {
    print(`${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  if (!run.pairs.length) {
    print("No page is in both runs.");
    return 1;
  }
  if (run.missing.length) print(`only in one run, left out: ${run.missing.join(", ")}`);
  const out = path.resolve(v.out);
  mkdirSync(out, { recursive: true });
  const kinds: SheetKind[] = kind === "both" ? ["desk", "phone"] : [kind];
  for (const k of kinds) for (const f of await writePairSheets(run.pairs, k, out)) print(`sheet: ${f}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
