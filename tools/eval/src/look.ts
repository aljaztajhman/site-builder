/**
 * Review sheets: one image per generated homepage that a person (or Claude) opens and actually looks
 * at, plus a desktop contact sheet across sites. Built from what `pnpm eval` leaves in eval/runs/<id>/.
 *
 *   pnpm tsx tools/eval/src/look.ts [--only <id>[,<id>]]
 *
 * Each sheet, top to bottom: the phone's first screen as a visitor sees it (sticky bar included) next
 * to the desktop first screen; the whole phone page in columns; the whole desktop page, scaled down.
 * Writes eval/look/<id>.png and eval/look/desktop-first-screens.png.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp, { type OverlayOptions } from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const runs = path.join(repoRoot, "eval/runs");
const out = path.join(repoRoot, "eval/look");

const GAP = 16;
const LABEL = 36;
const BG = "#e9ecf1";

function label(text: string, width: number): OverlayOptions["input"] {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LABEL}"><text x="0" y="24" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="#111">${esc}</text></svg>`);
}

/** A tall screenshot cut into side-by-side columns of `colHeight`, at most `maxCols`. */
async function columns(src: string | Buffer, colHeight: number, maxCols: number): Promise<{ input: Buffer; width: number; height: number }> {
  const meta = await sharp(src).metadata();
  const w = meta.width!;
  const n = Math.min(maxCols, Math.ceil(meta.height! / colHeight));
  const parts: OverlayOptions[] = [];
  for (let i = 0; i < n; i++) {
    const top = i * colHeight;
    const h = Math.min(colHeight, meta.height! - top);
    parts.push({ input: await sharp(src).extract({ left: 0, top, width: w, height: h }).toBuffer(), left: i * (w + GAP), top: 0 });
  }
  const width = n * w + (n - 1) * GAP;
  const input = await sharp({ create: { width, height: colHeight, channels: 3, background: BG } }).composite(parts).png().toBuffer();
  return { input, width, height: colHeight };
}

export async function reviewSheet(id: string): Promise<string | null> {
  const dir = path.join(runs, id);
  const f = (name: string) => path.join(dir, name);
  if (![f("home-360-first.png"), f("home-360.png"), f("home-1280-first.png"), f("home-1280.png")].every(existsSync)) return null;

  const phoneFirst = await sharp(f("home-360-first.png")).resize(360, 800, { fit: "cover", position: "top" }).png().toBuffer();
  const deskFirst = await sharp(f("home-1280-first.png")).resize(1280, 800, { fit: "cover", position: "top" }).png().toBuffer();
  const phoneFull = await columns(f("home-360.png"), 1600, 6);
  // Desktop whole page at half size, cut into columns so the sheet stays wide rather than endless.
  const deskHalf = await sharp(f("home-1280.png")).resize({ width: 640 }).png().toBuffer();
  const deskFull = await columns(deskHalf, 1600, 3);

  const rowW = [360 + GAP + 1280, phoneFull.width, deskFull.width];
  const width = Math.max(...rowW) + 2 * GAP;
  const y1 = GAP;
  const y2 = y1 + LABEL + 800 + GAP;
  const y3 = y2 + LABEL + phoneFull.height + GAP;
  const height = y3 + LABEL + deskFull.height + GAP;
  const parts: OverlayOptions[] = [
    { input: label(`${id}: phone first screen (360×800) and desktop first screen (1280×800), as a visitor sees them`, width), left: GAP, top: y1 },
    { input: phoneFirst, left: GAP, top: y1 + LABEL },
    { input: deskFirst, left: GAP + 360 + GAP, top: y1 + LABEL },
    { input: label("whole phone page, top to bottom in columns (fixed bar hidden)", width), left: GAP, top: y2 },
    { input: phoneFull.input, left: GAP, top: y2 + LABEL },
    { input: label("whole desktop page at half size, in columns", width), left: GAP, top: y3 },
    { input: deskFull.input, left: GAP, top: y3 + LABEL },
  ];
  mkdirSync(out, { recursive: true });
  const file = path.join(out, `${id}.png`);
  await sharp({ create: { width, height, channels: 3, background: BG } }).composite(parts).png().toFile(file);
  return file;
}

/** Desktop first screens of every site, labelled, two per row at half size. */
export async function desktopContactSheet(ids: string[]): Promise<string | null> {
  const shots = ids.map((id) => ({ id, file: path.join(runs, id, "home-1280-first.png") })).filter((s) => existsSync(s.file));
  if (!shots.length) return null;
  const w = 640;
  const h = 400;
  const cols = 2;
  const rows = Math.ceil(shots.length / cols);
  const W = cols * w + (cols + 1) * GAP;
  const H = rows * (h + LABEL) + (rows + 1) * GAP;
  const parts: OverlayOptions[] = [];
  for (const [i, s] of shots.entries()) {
    const x = GAP + (i % cols) * (w + GAP);
    const y = GAP + Math.floor(i / cols) * (h + LABEL + GAP);
    parts.push({ input: label(s.id, w), left: x, top: y });
    parts.push({ input: await sharp(s.file).resize(w, h, { fit: "cover", position: "top" }).png().toBuffer(), left: x, top: y + LABEL });
  }
  mkdirSync(out, { recursive: true });
  const file = path.join(out, "desktop-first-screens.png");
  await sharp({ create: { width: W, height: H, channels: 3, background: BG } }).composite(parts).png().toFile(file);
  return file;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--only");
  const only = i >= 0 ? process.argv[i + 1]?.split(",") : undefined;
  const ids = (existsSync(runs) ? readdirSync(runs) : []).filter((d) => !d.startsWith("photo") && (!only || only.includes(d))).sort();
  for (const id of ids) {
    const file = await reviewSheet(id);
    console.log(file ? `look: ${path.relative(repoRoot, file)}` : `look: ${id} has no first-screen shots yet (run pnpm eval)`);
  }
  const sheet = await desktopContactSheet(ids);
  if (sheet) console.log(`look: ${path.relative(repoRoot, sheet)}`);
}
